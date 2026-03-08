from __future__ import annotations

import logging
import re
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone

import app.database as _database
from app.models.analysis import new_analysis_doc
from app.models.product import new_product_doc
from app.schemas.analysis import BrandInfo, NicheAnalysisResponse, PriceRange
from app.services.keepa_service import keepa_service
from app.services.scraper import scraper

logger = logging.getLogger(__name__)

# How long before an analysis is considered stale and needs re-scraping
ANALYSIS_FRESH_HOURS = 24


class NicheAnalyzer:
    async def analyze_niche(
        self, keyword: str, pages: int, db_ref=None, force: bool = False,
        parent_keyword: str | None = None,
    ) -> NicheAnalysisResponse:
        normalized = keyword.strip().lower()

        # --- Dedup: check if we already analyzed this keyword recently ---
        existing = await _database.db.niche_analyses.find_one(
            {"keyword": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}},
            sort=[("created_at", -1)],
        )

        if existing and not force:
            # Check if cached doc has the enriched fields (breakdowns, saturation, etc.)
            has_enriched = bool(existing.get("demand_breakdown"))
            created = existing["created_at"]
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age = datetime.now(timezone.utc) - created
            if age < timedelta(hours=ANALYSIS_FRESH_HOURS) and has_enriched:
                logger.info(
                    "Returning cached analysis #%d for '%s' (age: %s)",
                    existing["id"], keyword, age,
                )
                resp = self._doc_to_response(existing)
                resp.is_cached = True
                return resp
            else:
                reason = "stale" if age >= timedelta(hours=ANALYSIS_FRESH_HOURS) else "missing enriched data"
                logger.info(
                    "Analysis #%d for '%s' needs refresh (%s, age: %s), re-scraping...",
                    existing["id"], keyword, reason, age,
                )
        elif force:
            logger.info("Force re-scrape requested for '%s'", keyword)

        # 1. Scrape products
        raw_products, search_result_count = await scraper.search_products_multi_page(keyword, pages)

        if not raw_products:
            raise ValueError(f"No products found for keyword: {keyword}")

        # 2. Save products to DB
        await self._save_products(raw_products)

        # 2b. Enrich with Keepa historical data (top 15 ASINs)
        keepa_data = None
        top_asins = [p["asin"] for p in raw_products if p.get("asin")][:15]
        if top_asins:
            try:
                keepa_data = await keepa_service.enrich_asins(top_asins, days=90)
                if keepa_data:
                    logger.info(
                        "Keepa enrichment for '%s': %d products, confidence %d%%",
                        keyword, keepa_data.get("keepa_products_analyzed", 0),
                        keepa_data.get("data_confidence", 0),
                    )
            except Exception as exc:
                logger.warning("Keepa enrichment failed for '%s': %s", keyword, exc)

        # 3. Calculate metrics (filter None explicitly — .get() returns None when key exists with None value)
        prices = [p["price"] for p in raw_products if p.get("price") is not None]
        ratings = [p["rating"] for p in raw_products if p.get("rating") is not None]
        reviews = [p["reviews_count"] for p in raw_products if p.get("reviews_count") is not None]
        brands = [p["brand"] for p in raw_products if p.get("brand")]

        # Price stats
        avg_price = statistics.mean(prices) if prices else None
        min_price = min(prices) if prices else None
        max_price = max(prices) if prices else None
        median_price = statistics.median(prices) if prices else None

        # Rating/review stats
        avg_rating = round(statistics.mean(ratings), 2) if ratings else None
        avg_reviews = round(statistics.mean(reviews), 1) if reviews else None

        # Brand analysis
        brand_counter = Counter(brands)
        total_branded = len(brands)
        top_brands_data = []
        for brand_name, count in brand_counter.most_common(10):
            brand_products = [
                p for p in raw_products if p.get("brand") == brand_name
            ]
            bp = [p["price"] for p in brand_products if p.get("price") is not None]
            br = [p["rating"] for p in brand_products if p.get("rating") is not None]
            b_reviews = sum(p.get("reviews_count") or 0 for p in brand_products)
            b_best_seller = sum(1 for p in brand_products if p.get("is_best_seller"))
            b_amazon_choice = sum(1 for p in brand_products if p.get("is_amazon_choice"))
            b_has_bought = any(p.get("monthly_bought") for p in brand_products)

            # Threat level: high if brand dominates reviews + has badges
            threat = "low"
            if b_reviews > 5000 or (b_best_seller + b_amazon_choice) >= 2:
                threat = "high"
            elif b_reviews > 1000 or (b_best_seller + b_amazon_choice) >= 1:
                threat = "medium"

            top_brands_data.append(
                BrandInfo(
                    name=brand_name,
                    count=count,
                    avg_price=round(statistics.mean(bp), 2) if bp else None,
                    avg_rating=round(statistics.mean(br), 2) if br else None,
                    market_share=round(count / total_branded * 100, 1)
                    if total_branded
                    else 0,
                    total_reviews=b_reviews,
                    best_seller_count=b_best_seller,
                    amazon_choice_count=b_amazon_choice,
                    has_monthly_bought=b_has_bought,
                    threat_level=threat,
                )
            )

        brand_count = len(brand_counter)
        top3_share = (
            sum(c for _, c in brand_counter.most_common(3)) / total_branded * 100
            if total_branded
            else 0
        )

        # Price distribution
        price_dist = self._calc_price_distribution(prices)

        # Rating distribution
        rating_dist = self._calc_rating_distribution(ratings)

        # Review distribution
        review_dist = self._calc_review_distribution(reviews)

        # Extended metrics (calculated before scores so margin is available)
        n = len(raw_products)
        median_reviews_val = round(statistics.median(reviews), 1) if reviews else None
        prime_pct = round(sum(1 for p in raw_products if p.get("is_prime")) / n * 100, 1) if n else None
        bought_pct = round(sum(1 for p in raw_products if p.get("monthly_bought")) / n * 100, 1) if n else None
        best_seller_pct = round(sum(1 for p in raw_products if p.get("is_best_seller")) / n * 100, 1) if n else None
        amazon_choice_pct = round(sum(1 for p in raw_products if p.get("is_amazon_choice")) / n * 100, 1) if n else None

        # Estimated margin (standalone metric from price analysis)
        estimated_margin = None
        if median_price and median_price > 0:
            ref = median_price
            cost = (ref * 0.15) + 3.50 + (ref * 0.25) + 1.50  # referral + FBA + sourcing + inbound
            estimated_margin = round(((ref - cost) / ref) * 100, 1)

        # Market saturation analysis
        saturation = self._calc_saturation(reviews)

        # Price opportunity window
        price_opportunity = self._calc_price_opportunity(raw_products, prices, reviews)

        # Revenue estimate — 3 tiers (top/mid/entry)
        ref_price = median_price or avg_price
        revenue_tiers = self._estimate_revenue_tiers(raw_products, ref_price, keepa_data)
        revenue_estimate = revenue_tiers["revenue_mid"]

        # Opportunity scores — pass full product data + Keepa enrichment
        demand_score, demand_bd = self._calc_demand_score(raw_products, reviews, prices, keepa_data)
        competition_score, competition_bd = self._calc_competition_score(
            raw_products, reviews, brand_count, top3_share, keepa_data,
            saturation=saturation, price_opportunity=price_opportunity,
        )
        price_score, price_bd = self._calc_price_score(prices, avg_price, median_price, keepa_data)
        quality_gap_score, quality_bd = self._calc_quality_gap_score(ratings, reviews, keepa_data)

        # Launch investment calculation — realistic cost to enter this niche
        launch_investment = self._calc_launch_investment(
            ref_price, estimated_margin, price_opportunity, keepa_data,
        )

        # Entrant viability — can a new small seller make money?
        entrant_viability_score, entrant_viability_bd = self._calc_entrant_viability_score(
            raw_products, ref_price, estimated_margin, revenue_tiers, price_opportunity,
            launch_investment=launch_investment,
        )

        # Final opportunity score: 25% Demand + 25% Competition + 20% Price + 10% Quality + 20% Entrant
        opportunity_score = round(
            (demand_score * 0.25)
            + (competition_score * 0.25)
            + (price_score * 0.20)
            + (quality_gap_score * 0.10)
            + (entrant_viability_score * 0.20),
            1,
        )

        logger.info(
            "Scores for '%s': demand=%.1f, competition=%.1f, price=%.1f, quality=%.1f, entrant=%.1f → opportunity=%.1f",
            keyword, demand_score, competition_score, price_score, quality_gap_score, entrant_viability_score, opportunity_score,
        )

        # 4. Save or update analysis — store lists natively (no JSON strings)
        metrics = dict(
            total_products=len(raw_products),
            avg_price=round(avg_price, 2) if avg_price else None,
            min_price=round(min_price, 2) if min_price else None,
            max_price=round(max_price, 2) if max_price else None,
            median_price=round(median_price, 2) if median_price else None,
            avg_rating=avg_rating,
            avg_reviews=avg_reviews,
            top_brands=[b.model_dump() for b in top_brands_data],
            brand_count=brand_count,
            top3_brand_share=round(top3_share, 1),
            opportunity_score=opportunity_score,
            demand_score=round(demand_score, 1),
            competition_score=round(competition_score, 1),
            price_score=round(price_score, 1),
            quality_gap_score=round(quality_gap_score, 1),
            entrant_viability_score=round(entrant_viability_score, 1),
            revenue_estimate=round(revenue_estimate, 2) if revenue_estimate else None,
            revenue_top=round(revenue_tiers["revenue_top"], 2) if revenue_tiers["revenue_top"] else None,
            revenue_entry=round(revenue_tiers["revenue_entry"], 2) if revenue_tiers["revenue_entry"] else None,
            # Extended
            median_reviews=median_reviews_val,
            prime_percentage=prime_pct,
            monthly_bought_percentage=bought_pct,
            best_seller_percentage=best_seller_pct,
            amazon_choice_percentage=amazon_choice_pct,
            estimated_margin=estimated_margin,
            search_result_count=search_result_count or None,
            demand_breakdown=demand_bd,
            competition_breakdown=competition_bd,
            price_breakdown=price_bd,
            quality_breakdown=quality_bd,
            entrant_viability_breakdown=entrant_viability_bd,
            saturation=saturation,
            price_opportunity=price_opportunity,
            # Distributions
            price_distribution=[p.model_dump() for p in price_dist],
            rating_distribution=rating_dist,
            review_distribution=review_dist,
            # Keepa historical data
            keepa_trend=keepa_data.get("trend") if keepa_data else None,
            keepa_seasonality=keepa_data.get("seasonality") if keepa_data else None,
            keepa_price_stability=keepa_data.get("price_stability") if keepa_data else None,
            keepa_seller_dynamics=keepa_data.get("seller_dynamics") if keepa_data else None,
            keepa_rating_evolution=keepa_data.get("rating_evolution") if keepa_data else None,
            keepa_sales_estimate=keepa_data.get("sales_estimate") if keepa_data else None,
            keepa_data_confidence=keepa_data.get("data_confidence") if keepa_data else None,
            keepa_products_analyzed=keepa_data.get("keepa_products_analyzed") if keepa_data else None,
            # Launch investment
            launch_investment=launch_investment,
        )

        now = datetime.now(timezone.utc)

        if existing:
            # Update existing record
            update_fields = {**metrics, "created_at": now}
            if parent_keyword:
                update_fields["parent_keyword"] = parent_keyword
            await _database.db.niche_analyses.update_one(
                {"_id": existing["_id"]},
                {"$set": update_fields},
            )
            analysis_id = existing["id"]
        else:
            analysis_id = await _database.get_next_id("niche_analyses")
            doc = new_analysis_doc(analysis_id, keyword=keyword, parent_keyword=parent_keyword, **metrics)
            await _database.db.niche_analyses.insert_one(doc)

        # Fetch the final document
        final = await _database.db.niche_analyses.find_one({"id": analysis_id})
        resp = self._doc_to_response(final)
        resp.is_cached = False
        return resp

    async def _save_products(self, products: list[dict]):
        for p in products:
            existing = await _database.db.products.find_one({"asin": p["asin"]})
            now = datetime.now(timezone.utc)
            if existing:
                update_fields = {k: v for k, v in p.items() if v is not None}
                update_fields["updated_at"] = now
                await _database.db.products.update_one(
                    {"_id": existing["_id"]},
                    {"$set": update_fields},
                )
            else:
                pid = await _database.get_next_id("products")
                doc = new_product_doc(pid, **p)
                await _database.db.products.insert_one(doc)

    def _calc_price_distribution(self, prices: list[float]) -> list[PriceRange]:
        if not prices:
            return []
        ranges = [
            (0, 5, "$0-5"),
            (5, 10, "$5-10"),
            (10, 15, "$10-15"),
            (15, 20, "$15-20"),
            (20, 30, "$20-30"),
            (30, 50, "$30-50"),
            (50, 100, "$50-100"),
            (100, float("inf"), "$100+"),
        ]
        dist = []
        for low, high, label in ranges:
            count = sum(1 for p in prices if low <= p < high)
            if count > 0:
                dist.append(PriceRange(range=label, count=count))
        return dist

    def _calc_rating_distribution(self, ratings: list[float]) -> list[dict]:
        if not ratings:
            return []
        buckets = {"1-2": 0, "2-3": 0, "3-3.5": 0, "3.5-4": 0, "4-4.5": 0, "4.5-5": 0}
        for r in ratings:
            if r < 2:
                buckets["1-2"] += 1
            elif r < 3:
                buckets["2-3"] += 1
            elif r < 3.5:
                buckets["3-3.5"] += 1
            elif r < 4:
                buckets["3.5-4"] += 1
            elif r < 4.5:
                buckets["4-4.5"] += 1
            else:
                buckets["4.5-5"] += 1
        return [{"range": k, "count": v} for k, v in buckets.items() if v > 0]

    def _calc_review_distribution(self, reviews: list[int]) -> list[dict]:
        if not reviews:
            return []
        buckets = [
            (0, 10, "0-10"),
            (10, 50, "10-50"),
            (50, 100, "50-100"),
            (100, 500, "100-500"),
            (500, 1000, "500-1K"),
            (1000, 5000, "1K-5K"),
            (5000, 10000, "5K-10K"),
            (10000, float("inf"), "10K+"),
        ]
        dist = []
        for low, high, label in buckets:
            count = sum(1 for r in reviews if low <= r < high)
            if count > 0:
                dist.append({"range": label, "count": count})
        return dist

    @staticmethod
    def _parse_monthly_bought(text: str) -> int:
        """Parse '60K+ bought in past month' -> 60000."""
        match = re.search(r"([\d,.]+)\s*([Kk])?", text)
        if not match:
            return 0
        num = float(match.group(1).replace(",", ""))
        if match.group(2):
            num *= 1000
        return int(num)

    def _calc_demand_score(
        self, products: list[dict], reviews: list[int], prices: list[float],
        keepa: dict | None = None,
    ) -> tuple[float, list[dict]]:
        """Demand = is there real buyer activity in this niche?

        When Keepa data is available, BSR-based sales estimates replace the
        unreliable "monthly_bought" text and a trend signal is added.
        """
        breakdown = []
        if not products:
            return 0.0, []

        n = len(products)
        score = 0.0

        # Determine weights: with Keepa we add a trend signal so adjust
        has_keepa_sales = keepa and keepa.get("sales_estimate")
        has_keepa_trend = keepa and keepa.get("trend")
        if has_keepa_sales:
            w_sales, w_rev, w_breadth, w_fba, w_trend = 30, 20, 10, 15, 25
        else:
            w_sales, w_rev, w_breadth, w_fba, w_trend = 40, 30, 15, 15, 0

        # --- Signal 1: Sales volume ---
        if has_keepa_sales:
            # Use Keepa BSR-based estimate (much more reliable)
            median_sales = keepa["sales_estimate"]["median_monthly_units"]
            if median_sales >= 3000:
                bought_score = 100
            elif median_sales >= 1500:
                bought_score = 85
            elif median_sales >= 800:
                bought_score = 70
            elif median_sales >= 400:
                bought_score = 55
            elif median_sales >= 150:
                bought_score = 40
            elif median_sales >= 50:
                bought_score = 25
            else:
                bought_score = 10
            signal_val = round(bought_score * w_sales / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Ventas Mensuales (Keepa BSR)", "value": f"{median_sales:,.0f} uds/mes mediana", "score": round(bought_score, 1), "weight": w_sales, "weighted": signal_val})
        else:
            # Fallback: scraper "monthly_bought" text
            bought_texts = [p["monthly_bought"] for p in products if p.get("monthly_bought")]
            if bought_texts:
                bought_nums = [self._parse_monthly_bought(t) for t in bought_texts]
                avg_bought = statistics.mean(bought_nums) if bought_nums else 0
                coverage = len(bought_texts) / n

                if avg_bought >= 10000:
                    bought_score = 100
                elif avg_bought >= 5000:
                    bought_score = 85
                elif avg_bought >= 2000:
                    bought_score = 70
                elif avg_bought >= 1000:
                    bought_score = 55
                elif avg_bought >= 500:
                    bought_score = 40
                elif avg_bought >= 100:
                    bought_score = 25
                else:
                    bought_score = 10

                bought_score *= max(coverage, 0.3)
                signal_val = round(bought_score * w_sales / 100, 1)
                score += signal_val
                breakdown.append({"signal": "Compras Mensuales", "value": f"{avg_bought:,.0f} prom ({coverage:.0%} cobertura)", "score": round(bought_score, 1), "weight": w_sales, "weighted": signal_val})
            else:
                signal_val = round(20 * w_sales / 100, 1)
                score += signal_val
                breakdown.append({"signal": "Compras Mensuales", "value": "Sin datos", "score": 20, "weight": w_sales, "weighted": signal_val})

        # --- Signal 2: review velocity proxy ---
        if reviews:
            median_reviews = statistics.median(reviews)
            if median_reviews >= 1000:
                rev_score = 90
            elif median_reviews >= 500:
                rev_score = 75
            elif median_reviews >= 200:
                rev_score = 60
            elif median_reviews >= 100:
                rev_score = 50
            elif median_reviews >= 50:
                rev_score = 35
            elif median_reviews >= 10:
                rev_score = 20
            else:
                rev_score = 10
            signal_val = round(rev_score * w_rev / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Mediana Reviews", "value": f"{median_reviews:,.0f}", "score": rev_score, "weight": w_rev, "weighted": signal_val})
        else:
            signal_val = round(10 * w_rev / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Mediana Reviews", "value": "0", "score": 10, "weight": w_rev, "weighted": signal_val})

        # --- Signal 3: market breadth ---
        products_with_reviews = sum(1 for r in reviews if r > 0) if reviews else 0
        activity_ratio = products_with_reviews / n if n else 0
        breadth_score = activity_ratio * 100
        signal_val = round(breadth_score * w_breadth / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Actividad del Mercado", "value": f"{activity_ratio:.0%} con reviews", "score": round(breadth_score, 1), "weight": w_breadth, "weighted": signal_val})

        # --- Signal 4: FBA viability ---
        prime_count = sum(1 for p in products if p.get("is_prime"))
        prime_ratio = prime_count / n if n else 0
        if prime_ratio >= 0.7:
            fba_score = 80
        elif prime_ratio >= 0.5:
            fba_score = 60
        elif prime_ratio >= 0.3:
            fba_score = 40
        else:
            fba_score = 20
        signal_val = round(fba_score * w_fba / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Viabilidad FBA", "value": f"{prime_ratio:.0%} Prime", "score": fba_score, "weight": w_fba, "weighted": signal_val})

        # --- Signal 5: Keepa trend (only when available) ---
        if has_keepa_trend and w_trend > 0:
            trend = keepa["trend"]
            direction = trend["direction"]
            change = abs(trend["avg_bsr_change_pct"])
            if direction == "growing":
                # BSR declining = more sales → high demand
                if change >= 30:
                    trend_score = 95
                elif change >= 15:
                    trend_score = 80
                else:
                    trend_score = 65
            elif direction == "declining":
                # BSR rising = fewer sales
                if change >= 30:
                    trend_score = 15
                elif change >= 15:
                    trend_score = 30
                else:
                    trend_score = 45
            else:
                trend_score = 55  # stable
            signal_val = round(trend_score * w_trend / 100, 1)
            score += signal_val
            label = {"growing": "↑ Creciendo", "declining": "↓ Cayendo", "stable": "→ Estable"}[direction]
            breakdown.append({"signal": "Tendencia Keepa (90d)", "value": f"{label} ({trend['avg_bsr_change_pct']:+.1f}% BSR)", "score": trend_score, "weight": w_trend, "weighted": signal_val})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_competition_score(
        self, products: list[dict], reviews: list[int],
        brand_count: int | None, top3_share: float | None,
        keepa: dict | None = None,
        saturation: dict | None = None,
        price_opportunity: dict | None = None,
    ) -> tuple[float, list[dict]]:
        """Competition = how hard is it to enter this niche?
        HIGH score = LOW competition (good for us).
        When Keepa data is available, seller dynamics replace review gap.
        Includes review barrier and saturation penalty for realism.
        """
        breakdown = []
        if not products:
            return 50.0, []

        n = len(products)
        score = 0.0

        has_keepa_sellers = keepa and keepa.get("seller_dynamics")
        # Weights: added review barrier (20%), rebalanced others
        if has_keepa_sellers:
            w_leaders, w_barrier, w_conc, w_div, w_badges, w_sellers = 20, 20, 15, 10, 10, 25
        else:
            w_leaders, w_barrier, w_conc, w_div, w_badges, w_gap = 25, 20, 15, 10, 10, 20

        # --- Signal 1: Small seller viability ---
        small_sellers_active = sum(
            1 for p in products
            if (p.get("reviews_count") or 0) < 500 and p.get("monthly_bought")
        )
        small_ratio_pct = (small_sellers_active / n * 100) if n else 0

        if small_ratio_pct >= 30:
            viability_score = 90
        elif small_ratio_pct >= 20:
            viability_score = 75
        elif small_ratio_pct >= 15:
            viability_score = 60
        elif small_ratio_pct >= 10:
            viability_score = 45
        elif small_ratio_pct >= 5:
            viability_score = 30
        else:
            viability_score = 15
        signal_val = round(viability_score * w_leaders / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Viabilidad del Pequeño", "value": f"{small_sellers_active} vendedores <500 rev vendiendo ({small_ratio_pct:.0f}%)", "score": viability_score, "weight": w_leaders, "weighted": signal_val})

        # --- Signal 2: Review barrier (NEW) ---
        # How many reviews do you need to be competitive? Use best price range median.
        best_range_name = (price_opportunity or {}).get("best_range")
        barrier_median = None
        if best_range_name and price_opportunity:
            for r in price_opportunity.get("ranges", []):
                if r["range"] == best_range_name:
                    barrier_median = r.get("avg_reviews", 0)
                    break
        if barrier_median is None and reviews:
            barrier_median = statistics.median(reviews)

        if barrier_median is not None:
            if barrier_median >= 500:
                barrier_score = 15
            elif barrier_median >= 300:
                barrier_score = 30
            elif barrier_median >= 150:
                barrier_score = 45
            elif barrier_median >= 50:
                barrier_score = 65
            elif barrier_median >= 20:
                barrier_score = 80
            else:
                barrier_score = 95
            signal_val = round(barrier_score * w_barrier / 100, 1)
            score += signal_val
            range_label = f" (rango {best_range_name})" if best_range_name and best_range_name != "Sin datos" else ""
            breakdown.append({"signal": "Barrera de Reviews", "value": f"~{barrier_median:,.0f} reviews mediana{range_label}", "score": barrier_score, "weight": w_barrier, "weighted": signal_val})
        else:
            signal_val = round(50 * w_barrier / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Barrera de Reviews", "value": "Sin datos", "score": 50, "weight": w_barrier, "weighted": signal_val})

        # --- Signal 3: Brand concentration ---
        if top3_share is not None:
            if top3_share < 20:
                conc_score = 90
            elif top3_share < 35:
                conc_score = 75
            elif top3_share < 50:
                conc_score = 55
            elif top3_share < 65:
                conc_score = 35
            elif top3_share < 80:
                conc_score = 20
            else:
                conc_score = 5
            signal_val = round(conc_score * w_conc / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Concentración Top-3", "value": f"{top3_share:.1f}% del mercado", "score": conc_score, "weight": w_conc, "weighted": signal_val})
        else:
            signal_val = round(50 * w_conc / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Concentración Top-3", "value": "Sin datos", "score": 50, "weight": w_conc, "weighted": signal_val})

        # --- Signal 4: Brand diversity ---
        if brand_count is not None:
            if brand_count >= 20:
                div_score = 85
            elif brand_count >= 12:
                div_score = 70
            elif brand_count >= 8:
                div_score = 55
            elif brand_count >= 5:
                div_score = 40
            elif brand_count >= 3:
                div_score = 25
            else:
                div_score = 10
            signal_val = round(div_score * w_div / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Diversidad de Marcas", "value": f"{brand_count} marcas únicas", "score": div_score, "weight": w_div, "weighted": signal_val})
        else:
            signal_val = round(50 * w_div / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Diversidad de Marcas", "value": "Sin datos", "score": 50, "weight": w_div, "weighted": signal_val})

        # --- Signal 5: Amazon dominance indicators ---
        badge_count = sum(
            1 for p in products
            if p.get("is_best_seller") or p.get("is_amazon_choice")
        )
        badge_ratio = badge_count / n if n else 0
        # Anomaly detection: 0 badges in a large niche is likely scraper error
        if badge_ratio < 0.05 and n > 20 and badge_count == 0:
            badge_score = 50  # neutral — unreliable data
        elif badge_ratio < 0.05:
            badge_score = 80
        elif badge_ratio < 0.10:
            badge_score = 65
        elif badge_ratio < 0.20:
            badge_score = 50
        elif badge_ratio < 0.35:
            badge_score = 35
        else:
            badge_score = 15
        signal_val = round(badge_score * w_badges / 100, 1)
        score += signal_val
        anomaly_note = " (dato no confiable)" if badge_count == 0 and n > 20 else ""
        breakdown.append({"signal": "Badges Amazon", "value": f"{badge_count} badges ({badge_ratio:.0%}){anomaly_note}", "score": badge_score, "weight": w_badges, "weighted": signal_val})

        # --- Signal 6: Seller dynamics (Keepa) OR Review gap (fallback) ---
        sorted_reviews = sorted(reviews, reverse=True) if reviews else []
        if has_keepa_sellers:
            sd = keepa["seller_dynamics"]
            change = sd["avg_seller_change_pct"]
            if change >= 30:
                seller_score = 15
            elif change >= 15:
                seller_score = 30
            elif change >= 5:
                seller_score = 50
            elif change >= -5:
                seller_score = 65
            elif change >= -15:
                seller_score = 75
            else:
                seller_score = 85
            signal_val = round(seller_score * w_sellers / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Dinámica Sellers (Keepa)", "value": f"{change:+.1f}% sellers ({sd['avg_current_sellers']:.0f} prom)", "score": seller_score, "weight": w_sellers, "weighted": signal_val})
        else:
            if len(sorted_reviews) >= 5:
                top_median = statistics.median(sorted_reviews[:5])
                bottom_median = statistics.median(sorted_reviews[-5:])
                if top_median > 0 and bottom_median >= 0:
                    ratio = bottom_median / top_median if top_median else 0
                    if ratio < 0.01:
                        gap_score = 80
                    elif ratio < 0.05:
                        gap_score = 65
                    elif ratio < 0.15:
                        gap_score = 50
                    elif ratio < 0.30:
                        gap_score = 35
                    else:
                        gap_score = 20
                    signal_val = round(gap_score * w_gap / 100, 1)
                    score += signal_val
                    breakdown.append({"signal": "Brecha Reviews", "value": f"Top {top_median:,.0f} vs Bottom {bottom_median:,.0f}", "score": gap_score, "weight": w_gap, "weighted": signal_val})
                else:
                    signal_val = round(50 * w_gap / 100, 1)
                    score += signal_val
                    breakdown.append({"signal": "Brecha Reviews", "value": "Sin datos", "score": 50, "weight": w_gap, "weighted": signal_val})
            else:
                signal_val = round(50 * w_gap / 100, 1)
                score += signal_val
                breakdown.append({"signal": "Brecha Reviews", "value": "Pocos productos", "score": 50, "weight": w_gap, "weighted": signal_val})

        # --- Saturation penalty: mature markets get penalized ---
        if saturation:
            maturity = saturation.get("dominant_pct", 0) + saturation.get("established_pct", 0)
            if maturity >= 80:
                score *= 0.75
                breakdown.append({"signal": "Penalización Saturación", "value": f"{maturity:.0f}% dominantes+establecidos", "score": -25, "weight": 0, "weighted": round(-score * 0.25 / 0.75, 1)})
            elif maturity >= 65:
                score *= 0.85
                breakdown.append({"signal": "Penalización Saturación", "value": f"{maturity:.0f}% dominantes+establecidos", "score": -15, "weight": 0, "weighted": round(-score * 0.15 / 0.85, 1)})
            elif maturity >= 50:
                score *= 0.92
                breakdown.append({"signal": "Penalización Saturación", "value": f"{maturity:.0f}% dominantes+establecidos", "score": -8, "weight": 0, "weighted": round(-score * 0.08 / 0.92, 1)})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_price_score(
        self, prices: list[float],
        avg_price: float | None, median_price: float | None,
        keepa: dict | None = None,
    ) -> tuple[float, list[dict]]:
        """Price = is the price point viable for private label profit?

        When Keepa data is available, price stability replaces diversity
        (more useful for investment decisions).
        """
        breakdown = []
        if not prices or avg_price is None:
            return 30.0, []

        score = 0.0
        ref_price = median_price if median_price else avg_price

        has_keepa_price = keepa and keepa.get("price_stability")
        if has_keepa_price:
            w_sweet, w_margin, w_stability = 40, 30, 30
        else:
            w_sweet, w_margin, w_diversity = 50, 30, 20

        # --- Signal 1: Price sweet spot ---
        if 20 <= ref_price <= 40:
            sweet_score = 95
        elif 18 <= ref_price < 20 or 40 < ref_price <= 50:
            sweet_score = 80
        elif 15 <= ref_price < 18 or 50 < ref_price <= 65:
            sweet_score = 60
        elif 12 <= ref_price < 15 or 65 < ref_price <= 80:
            sweet_score = 40
        elif 10 <= ref_price < 12:
            sweet_score = 25
        elif ref_price < 10:
            sweet_score = 10
        else:
            sweet_score = 30
        signal_val = round(sweet_score * w_sweet / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Rango de Precio", "value": f"${ref_price:.2f} (ideal $18-45)", "score": sweet_score, "weight": w_sweet, "weighted": signal_val})

        # --- Signal 2: Estimated net margin ---
        fba_fee = 3.50
        ship_to_fba = 1.50
        referral_pct = 0.15
        sourcing_pct = 0.25

        estimated_cost = (ref_price * referral_pct) + fba_fee + (ref_price * sourcing_pct) + ship_to_fba
        estimated_margin_pct = ((ref_price - estimated_cost) / ref_price * 100) if ref_price > 0 else 0

        if estimated_margin_pct >= 40:
            margin_score = 95
        elif estimated_margin_pct >= 35:
            margin_score = 80
        elif estimated_margin_pct >= 30:
            margin_score = 65
        elif estimated_margin_pct >= 25:
            margin_score = 50
        elif estimated_margin_pct >= 20:
            margin_score = 35
        elif estimated_margin_pct >= 10:
            margin_score = 20
        else:
            margin_score = 5
        signal_val = round(margin_score * w_margin / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Margen Neto Estimado", "value": f"{estimated_margin_pct:.0f}%", "score": margin_score, "weight": w_margin, "weighted": signal_val})

        # --- Signal 3: Price stability (Keepa) OR diversity (fallback) ---
        if has_keepa_price:
            ps = keepa["price_stability"]
            cv = ps["avg_cv"]
            declining_pct = ps["prices_declining_pct"]
            # Low CV + not declining = great for margins
            if cv < 0.05 and declining_pct < 20:
                stab_score = 95
            elif cv < 0.10 and declining_pct < 30:
                stab_score = 80
            elif cv < 0.15:
                stab_score = 65
            elif cv < 0.25:
                stab_score = 45
            elif cv < 0.35:
                stab_score = 30
            else:
                stab_score = 15
            # Penalize if many prices declining
            if declining_pct >= 50:
                stab_score = min(stab_score, 30)
            signal_val = round(stab_score * w_stability / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Estabilidad Precios (Keepa)", "value": f"CV {cv:.3f}, {declining_pct:.0f}% en caída", "score": stab_score, "weight": w_stability, "weighted": signal_val})
        else:
            if len(prices) >= 3:
                price_stdev = statistics.stdev(prices)
                cv = (price_stdev / avg_price) if avg_price > 0 else 0
                if cv >= 0.6:
                    diversity_score = 85
                elif cv >= 0.4:
                    diversity_score = 70
                elif cv >= 0.25:
                    diversity_score = 55
                elif cv >= 0.15:
                    diversity_score = 40
                else:
                    diversity_score = 20
                signal_val = round(diversity_score * w_diversity / 100, 1)
                score += signal_val
                breakdown.append({"signal": "Diversidad de Precios", "value": f"CV {cv:.2f}", "score": diversity_score, "weight": w_diversity, "weighted": signal_val})
            else:
                signal_val = round(40 * w_diversity / 100, 1)
                score += signal_val
                breakdown.append({"signal": "Diversidad de Precios", "value": "Pocos productos", "score": 40, "weight": w_diversity, "weighted": signal_val})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_quality_gap_score(
        self, ratings: list[float], reviews: list[int],
        keepa: dict | None = None,
    ) -> tuple[float, list[dict]]:
        """Quality Gap = is there room to win by making a better product?
        HIGH score = customers are unhappy (opportunity).

        When Keepa data is available, rating evolution adds temporal context.
        """
        breakdown = []
        if not ratings:
            return 30.0, []

        n = len(ratings)
        score = 0.0

        has_keepa_rating = keepa and keepa.get("rating_evolution")
        if has_keepa_rating:
            w_under4, w_weighted, w_under43, w_variance, w_evolution = 30, 25, 15, 10, 20
        else:
            w_under4, w_weighted, w_under43, w_variance, w_evolution = 35, 30, 20, 15, 0

        # --- Signal 1: % of products under 4.0 stars ---
        under_4 = sum(1 for r in ratings if r < 4.0)
        pct_under_4 = (under_4 / n) * 100

        if pct_under_4 >= 50:
            dissatisfaction_score = 95
        elif pct_under_4 >= 35:
            dissatisfaction_score = 80
        elif pct_under_4 >= 25:
            dissatisfaction_score = 65
        elif pct_under_4 >= 15:
            dissatisfaction_score = 50
        elif pct_under_4 >= 8:
            dissatisfaction_score = 35
        elif pct_under_4 >= 3:
            dissatisfaction_score = 20
        else:
            dissatisfaction_score = 40  # Uniform high quality ≠ no opportunity
        signal_val = round(dissatisfaction_score * w_under4 / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Productos <4.0 Estrellas", "value": f"{pct_under_4:.0f}% ({under_4}/{n})", "score": dissatisfaction_score, "weight": w_under4, "weighted": signal_val})

        # --- Signal 2: Weighted dissatisfaction ---
        if reviews and len(reviews) == len(ratings):
            total_review_weight = sum(reviews) if reviews else 1
            weighted_bad = sum(
                rev for rev, rat in zip(reviews, ratings)
                if rat < 4.0
            )
            bad_weight_pct = (weighted_bad / total_review_weight * 100) if total_review_weight > 0 else 0

            if bad_weight_pct >= 40:
                weighted_score = 95
            elif bad_weight_pct >= 25:
                weighted_score = 75
            elif bad_weight_pct >= 15:
                weighted_score = 60
            elif bad_weight_pct >= 8:
                weighted_score = 45
            elif bad_weight_pct >= 3:
                weighted_score = 30
            else:
                weighted_score = 35  # Low dissatisfaction = match quality, not a blocker
            signal_val = round(weighted_score * w_weighted / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Insatisfacción Ponderada", "value": f"{bad_weight_pct:.0f}% reviews en productos <4.0", "score": weighted_score, "weight": w_weighted, "weighted": signal_val})
        else:
            avg_rating = statistics.mean(ratings)
            if avg_rating < 3.5:
                fb = 85
            elif avg_rating < 3.8:
                fb = 65
            elif avg_rating < 4.0:
                fb = 50
            elif avg_rating < 4.2:
                fb = 35
            elif avg_rating < 4.4:
                fb = 20
            else:
                fb = 35  # High avg rating = quality bar is clear, not a blocker
            signal_val = round(fb * w_weighted / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Insatisfacción Ponderada", "value": f"Rating prom {avg_rating:.1f}", "score": fb, "weight": w_weighted, "weighted": signal_val})

        # --- Signal 3: % under 4.3 stars ---
        under_43 = sum(1 for r in ratings if r < 4.3)
        pct_under_43 = (under_43 / n) * 100

        if pct_under_43 >= 70:
            moderate_score = 85
        elif pct_under_43 >= 50:
            moderate_score = 65
        elif pct_under_43 >= 35:
            moderate_score = 50
        elif pct_under_43 >= 20:
            moderate_score = 35
        else:
            moderate_score = 30  # High quality bar but achievable
        signal_val = round(moderate_score * w_under43 / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Productos <4.3 Estrellas", "value": f"{pct_under_43:.0f}% ({under_43}/{n})", "score": moderate_score, "weight": w_under43, "weighted": signal_val})

        # --- Signal 4: Rating variance ---
        if len(ratings) >= 5:
            stdev = statistics.stdev(ratings)
            if stdev >= 0.7:
                var_score = 85
            elif stdev >= 0.5:
                var_score = 65
            elif stdev >= 0.35:
                var_score = 50
            elif stdev >= 0.2:
                var_score = 35
            else:
                var_score = 15
            signal_val = round(var_score * w_variance / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Varianza de Calidad", "value": f"Desv. {stdev:.2f}", "score": var_score, "weight": w_variance, "weighted": signal_val})
        else:
            signal_val = round(40 * w_variance / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Varianza de Calidad", "value": "Pocos productos", "score": 40, "weight": w_variance, "weighted": signal_val})

        # --- Signal 5: Rating evolution (Keepa) ---
        if has_keepa_rating and w_evolution > 0:
            re = keepa["rating_evolution"]
            declining_pct = re["ratings_declining_pct"]
            change = re["avg_rating_change"]
            # Declining ratings = opportunity (customers unhappy, room to improve)
            if declining_pct >= 50:
                evo_score = 90
            elif declining_pct >= 30:
                evo_score = 70
            elif declining_pct >= 15:
                evo_score = 55
            elif change >= 0.1:
                evo_score = 25  # ratings improving = competitors adapting
            else:
                evo_score = 40  # stable
            signal_val = round(evo_score * w_evolution / 100, 1)
            score += signal_val
            direction_label = re["verdict"]
            breakdown.append({"signal": "Evolución Ratings (Keepa)", "value": f"{change:+.2f} estrellas, {declining_pct:.0f}% cayendo", "score": evo_score, "weight": w_evolution, "weighted": signal_val})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_launch_investment(
        self, ref_price: float | None, estimated_margin: float | None,
        price_opportunity: dict | None, keepa: dict | None,
    ) -> dict | None:
        """Calculate realistic launch investment for a new seller.

        Returns review target, Vine cost, PPC estimate, inventory cost,
        total investment, monthly burn rate, and breakeven months.
        """
        if not ref_price or ref_price <= 0:
            return None

        # Best range median reviews (how many reviews to be competitive)
        best_range_name = (price_opportunity or {}).get("best_range")
        best_range_median = None
        if best_range_name and price_opportunity:
            for r in price_opportunity.get("ranges", []):
                if r["range"] == best_range_name:
                    best_range_median = r.get("avg_reviews", 0)
                    break
        if best_range_median is None:
            best_range_median = 200  # conservative default

        # Review target: ~30% of median, clamped between 30-150
        review_target = max(30, round(best_range_median * 0.3))
        review_target = min(review_target, 150)

        # Vine: 30 units given away
        vine_units = 30
        unit_cost = ref_price * 0.25 + 1.50  # sourcing + inbound
        vine_cost = round(vine_units * unit_cost)
        vine_reviews = 25

        # Organic reviews needed after Vine
        organic_reviews_needed = max(0, review_target - vine_reviews)
        # Cap organic sales needed — a new seller won't PPC their way to 8K sales
        sales_for_organic = organic_reviews_needed / 0.015 if organic_reviews_needed > 0 else 0
        sales_for_organic = min(sales_for_organic, 3000)  # realistic PPC campaign cap

        # PPC cost based on niche competitiveness
        if best_range_median >= 500:
            estimated_cpc = 2.00
            conversion_new = 0.04
        elif best_range_median >= 200:
            estimated_cpc = 1.50
            conversion_new = 0.06
        elif best_range_median >= 50:
            estimated_cpc = 1.00
            conversion_new = 0.08
        else:
            estimated_cpc = 0.60
            conversion_new = 0.10

        ppc_cost_per_sale = estimated_cpc / conversion_new if conversion_new > 0 else 0
        ppc_total = round(sales_for_organic * ppc_cost_per_sale)
        ppc_total = min(ppc_total, 15000)  # hard cap — no sane seller spends more on PPC alone

        # Initial inventory (200 units typical first order)
        initial_units = 200
        inventory_cost = round(initial_units * unit_cost)

        # Total launch investment
        total_investment = vine_cost + ppc_total + inventory_cost

        # Breakeven estimation
        margin_pct = estimated_margin or 30
        monthly_profit_per_unit = ref_price * (margin_pct / 100)
        # Conservative: 2-5 sales/day for a new seller reaching review target
        daily_sales_at_target = max(2, min(sales_for_organic / 90, 8)) if sales_for_organic > 0 else 3
        monthly_revenue_at_target = daily_sales_at_target * 30 * ref_price
        monthly_profit_at_target = monthly_revenue_at_target * (margin_pct / 100)

        if monthly_profit_at_target > 0:
            breakeven_months = max(3, round(total_investment / monthly_profit_at_target))
        else:
            breakeven_months = 12
        breakeven_months = min(breakeven_months, 12)

        # Time to reach review target
        months_to_reviews = max(3, round(review_target / 10))  # ~10 reviews/month with Vine+organic
        months_to_reviews = min(months_to_reviews, 12)

        return {
            "review_target": review_target,
            "best_range_median_reviews": round(best_range_median),
            "vine_cost": vine_cost,
            "vine_reviews": vine_reviews,
            "ppc_total_estimate": ppc_total,
            "inventory_cost": inventory_cost,
            "total_investment": total_investment,
            "breakeven_months": breakeven_months,
            "months_to_review_target": months_to_reviews,
            "estimated_cpc": estimated_cpc,
            "conversion_rate_new": conversion_new,
        }

    def _calc_entrant_viability_score(
        self, products: list[dict], price: float | None,
        estimated_margin: float | None,
        revenue_tiers: dict,
        price_opportunity: dict | None,
        launch_investment: dict | None = None,
    ) -> tuple[float, list[dict]]:
        """Entrant Viability = can a NEW small seller make money here?
        HIGH score = realistic path to profit for a newcomer.
        Uses launch_investment data for realism.
        """
        breakdown = []
        if not products:
            return 40.0, []

        score = 0.0
        w_profit, w_survivors, w_entry, w_investment = 30, 25, 20, 25

        # --- Signal 1: Estimated monthly profit for new entrant ---
        # Use 50% of entry revenue (new seller won't reach p25 immediately)
        entry_rev = revenue_tiers.get("revenue_entry")
        margin_pct = estimated_margin or 0
        if entry_rev and margin_pct > 0:
            realistic_rev = entry_rev * 0.5  # new seller discount
            monthly_profit = realistic_rev * (margin_pct / 100)
            if monthly_profit >= 2000:
                profit_score = 90
            elif monthly_profit >= 1000:
                profit_score = 75
            elif monthly_profit >= 500:
                profit_score = 60
            elif monthly_profit >= 250:
                profit_score = 45
            elif monthly_profit >= 100:
                profit_score = 30
            else:
                profit_score = 15
            signal_val = round(profit_score * w_profit / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Ganancia Estimada Entrante", "value": f"~${monthly_profit:,.0f}/mes (realista nuevo vendedor)", "score": profit_score, "weight": w_profit, "weighted": signal_val})
        else:
            signal_val = round(30 * w_profit / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Ganancia Estimada Entrante", "value": "Sin datos suficientes", "score": 30, "weight": w_profit, "weighted": signal_val})

        # --- Signal 2: Small seller survivors ---
        n = len(products)
        small_with_sales = sum(
            1 for p in products
            if (p.get("reviews_count") or 0) < 500 and p.get("monthly_bought")
        )
        small_pct = (small_with_sales / n * 100) if n else 0

        if small_pct >= 30:
            surv_score = 90
        elif small_pct >= 20:
            surv_score = 75
        elif small_pct >= 15:
            surv_score = 60
        elif small_pct >= 10:
            surv_score = 45
        elif small_pct >= 5:
            surv_score = 30
        else:
            surv_score = 15
        signal_val = round(surv_score * w_survivors / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Vendedores Pequeños Activos", "value": f"{small_with_sales} de {n} ({small_pct:.0f}% <500 rev vendiendo)", "score": surv_score, "weight": w_survivors, "weighted": signal_val})

        # --- Signal 3: Best entry ease across price ranges ---
        ranges = (price_opportunity or {}).get("ranges", [])
        best_ease = "Difícil"
        for r in ranges:
            ease = r.get("entry_ease", "Difícil")
            if ease == "Fácil":
                best_ease = "Fácil"
                break
            elif ease == "Moderado":
                best_ease = "Moderado"

        if best_ease == "Fácil":
            ease_score = 85
        elif best_ease == "Moderado":
            ease_score = 55
        else:
            ease_score = 20
        signal_val = round(ease_score * w_entry / 100, 1)
        score += signal_val
        breakdown.append({"signal": "Mejor Facilidad de Entrada", "value": best_ease, "score": ease_score, "weight": w_entry, "weighted": signal_val})

        # --- Signal 4: Investment feasibility (NEW) ---
        if launch_investment:
            total_inv = launch_investment["total_investment"]
            breakeven = launch_investment["breakeven_months"]
            review_target = launch_investment["review_target"]

            # Score based on breakeven months and investment size
            if breakeven <= 3 and total_inv < 5000:
                inv_score = 90
            elif breakeven <= 4 and total_inv < 8000:
                inv_score = 75
            elif breakeven <= 6 and total_inv < 12000:
                inv_score = 60
            elif breakeven <= 8 and total_inv < 20000:
                inv_score = 40
            elif breakeven <= 10:
                inv_score = 25
            else:
                inv_score = 10
            signal_val = round(inv_score * w_investment / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Inversión para ser Viable", "value": f"${total_inv:,} inversión, ~{breakeven} meses breakeven, {review_target} reviews necesarias", "score": inv_score, "weight": w_investment, "weighted": signal_val})
        else:
            signal_val = round(40 * w_investment / 100, 1)
            score += signal_val
            breakdown.append({"signal": "Inversión para ser Viable", "value": "Sin datos suficientes", "score": 40, "weight": w_investment, "weighted": signal_val})

        return round(min(max(score, 0), 100), 1), breakdown

    @staticmethod
    def _calc_saturation(reviews: list[int]) -> dict:
        """Market saturation: how many new vs established products."""
        if not reviews:
            return {"newcomers": 0, "growing": 0, "established": 0, "dominant": 0,
                    "newcomers_pct": 0, "growing_pct": 0, "established_pct": 0, "dominant_pct": 0,
                    "verdict": "Sin datos"}
        n = len(reviews)
        newcomers = sum(1 for r in reviews if r < 50)
        growing = sum(1 for r in reviews if 50 <= r < 200)
        established = sum(1 for r in reviews if 200 <= r < 1000)
        dominant = sum(1 for r in reviews if r >= 1000)

        newcomers_pct = round(newcomers / n * 100, 1)
        growing_pct = round(growing / n * 100, 1)
        established_pct = round(established / n * 100, 1)
        dominant_pct = round(dominant / n * 100, 1)

        if newcomers_pct >= 40:
            verdict = "Mercado abierto — muchos productos nuevos compitiendo"
        elif dominant_pct >= 40:
            verdict = "Mercado saturado — dominado por productos establecidos"
        elif established_pct + dominant_pct >= 60:
            verdict = "Mercado maduro — difícil para nuevos entrantes"
        else:
            verdict = "Mercado en crecimiento — mezcla de nuevos y establecidos"

        return {
            "newcomers": newcomers, "growing": growing,
            "established": established, "dominant": dominant,
            "newcomers_pct": newcomers_pct, "growing_pct": growing_pct,
            "established_pct": established_pct, "dominant_pct": dominant_pct,
            "verdict": verdict,
        }

    def _calc_price_opportunity(
        self, products: list[dict], prices: list[float], reviews: list[int],
    ) -> dict:
        """Find the price window with least competition but real demand."""
        if not prices or len(prices) < 5:
            return {"best_range": "Sin datos", "ranges": []}

        # Define price buckets
        buckets = [
            (0, 10, "$0-10"), (10, 15, "$10-15"), (15, 20, "$15-20"),
            (20, 30, "$20-30"), (30, 50, "$30-50"), (50, 100, "$50-100"),
        ]
        ranges = []
        for low, high, label in buckets:
            bucket_products = [
                p for p in products
                if p.get("price") and low <= p["price"] < high
            ]
            if not bucket_products:
                continue
            count = len(bucket_products)
            rev_vals = [p.get("reviews_count") or 0 for p in bucket_products]
            median_rev = statistics.median(rev_vals) if rev_vals else 0
            rat_vals = [p["rating"] for p in bucket_products if p.get("rating") is not None]
            avg_rat = statistics.mean(rat_vals) if rat_vals else 0
            has_bought = sum(1 for p in bucket_products if p.get("monthly_bought"))
            small_sellers = sum(1 for p in bucket_products if (p.get("reviews_count") or 0) < 300)

            # Opportunity = low median reviews (easy entry) + some demand
            if median_rev < 150:
                entry_ease = "Fácil"
            elif median_rev < 500:
                entry_ease = "Moderado"
            else:
                entry_ease = "Difícil"

            ranges.append({
                "range": label,
                "count": count,
                "avg_reviews": round(median_rev, 0),
                "avg_rating": round(avg_rat, 2) if avg_rat else None,
                "has_demand": has_bought > 0,
                "entry_ease": entry_ease,
                "small_sellers": small_sellers,
            })

        # Find best range for a NEW small seller.
        # Priority: small sellers present > low reviews > near median price > demand
        median_price = statistics.median(prices) if prices else 20
        best = None
        best_score = -1
        for r in ranges:
            s = 0.0
            # Small sellers present (most important — proof others survive)
            small = r.get("small_sellers", 0)
            s += min(small * 12, 60)  # up to 60 pts for 5+ small sellers
            # Lower reviews = easier entry
            med_rev = r["avg_reviews"]
            if med_rev < 50:
                s += 40
            elif med_rev < 150:
                s += 30
            elif med_rev < 500:
                s += 15
            elif med_rev < 1000:
                s += 5
            # else: 0 — very hard
            # Demand signal
            if r["has_demand"]:
                s += 15
            # Proximity to median price (ranges far from median are less relevant)
            range_label = r["range"]  # e.g. "$20-30"
            try:
                parts = range_label.replace("$", "").split("-")
                range_mid = (float(parts[0]) + float(parts[1])) / 2
                distance_pct = abs(range_mid - median_price) / max(median_price, 1)
                if distance_pct < 0.3:
                    s += 20  # very close to median
                elif distance_pct < 0.6:
                    s += 10
                # else: no bonus — far from typical price
            except (ValueError, IndexError):
                pass
            # Enough products to be meaningful
            if r["count"] >= 3:
                s += 5
            if s > best_score:
                best_score = s
                best = r["range"]

        return {"best_range": best or "Sin datos", "ranges": ranges}

    def _estimate_monthly_revenue(
        self, products: list[dict], price: float | None,
        keepa: dict | None = None,
    ) -> float | None:
        """Estimate monthly revenue (mid-tier / median seller).

        Backwards-compatible: returns the mid-tier (percentile 50) value.
        For all 3 tiers use _estimate_revenue_tiers().
        """
        tiers = self._estimate_revenue_tiers(products, price, keepa)
        return tiers["revenue_mid"]

    def _estimate_revenue_tiers(
        self, products: list[dict], price: float | None,
        keepa: dict | None = None,
    ) -> dict:
        """Estimate 3 revenue tiers: top (p90), mid (p50), entry (p25).

        Returns dict with revenue_top, revenue_mid, revenue_entry (all float|None).
        """
        empty = {"revenue_top": None, "revenue_mid": None, "revenue_entry": None}
        if not price or not products:
            return empty

        # Collect per-product unit estimates
        unit_estimates: list[float] = []

        # Priority 1: per-product monthly_bought text from scraper
        for p in products:
            if p.get("monthly_bought"):
                units = self._parse_monthly_bought(p["monthly_bought"])
                if units > 0:
                    unit_estimates.append(units)

        # Priority 2: if we have very few scraper estimates, try review-to-sales fallback
        if len(unit_estimates) < 5:
            for p in products:
                rc = p.get("reviews_count")
                if rc is not None and rc > 0 and not p.get("monthly_bought"):
                    estimated = (rc / 24) * 20  # ~1 review per 20 sales, annualized
                    unit_estimates.append(estimated)

        if not unit_estimates:
            return empty

        unit_estimates.sort()
        n = len(unit_estimates)

        def percentile(data: list[float], pct: float) -> float:
            idx = (pct / 100) * (len(data) - 1)
            lo = int(idx)
            hi = min(lo + 1, len(data) - 1)
            frac = idx - lo
            return data[lo] * (1 - frac) + data[hi] * frac

        p25 = percentile(unit_estimates, 25)
        p50 = percentile(unit_estimates, 50)
        p90 = percentile(unit_estimates, 90)

        return {
            "revenue_top": round(p90 * price, 2),
            "revenue_mid": round(p50 * price, 2),
            "revenue_entry": round(p25 * price, 2),
        }

    async def quick_check(self, keyword: str) -> dict:
        """Quick 1-page scrape to get real competitive data for a sub-niche.

        Does NOT save to DB. Returns a lightweight difficulty assessment.
        Costs 1 API credit (1 search page).
        """
        raw_products, search_result_count = await scraper.search_products(keyword, page=1)

        if not raw_products:
            return {
                "keyword": keyword,
                "total_products": 0,
                "difficulty": "unknown",
                "difficulty_score": None,
                "avg_price": None,
                "median_reviews": None,
                "brand_count": None,
                "top3_brand_share": None,
                "estimated_margin": None,
                "monthly_bought_pct": None,
                "search_result_count": search_result_count or None,
            }

        n = len(raw_products)
        prices = [p["price"] for p in raw_products if p.get("price") is not None]
        reviews = [p["reviews_count"] for p in raw_products if p.get("reviews_count") is not None]
        brands = [p["brand"] for p in raw_products if p.get("brand")]

        avg_price = round(statistics.mean(prices), 2) if prices else None
        median_price = statistics.median(prices) if prices else None
        median_reviews = round(statistics.median(reviews), 0) if reviews else None

        brand_counter = Counter(brands)
        brand_count = len(brand_counter)
        total_branded = len(brands)
        top3_share = (
            round(sum(c for _, c in brand_counter.most_common(3)) / total_branded * 100, 1)
            if total_branded else None
        )

        # Estimated margin
        estimated_margin = None
        if median_price and median_price > 0:
            cost = (median_price * 0.15) + 3.50 + (median_price * 0.25) + 1.50
            estimated_margin = round(((median_price - cost) / median_price) * 100, 1)

        # Monthly bought coverage
        bought_count = sum(1 for p in raw_products if p.get("monthly_bought"))
        monthly_bought_pct = round(bought_count / n * 100, 1) if n else None

        # Difficulty score (0-100, higher = harder)
        difficulty_score = 0.0
        if median_reviews is not None:
            if median_reviews >= 1000:
                difficulty_score += 40
            elif median_reviews >= 500:
                difficulty_score += 30
            elif median_reviews >= 200:
                difficulty_score += 20
            elif median_reviews >= 50:
                difficulty_score += 10
            else:
                difficulty_score += 0

        if top3_share is not None:
            if top3_share >= 60:
                difficulty_score += 30
            elif top3_share >= 40:
                difficulty_score += 20
            elif top3_share >= 25:
                difficulty_score += 10

        if brand_count is not None:
            if brand_count <= 3:
                difficulty_score += 20
            elif brand_count <= 5:
                difficulty_score += 10

        # Extra: many badges = entrenched market
        badge_count = sum(1 for p in raw_products if p.get("is_best_seller") or p.get("is_amazon_choice"))
        if badge_count >= 5:
            difficulty_score += 10

        difficulty_score = min(difficulty_score, 100)

        if difficulty_score >= 60:
            difficulty = "hard"
        elif difficulty_score >= 35:
            difficulty = "medium"
        else:
            difficulty = "easy"

        return {
            "keyword": keyword,
            "total_products": n,
            "difficulty": difficulty,
            "difficulty_score": round(difficulty_score, 0),
            "avg_price": avg_price,
            "median_reviews": median_reviews,
            "brand_count": brand_count,
            "top3_brand_share": top3_share,
            "estimated_margin": estimated_margin,
            "monthly_bought_pct": monthly_bought_pct,
            "search_result_count": search_result_count or None,
        }

    async def get_analysis_history(self, db_ref=None, limit: int = 20):
        """Return most recent analysis per unique keyword."""
        pipeline = [
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": {"$toLower": "$keyword"},
                "doc": {"$first": "$$ROOT"},
            }},
            {"$replaceRoot": {"newRoot": "$doc"}},
            {"$sort": {"created_at": -1}},
            {"$limit": limit},
        ]
        cursor = _database.db.niche_analyses.aggregate(pipeline)
        docs = await cursor.to_list(length=limit)
        return docs

    async def get_analysis_by_id(self, analysis_id: int, db_ref=None):
        doc = await _database.db.niche_analyses.find_one({"id": analysis_id})
        if not doc:
            return None
        return self._doc_to_response(doc)

    async def get_dashboard_summary(self, db_ref=None):
        # Get unique analyses (most recent per keyword)
        pipeline = [
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": {"$toLower": "$keyword"},
                "doc": {"$first": "$$ROOT"},
            }},
            {"$replaceRoot": {"newRoot": "$doc"}},
        ]
        unique_docs = await _database.db.niche_analyses.aggregate(pipeline).to_list(length=100)
        total_analyses = len(unique_docs)

        # Total products
        total_products = await _database.db.products.count_documents({})

        # Top opportunities
        top_opp = sorted(
            [d for d in unique_docs if d.get("opportunity_score") is not None],
            key=lambda d: d["opportunity_score"],
            reverse=True,
        )[:5]

        # Recent
        recent = sorted(unique_docs, key=lambda d: d.get("created_at", datetime.min), reverse=True)[:5]

        return {
            "total_analyses": total_analyses,
            "total_products_tracked": total_products,
            "top_opportunities": [self._doc_to_response(d) for d in top_opp],
            "recent_analyses": [self._doc_to_response(d) for d in recent],
        }

    def _doc_to_response(self, a: dict) -> NicheAnalysisResponse:
        """Convert a MongoDB document to a NicheAnalysisResponse."""
        # top_brands: stored as list of dicts natively in MongoDB
        top_brands_raw = a.get("top_brands") or []
        top_brands = []
        if isinstance(top_brands_raw, list):
            top_brands = [BrandInfo(**b) for b in top_brands_raw]

        # Distributions: stored as list of dicts natively
        price_dist_raw = a.get("price_distribution") or []
        price_distribution = []
        if isinstance(price_dist_raw, list):
            price_distribution = [PriceRange(**p) for p in price_dist_raw]

        rating_distribution = a.get("rating_distribution") or []
        review_distribution = a.get("review_distribution") or []

        return NicheAnalysisResponse(
            id=a["id"],
            keyword=a["keyword"],
            parent_keyword=a.get("parent_keyword"),
            total_products=a.get("total_products", 0),
            avg_price=a.get("avg_price"),
            min_price=a.get("min_price"),
            max_price=a.get("max_price"),
            median_price=a.get("median_price"),
            avg_rating=a.get("avg_rating"),
            avg_reviews=a.get("avg_reviews"),
            avg_bsr=a.get("avg_bsr"),
            top_brands=top_brands,
            brand_count=a.get("brand_count"),
            top3_brand_share=a.get("top3_brand_share"),
            opportunity_score=a.get("opportunity_score"),
            demand_score=a.get("demand_score"),
            competition_score=a.get("competition_score"),
            price_score=a.get("price_score"),
            quality_gap_score=a.get("quality_gap_score"),
            entrant_viability_score=a.get("entrant_viability_score"),
            revenue_estimate=a.get("revenue_estimate"),
            revenue_top=a.get("revenue_top"),
            revenue_entry=a.get("revenue_entry"),
            median_reviews=a.get("median_reviews"),
            prime_percentage=a.get("prime_percentage"),
            monthly_bought_percentage=a.get("monthly_bought_percentage"),
            best_seller_percentage=a.get("best_seller_percentage"),
            amazon_choice_percentage=a.get("amazon_choice_percentage"),
            estimated_margin=a.get("estimated_margin"),
            search_result_count=a.get("search_result_count"),
            demand_breakdown=a.get("demand_breakdown") or [],
            competition_breakdown=a.get("competition_breakdown") or [],
            price_breakdown=a.get("price_breakdown") or [],
            quality_breakdown=a.get("quality_breakdown") or [],
            entrant_viability_breakdown=a.get("entrant_viability_breakdown") or [],
            saturation=a.get("saturation"),
            price_opportunity=a.get("price_opportunity"),
            price_distribution=price_distribution,
            rating_distribution=rating_distribution,
            review_distribution=review_distribution,
            # Keepa historical data
            keepa_trend=a.get("keepa_trend"),
            keepa_seasonality=a.get("keepa_seasonality"),
            keepa_price_stability=a.get("keepa_price_stability"),
            keepa_seller_dynamics=a.get("keepa_seller_dynamics"),
            keepa_rating_evolution=a.get("keepa_rating_evolution"),
            keepa_sales_estimate=a.get("keepa_sales_estimate"),
            keepa_data_confidence=a.get("keepa_data_confidence"),
            keepa_products_analyzed=a.get("keepa_products_analyzed"),
            launch_investment=a.get("launch_investment"),
            created_at=a.get("created_at"),
        )


analyzer = NicheAnalyzer()
