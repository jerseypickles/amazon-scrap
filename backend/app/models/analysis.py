"""NicheAnalysis document helpers for MongoDB. Collection: niche_analyses."""
from __future__ import annotations

from datetime import datetime, timezone


def new_analysis_doc(id: int, **fields) -> dict:
    """Build a niche analysis document ready for MongoDB insertion."""
    return {
        "id": id,
        "keyword": fields.get("keyword", ""),
        "parent_keyword": fields.get("parent_keyword"),
        "total_products": fields.get("total_products", 0),
        "avg_price": fields.get("avg_price"),
        "min_price": fields.get("min_price"),
        "max_price": fields.get("max_price"),
        "median_price": fields.get("median_price"),
        "avg_rating": fields.get("avg_rating"),
        "avg_reviews": fields.get("avg_reviews"),
        "avg_bsr": fields.get("avg_bsr"),
        "top_brands": fields.get("top_brands"),  # stored as list of dicts (native MongoDB)
        "brand_count": fields.get("brand_count"),
        "top3_brand_share": fields.get("top3_brand_share"),
        "opportunity_score": fields.get("opportunity_score"),
        "demand_score": fields.get("demand_score"),
        "competition_score": fields.get("competition_score"),
        "price_score": fields.get("price_score"),
        "quality_gap_score": fields.get("quality_gap_score"),
        "entrant_viability_score": fields.get("entrant_viability_score"),
        "revenue_estimate": fields.get("revenue_estimate"),
        "revenue_top": fields.get("revenue_top"),
        "revenue_entry": fields.get("revenue_entry"),
        "median_reviews": fields.get("median_reviews"),
        "prime_percentage": fields.get("prime_percentage"),
        "monthly_bought_percentage": fields.get("monthly_bought_percentage"),
        "best_seller_percentage": fields.get("best_seller_percentage"),
        "amazon_choice_percentage": fields.get("amazon_choice_percentage"),
        "estimated_margin": fields.get("estimated_margin"),
        "search_result_count": fields.get("search_result_count"),
        "demand_breakdown": fields.get("demand_breakdown"),
        "competition_breakdown": fields.get("competition_breakdown"),
        "price_breakdown": fields.get("price_breakdown"),
        "quality_breakdown": fields.get("quality_breakdown"),
        "entrant_viability_breakdown": fields.get("entrant_viability_breakdown"),
        "saturation": fields.get("saturation"),
        "price_opportunity": fields.get("price_opportunity"),
        "price_distribution": fields.get("price_distribution"),  # list of dicts
        "rating_distribution": fields.get("rating_distribution"),  # list of dicts
        "review_distribution": fields.get("review_distribution"),  # list of dicts
        # Keepa historical data
        "keepa_trend": fields.get("keepa_trend"),
        "keepa_seasonality": fields.get("keepa_seasonality"),
        "keepa_price_stability": fields.get("keepa_price_stability"),
        "keepa_seller_dynamics": fields.get("keepa_seller_dynamics"),
        "keepa_rating_evolution": fields.get("keepa_rating_evolution"),
        "keepa_sales_estimate": fields.get("keepa_sales_estimate"),
        "keepa_data_confidence": fields.get("keepa_data_confidence"),
        "keepa_products_analyzed": fields.get("keepa_products_analyzed"),
        # Launch investment (calculated)
        "launch_investment": fields.get("launch_investment"),
        "created_at": datetime.now(timezone.utc),
    }
