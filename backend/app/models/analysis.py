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
        "revenue_estimate": fields.get("revenue_estimate"),
        "price_distribution": fields.get("price_distribution"),  # list of dicts
        "rating_distribution": fields.get("rating_distribution"),  # list of dicts
        "review_distribution": fields.get("review_distribution"),  # list of dicts
        "created_at": datetime.now(timezone.utc),
    }
