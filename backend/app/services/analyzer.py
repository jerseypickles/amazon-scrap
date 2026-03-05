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

        # Opportunity scores — pass full product data for richer analysis
        demand_score, demand_bd = self._calc_demand_score(raw_products, reviews, prices)
        competition_score, competition_bd = self._calc_competition_score(
            raw_products, reviews, brand_count, top3_share,
        )
        price_score, price_bd = self._calc_price_score(prices, avg_price, median_price)
        quality_gap_score, quality_bd = self._calc_quality_gap_score(ratings, reviews)

        opportunity_score = round(
            (demand_score * 0.30)
            + (competition_score * 0.30)
            + (price_score * 0.20)
            + (quality_gap_score * 0.20),
            1,
        )

        logger.info(
            "Scores for '%s': demand=%.1f, competition=%.1f, price=%.1f, quality=%.1f → opportunity=%.1f",
            keyword, demand_score, competition_score, price_score, quality_gap_score, opportunity_score,
        )

        # Revenue estimate
        revenue_estimate = self._estimate_monthly_revenue(raw_products, avg_price)

        # Extended metrics
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
            revenue_estimate=round(revenue_estimate, 2) if revenue_estimate else None,
            # New fields
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
            saturation=saturation,
            price_opportunity=price_opportunity,
            # Distributions
            price_distribution=[p.model_dump() for p in price_dist],
            rating_distribution=rating_dist,
            review_distribution=review_dist,
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
    ) -> tuple[float, list[dict]]:
        """Demand = is there real buyer activity in this niche?

        Returns (score, breakdown) where breakdown is a list of signal dicts.
        """
        breakdown = []
        if not products:
            return 0.0, []

        n = len(products)
        score = 0.0

        # --- Signal 1: monthly_bought (40% weight) ---
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
            signal_val = round(bought_score * 0.40, 1)
            score += signal_val
            breakdown.append({"signal": "Compras Mensuales", "value": f"{avg_bought:,.0f} prom ({coverage:.0%} cobertura)", "score": round(bought_score, 1), "weight": 40, "weighted": signal_val})
        else:
            signal_val = round(20 * 0.40, 1)
            score += signal_val
            breakdown.append({"signal": "Compras Mensuales", "value": "Sin datos", "score": 20, "weight": 40, "weighted": signal_val})

        # --- Signal 2: review velocity proxy (30% weight) ---
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
            signal_val = round(rev_score * 0.30, 1)
            score += signal_val
            breakdown.append({"signal": "Mediana Reviews", "value": f"{median_reviews:,.0f}", "score": rev_score, "weight": 30, "weighted": signal_val})
        else:
            signal_val = round(10 * 0.30, 1)
            score += signal_val
            breakdown.append({"signal": "Mediana Reviews", "value": "0", "score": 10, "weight": 30, "weighted": signal_val})

        # --- Signal 3: market breadth (15% weight) ---
        products_with_reviews = sum(1 for r in reviews if r > 0) if reviews else 0
        activity_ratio = products_with_reviews / n if n else 0
        breadth_score = activity_ratio * 100
        signal_val = round(breadth_score * 0.15, 1)
        score += signal_val
        breakdown.append({"signal": "Actividad del Mercado", "value": f"{activity_ratio:.0%} con reviews", "score": round(breadth_score, 1), "weight": 15, "weighted": signal_val})

        # --- Signal 4: FBA viability (15% weight) ---
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
        signal_val = round(fba_score * 0.15, 1)
        score += signal_val
        breakdown.append({"signal": "Viabilidad FBA", "value": f"{prime_ratio:.0%} Prime", "score": fba_score, "weight": 15, "weighted": signal_val})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_competition_score(
        self, products: list[dict], reviews: list[int],
        brand_count: int | None, top3_share: float | None,
    ) -> tuple[float, list[dict]]:
        """Competition = how hard is it to enter this niche?
        HIGH score = LOW competition (good for us).
        Returns (score, breakdown).
        """
        breakdown = []
        if not products:
            return 50.0, []

        n = len(products)
        score = 0.0

        # --- Signal 1: How entrenched are the leaders? (35% weight) ---
        sorted_reviews = sorted(reviews, reverse=True) if reviews else []
        top10_reviews = sorted_reviews[:10]
        if top10_reviews:
            median_top10 = statistics.median(top10_reviews)
            if median_top10 < 100:
                leader_score = 90
            elif median_top10 < 300:
                leader_score = 75
            elif median_top10 < 800:
                leader_score = 60
            elif median_top10 < 2000:
                leader_score = 40
            elif median_top10 < 5000:
                leader_score = 25
            else:
                leader_score = 10
            signal_val = round(leader_score * 0.35, 1)
            score += signal_val
            breakdown.append({"signal": "Líderes Atrincherados", "value": f"{median_top10:,.0f} reviews mediana top-10", "score": leader_score, "weight": 35, "weighted": signal_val})
        else:
            score += 50 * 0.35
            breakdown.append({"signal": "Líderes Atrincherados", "value": "Sin datos", "score": 50, "weight": 35, "weighted": round(50 * 0.35, 1)})

        # --- Signal 2: Brand concentration (25% weight) ---
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
            signal_val = round(conc_score * 0.25, 1)
            score += signal_val
            breakdown.append({"signal": "Concentración Top-3", "value": f"{top3_share:.1f}% del mercado", "score": conc_score, "weight": 25, "weighted": signal_val})
        else:
            score += 50 * 0.25
            breakdown.append({"signal": "Concentración Top-3", "value": "Sin datos", "score": 50, "weight": 25, "weighted": round(50 * 0.25, 1)})

        # --- Signal 3: Brand diversity (15% weight) ---
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
            signal_val = round(div_score * 0.15, 1)
            score += signal_val
            breakdown.append({"signal": "Diversidad de Marcas", "value": f"{brand_count} marcas únicas", "score": div_score, "weight": 15, "weighted": signal_val})
        else:
            score += 50 * 0.15
            breakdown.append({"signal": "Diversidad de Marcas", "value": "Sin datos", "score": 50, "weight": 15, "weighted": round(50 * 0.15, 1)})

        # --- Signal 4: Amazon dominance indicators (15% weight) ---
        badge_count = sum(
            1 for p in products
            if p.get("is_best_seller") or p.get("is_amazon_choice")
        )
        badge_ratio = badge_count / n if n else 0
        if badge_ratio < 0.05:
            badge_score = 80
        elif badge_ratio < 0.10:
            badge_score = 65
        elif badge_ratio < 0.20:
            badge_score = 50
        elif badge_ratio < 0.35:
            badge_score = 35
        else:
            badge_score = 15
        signal_val = round(badge_score * 0.15, 1)
        score += signal_val
        breakdown.append({"signal": "Badges Amazon", "value": f"{badge_count} badges ({badge_ratio:.0%})", "score": badge_score, "weight": 15, "weighted": signal_val})

        # --- Signal 5: Review gap between top and bottom (10% weight) ---
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
                signal_val = round(gap_score * 0.10, 1)
                score += signal_val
                breakdown.append({"signal": "Brecha Reviews", "value": f"Top {top_median:,.0f} vs Bottom {bottom_median:,.0f}", "score": gap_score, "weight": 10, "weighted": signal_val})
            else:
                score += 50 * 0.10
                breakdown.append({"signal": "Brecha Reviews", "value": "Sin datos", "score": 50, "weight": 10, "weighted": round(50 * 0.10, 1)})
        else:
            score += 50 * 0.10
            breakdown.append({"signal": "Brecha Reviews", "value": "Pocos productos", "score": 50, "weight": 10, "weighted": round(50 * 0.10, 1)})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_price_score(
        self, prices: list[float],
        avg_price: float | None, median_price: float | None,
    ) -> tuple[float, list[dict]]:
        """Price = is the price point viable for private label profit?
        Returns (score, breakdown).
        """
        breakdown = []
        if not prices or avg_price is None:
            return 30.0, []

        score = 0.0
        ref_price = median_price if median_price else avg_price

        # --- Signal 1: Price sweet spot (50% weight) ---
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
        signal_val = round(sweet_score * 0.50, 1)
        score += signal_val
        breakdown.append({"signal": "Rango de Precio", "value": f"${ref_price:.2f} (ideal $18-45)", "score": sweet_score, "weight": 50, "weighted": signal_val})

        # --- Signal 2: Estimated net margin (30% weight) ---
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
        signal_val = round(margin_score * 0.30, 1)
        score += signal_val
        breakdown.append({"signal": "Margen Neto Estimado", "value": f"{estimated_margin_pct:.0f}%", "score": margin_score, "weight": 30, "weighted": signal_val})

        # --- Signal 3: Price diversity (20% weight) ---
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
            signal_val = round(diversity_score * 0.20, 1)
            score += signal_val
            breakdown.append({"signal": "Diversidad de Precios", "value": f"CV {cv:.2f}", "score": diversity_score, "weight": 20, "weighted": signal_val})
        else:
            signal_val = round(40 * 0.20, 1)
            score += signal_val
            breakdown.append({"signal": "Diversidad de Precios", "value": "Pocos productos", "score": 40, "weight": 20, "weighted": signal_val})

        return round(min(max(score, 0), 100), 1), breakdown

    def _calc_quality_gap_score(
        self, ratings: list[float], reviews: list[int],
    ) -> tuple[float, list[dict]]:
        """Quality Gap = is there room to win by making a better product?
        HIGH score = customers are unhappy (opportunity).
        Returns (score, breakdown).
        """
        breakdown = []
        if not ratings:
            return 30.0, []

        n = len(ratings)
        score = 0.0

        # --- Signal 1: % of products under 4.0 stars (35% weight) ---
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
            dissatisfaction_score = 10
        signal_val = round(dissatisfaction_score * 0.35, 1)
        score += signal_val
        breakdown.append({"signal": "Productos <4.0 Estrellas", "value": f"{pct_under_4:.0f}% ({under_4}/{n})", "score": dissatisfaction_score, "weight": 35, "weighted": signal_val})

        # --- Signal 2: Weighted dissatisfaction (30% weight) ---
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
                weighted_score = 10
            signal_val = round(weighted_score * 0.30, 1)
            score += signal_val
            breakdown.append({"signal": "Insatisfacción Ponderada", "value": f"{bad_weight_pct:.0f}% reviews en productos <4.0", "score": weighted_score, "weight": 30, "weighted": signal_val})
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
                fb = 10
            signal_val = round(fb * 0.30, 1)
            score += signal_val
            breakdown.append({"signal": "Insatisfacción Ponderada", "value": f"Rating prom {avg_rating:.1f}", "score": fb, "weight": 30, "weighted": signal_val})

        # --- Signal 3: % under 4.3 stars (20% weight) ---
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
            moderate_score = 15
        signal_val = round(moderate_score * 0.20, 1)
        score += signal_val
        breakdown.append({"signal": "Productos <4.3 Estrellas", "value": f"{pct_under_43:.0f}% ({under_43}/{n})", "score": moderate_score, "weight": 20, "weighted": signal_val})

        # --- Signal 4: Rating variance (15% weight) ---
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
            signal_val = round(var_score * 0.15, 1)
            score += signal_val
            breakdown.append({"signal": "Varianza de Calidad", "value": f"Desv. {stdev:.2f}", "score": var_score, "weight": 15, "weighted": signal_val})
        else:
            signal_val = round(40 * 0.15, 1)
            score += signal_val
            breakdown.append({"signal": "Varianza de Calidad", "value": "Pocos productos", "score": 40, "weight": 15, "weighted": signal_val})

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
            avg_rev = statistics.mean(rev_vals) if rev_vals else 0
            rat_vals = [p["rating"] for p in bucket_products if p.get("rating") is not None]
            avg_rat = statistics.mean(rat_vals) if rat_vals else 0
            has_bought = sum(1 for p in bucket_products if p.get("monthly_bought"))

            # Opportunity = low avg reviews (easy entry) + some demand (has_bought > 0)
            if avg_rev < 200:
                entry_ease = "Fácil"
            elif avg_rev < 800:
                entry_ease = "Moderado"
            else:
                entry_ease = "Difícil"

            ranges.append({
                "range": label,
                "count": count,
                "avg_reviews": round(avg_rev, 0),
                "avg_rating": round(avg_rat, 2) if avg_rat else None,
                "has_demand": has_bought > 0,
                "entry_ease": entry_ease,
            })

        # Find best range: low avg_reviews + has_demand + count > 1
        best = None
        best_score = -1
        for r in ranges:
            s = 0
            if r["has_demand"]:
                s += 50
            if r["entry_ease"] == "Fácil":
                s += 40
            elif r["entry_ease"] == "Moderado":
                s += 20
            if r["count"] >= 3:
                s += 10
            if s > best_score:
                best_score = s
                best = r["range"]

        return {"best_range": best or "Sin datos", "ranges": ranges}

    def _estimate_monthly_revenue(
        self, products: list[dict], avg_price: float | None,
    ) -> float | None:
        """Estimate monthly revenue per seller using monthly_bought data.

        If monthly_bought is available, use it directly (most accurate).
        Otherwise, fall back to the industry-standard review-to-sales ratio
        of ~1 review per 15-25 sales (we use 20).
        """
        if not avg_price or not products:
            return None

        bought_texts = [p["monthly_bought"] for p in products if p.get("monthly_bought")]
        if bought_texts:
            bought_nums = [self._parse_monthly_bought(t) for t in bought_texts]
            if bought_nums:
                # Use median (not mean) to avoid one viral product skewing everything
                median_monthly_units = statistics.median(bought_nums)
                return round(median_monthly_units * avg_price, 2)

        # Fallback: review-to-sales ratio (~1 review per 20 sales, last 12 months)
        reviews = [p["reviews_count"] for p in products if p.get("reviews_count") is not None and p["reviews_count"] > 0]
        if reviews:
            median_reviews = statistics.median(reviews)
            # Assume reviews accumulate over ~24 months avg product life
            # ~1 review per 20 purchases → monthly sales ≈ median_reviews / 24 * 20
            estimated_monthly_units = (median_reviews / 24) * 20
            return round(estimated_monthly_units * avg_price, 2)

        return None

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
            revenue_estimate=a.get("revenue_estimate"),
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
            saturation=a.get("saturation"),
            price_opportunity=a.get("price_opportunity"),
            price_distribution=price_distribution,
            rating_distribution=rating_distribution,
            review_distribution=review_distribution,
            created_at=a.get("created_at"),
        )


analyzer = NicheAnalyzer()
