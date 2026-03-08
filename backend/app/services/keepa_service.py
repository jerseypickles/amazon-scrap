"""Keepa API integration for historical Amazon product data.

Provides BSR history, price trends, seller count dynamics, and rating
evolution to enrich niche analysis with temporal context.
"""
from __future__ import annotations

import logging
import math
import statistics
from datetime import datetime, timezone

import numpy as np
import keepa

from app.config import settings

logger = logging.getLogger(__name__)

# Keepa time constants
_KEEPA_EPOCH = datetime(2011, 1, 1, tzinfo=timezone.utc)


class KeepaService:
    """Thin wrapper around the keepa SDK focused on niche-analysis needs."""

    def __init__(self):
        self._api: keepa.AsyncKeepa | None = None

    @property
    def enabled(self) -> bool:
        return bool(settings.keepa_api_key)

    async def _get_api(self) -> keepa.AsyncKeepa:
        if self._api is None:
            self._api = await keepa.AsyncKeepa().create(settings.keepa_api_key)
        return self._api

    # ------------------------------------------------------------------
    # Public: fetch enrichment for a list of ASINs
    # ------------------------------------------------------------------
    async def enrich_asins(self, asins: list[str], days: int = 90) -> dict | None:
        """Query Keepa for *asins* and return aggregated niche-level metrics.

        Returns a dict with trend/seasonality/stability data or None on
        failure / missing API key.  Consumes ~1 token per ASIN (no offers).
        """
        if not self.enabled or not asins:
            return None

        try:
            api = await self._get_api()
            products = await api.query(
                asins,
                domain="US",
                history=True,
                stats=days,
                rating=True,
                days=days,
                out_of_stock_as_nan=True,
                progress_bar=False,
                wait=True,
            )
        except Exception as exc:
            logger.warning(
                "Keepa query failed for %d ASINs: [%s] %r",
                len(asins), type(exc).__name__, exc,
            )
            return None

        if products is None or len(products) == 0:
            return None

        # Collect per-product summaries
        bsr_trends: list[dict] = []
        price_trends: list[dict] = []
        seller_trends: list[dict] = []
        rating_trends: list[dict] = []
        monthly_sales_estimates: list[float] = []

        for p in products:
            if not isinstance(p, dict):
                continue

            data = p.get("data", {})
            stats = p.get("stats", {})
            asin = p.get("asin", "?")

            # --- BSR trend ---
            bsr_info = self._analyze_bsr(data, stats, days)
            if bsr_info:
                bsr_trends.append(bsr_info)
                if bsr_info.get("estimated_monthly_sales"):
                    monthly_sales_estimates.append(bsr_info["estimated_monthly_sales"])

            # --- Price trend ---
            price_info = self._analyze_price(data, stats, days)
            if price_info:
                price_trends.append(price_info)

            # --- Seller count trend ---
            seller_info = self._analyze_sellers(data, stats, days)
            if seller_info:
                seller_trends.append(seller_info)

            # --- Rating trend ---
            rating_info = self._analyze_rating(data, stats)
            if rating_info:
                rating_trends.append(rating_info)

        if not bsr_trends and not price_trends:
            return None

        return self._aggregate(
            bsr_trends, price_trends, seller_trends, rating_trends,
            monthly_sales_estimates, days,
        )

    # ------------------------------------------------------------------
    # Internal: per-product analysis helpers
    # ------------------------------------------------------------------

    def _analyze_bsr(self, data: dict, stats: dict, days: int) -> dict | None:
        """Extract BSR trend and estimate monthly sales."""
        sales = _get_array(data, "SALES")
        if sales is None or len(sales) == 0:
            return None

        # Filter valid values (non-NaN, > 0)
        valid = [float(v) for v in sales if _is_valid(v) and v > 0]
        if len(valid) < 2:
            return None

        current_bsr = valid[-1]
        avg_bsr = statistics.mean(valid)
        min_bsr = min(valid)  # best rank
        max_bsr = max(valid)  # worst rank

        # Trend: compare last third vs first third of data
        third = max(len(valid) // 3, 1)
        early_avg = statistics.mean(valid[:third])
        recent_avg = statistics.mean(valid[-third:])

        # Lower BSR = better sales, so if recent < early → improving
        if early_avg > 0:
            bsr_change_pct = ((recent_avg - early_avg) / early_avg) * 100
        else:
            bsr_change_pct = 0.0

        if bsr_change_pct <= -15:
            direction = "improving"
        elif bsr_change_pct >= 15:
            direction = "declining"
        else:
            direction = "stable"

        # Estimate monthly sales from BSR (category-agnostic approximation)
        estimated_sales = self._bsr_to_monthly_sales(current_bsr)

        return {
            "current_bsr": int(current_bsr),
            "avg_bsr": int(avg_bsr),
            "min_bsr": int(min_bsr),
            "max_bsr": int(max_bsr),
            "direction": direction,
            "bsr_change_pct": round(bsr_change_pct, 1),
            "estimated_monthly_sales": estimated_sales,
        }

    def _analyze_price(self, data: dict, stats: dict, days: int) -> dict | None:
        """Extract price stability metrics."""
        # Try Amazon price first, then new (3rd party)
        prices = _get_array(data, "AMAZON")
        if prices is None or len(prices) == 0:
            prices = _get_array(data, "NEW")
        if prices is None or len(prices) == 0:
            return None

        # Keepa stores prices in cents; convert to dollars
        valid = [float(v) / 100.0 for v in prices if _is_valid(v) and v > 0]
        if len(valid) < 2:
            return None

        current = valid[-1]
        avg = statistics.mean(valid)
        mn = min(valid)
        mx = max(valid)

        # Coefficient of variation — price stability
        stdev = statistics.stdev(valid) if len(valid) >= 2 else 0
        cv = (stdev / avg) if avg > 0 else 0

        # Trend
        third = max(len(valid) // 3, 1)
        early_avg = statistics.mean(valid[:third])
        recent_avg = statistics.mean(valid[-third:])
        price_change_pct = ((recent_avg - early_avg) / early_avg * 100) if early_avg > 0 else 0

        if price_change_pct <= -10:
            direction = "declining"
        elif price_change_pct >= 10:
            direction = "rising"
        else:
            direction = "stable"

        if cv < 0.05:
            stability = "very_stable"
        elif cv < 0.15:
            stability = "stable"
        elif cv < 0.30:
            stability = "moderate"
        else:
            stability = "volatile"

        return {
            "current": round(current, 2),
            "avg": round(avg, 2),
            "min": round(mn, 2),
            "max": round(mx, 2),
            "cv": round(cv, 3),
            "stability": stability,
            "direction": direction,
            "price_change_pct": round(price_change_pct, 1),
        }

    def _analyze_sellers(self, data: dict, stats: dict, days: int) -> dict | None:
        """Extract seller count dynamics."""
        counts = _get_array(data, "COUNT_NEW")
        if counts is None or len(counts) == 0:
            return None

        valid = [int(v) for v in counts if _is_valid(v) and v >= 0]
        if len(valid) < 2:
            return None

        current = valid[-1]
        avg = statistics.mean(valid)

        third = max(len(valid) // 3, 1)
        early_avg = statistics.mean(valid[:third])
        recent_avg = statistics.mean(valid[-third:])
        change_pct = ((recent_avg - early_avg) / early_avg * 100) if early_avg > 0 else 0

        if change_pct >= 20:
            direction = "increasing"
        elif change_pct <= -20:
            direction = "decreasing"
        else:
            direction = "stable"

        return {
            "current": current,
            "avg": round(avg, 1),
            "direction": direction,
            "change_pct": round(change_pct, 1),
        }

    def _analyze_rating(self, data: dict, stats: dict) -> dict | None:
        """Extract rating evolution."""
        ratings = _get_array(data, "RATING")
        if ratings is None or len(ratings) == 0:
            return None

        # Keepa stores ratings as 0-50 integers (divide by 10 for stars)
        valid = [float(v) / 10.0 for v in ratings if _is_valid(v) and v > 0]
        if len(valid) < 2:
            return None

        current = valid[-1]
        avg = statistics.mean(valid)

        third = max(len(valid) // 3, 1)
        early_avg = statistics.mean(valid[:third])
        recent_avg = statistics.mean(valid[-third:])
        change = recent_avg - early_avg

        if change <= -0.15:
            direction = "declining"
        elif change >= 0.15:
            direction = "improving"
        else:
            direction = "stable"

        return {
            "current": round(current, 1),
            "avg": round(avg, 2),
            "direction": direction,
            "change": round(change, 2),
        }

    # ------------------------------------------------------------------
    # Aggregation: combine per-product data into niche-level metrics
    # ------------------------------------------------------------------

    def _aggregate(
        self,
        bsr_trends: list[dict],
        price_trends: list[dict],
        seller_trends: list[dict],
        rating_trends: list[dict],
        monthly_sales: list[float],
        days: int,
    ) -> dict:
        """Combine individual product trends into niche-level insight."""

        result: dict = {"keepa_products_analyzed": len(bsr_trends), "days_analyzed": days}

        # --- BSR / Demand trend ---
        if bsr_trends:
            directions = [b["direction"] for b in bsr_trends]
            improving = sum(1 for d in directions if d == "improving")
            declining = sum(1 for d in directions if d == "declining")
            n = len(directions)

            if improving / n >= 0.5:
                niche_trend = "growing"
            elif declining / n >= 0.5:
                niche_trend = "declining"
            else:
                niche_trend = "stable"

            avg_change = statistics.mean([b["bsr_change_pct"] for b in bsr_trends])

            result["trend"] = {
                "direction": niche_trend,
                "avg_bsr_change_pct": round(avg_change, 1),
                "products_improving": improving,
                "products_declining": declining,
                "products_stable": n - improving - declining,
            }

            # Seasonality: if BSR range (max/min ratio) is large → seasonal
            bsr_ranges = [b["max_bsr"] / b["min_bsr"] for b in bsr_trends if b["min_bsr"] > 0]
            if bsr_ranges:
                avg_range_ratio = statistics.mean(bsr_ranges)
                result["seasonality"] = {
                    "bsr_volatility_ratio": round(avg_range_ratio, 1),
                    "is_seasonal": avg_range_ratio > 3.0,
                    "verdict": "Estacional — alta variación en BSR"
                    if avg_range_ratio > 3.0
                    else "Demanda consistente",
                }

        # --- Sales estimate (from BSR) ---
        if monthly_sales:
            result["sales_estimate"] = {
                "median_monthly_units": round(statistics.median(monthly_sales)),
                "avg_monthly_units": round(statistics.mean(monthly_sales)),
                "min_monthly_units": round(min(monthly_sales)),
                "max_monthly_units": round(max(monthly_sales)),
                "source": "keepa_bsr",
            }

        # --- Price stability ---
        if price_trends:
            stabilities = [p["stability"] for p in price_trends]
            volatile_pct = sum(1 for s in stabilities if s in ("volatile", "moderate")) / len(stabilities) * 100
            avg_cv = statistics.mean([p["cv"] for p in price_trends])
            avg_price_change = statistics.mean([p["price_change_pct"] for p in price_trends])

            dirs = [p["direction"] for p in price_trends]
            declining = sum(1 for d in dirs if d == "declining")

            if volatile_pct >= 50:
                verdict = "Precios inestables — riesgo de guerra de precios"
            elif declining / len(dirs) >= 0.5:
                verdict = "Precios en caída — márgenes bajo presión"
            elif avg_cv < 0.10:
                verdict = "Precios muy estables — buen indicador de márgenes"
            else:
                verdict = "Precios moderadamente estables"

            result["price_stability"] = {
                "avg_cv": round(avg_cv, 3),
                "volatile_pct": round(volatile_pct, 1),
                "avg_price_change_pct": round(avg_price_change, 1),
                "prices_declining_pct": round(declining / len(dirs) * 100, 1),
                "verdict": verdict,
            }

        # --- Seller dynamics ---
        if seller_trends:
            dirs = [s["direction"] for s in seller_trends]
            increasing = sum(1 for d in dirs if d == "increasing")
            decreasing = sum(1 for d in dirs if d == "decreasing")
            n = len(dirs)
            avg_change = statistics.mean([s["change_pct"] for s in seller_trends])
            avg_sellers = statistics.mean([s["current"] for s in seller_trends])

            if increasing / n >= 0.5:
                verdict = "Sellers aumentando — competencia creciente"
            elif decreasing / n >= 0.5:
                verdict = "Sellers disminuyendo — posible oportunidad"
            else:
                verdict = "Cantidad de sellers estable"

            result["seller_dynamics"] = {
                "avg_current_sellers": round(avg_sellers, 1),
                "avg_seller_change_pct": round(avg_change, 1),
                "sellers_increasing_pct": round(increasing / n * 100, 1),
                "sellers_decreasing_pct": round(decreasing / n * 100, 1),
                "verdict": verdict,
            }

        # --- Rating evolution ---
        if rating_trends:
            dirs = [r["direction"] for r in rating_trends]
            declining = sum(1 for d in dirs if d == "declining")
            n = len(dirs)
            avg_change = statistics.mean([r["change"] for r in rating_trends])

            if declining / n >= 0.4:
                verdict = "Calidad en declive — oportunidad de mejora"
            elif avg_change >= 0.1:
                verdict = "Calidad mejorando — competidores se adaptan"
            else:
                verdict = "Calidad estable en el nicho"

            result["rating_evolution"] = {
                "avg_rating_change": round(avg_change, 2),
                "ratings_declining_pct": round(declining / n * 100, 1),
                "verdict": verdict,
            }

        # --- Confidence score: how much Keepa data did we actually get? ---
        total_signals = 4  # trend, price, sellers, rating
        present = sum(1 for k in ("trend", "price_stability", "seller_dynamics", "rating_evolution") if k in result)
        result["data_confidence"] = round(present / total_signals * 100)

        return result

    # ------------------------------------------------------------------
    # BSR → Sales estimation
    # ------------------------------------------------------------------

    @staticmethod
    def _bsr_to_monthly_sales(bsr: int) -> float:
        """Approximate monthly sales from BSR.

        Uses a power-law model calibrated against known Amazon data.
        This is a category-agnostic rough estimate.  The actual
        conversion varies per Amazon top-level category, but for niche
        comparison purposes this provides a useful relative signal.

        Formula:  sales ≈ (1_200_000 / bsr) ^ 0.80
        """
        if bsr <= 0:
            return 0
        try:
            return round((1_200_000 / bsr) ** 0.80)
        except (OverflowError, ZeroDivisionError):
            return 0


# ------------------------------------------------------------------
# Module-level helpers (numpy-safe)
# ------------------------------------------------------------------

def _is_valid(v) -> bool:
    """Return True if *v* is a usable numeric value (not None/NaN)."""
    if v is None:
        return False
    try:
        return not (math.isnan(float(v)))
    except (TypeError, ValueError, OverflowError):
        return False


def _get_array(data: dict, key: str) -> list | None:
    """Safely extract a history array from Keepa data dict.

    The keepa SDK returns numpy arrays; convert to plain Python list
    to avoid 'ambiguous truth value' errors downstream.
    """
    arr = data.get(key)
    if arr is None:
        return None
    if isinstance(arr, np.ndarray):
        return arr.tolist()
    if hasattr(arr, "__len__"):
        return list(arr)
    return None


# Singleton
keepa_service = KeepaService()
