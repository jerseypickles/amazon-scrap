from __future__ import annotations

import logging

from fastapi import APIRouter

import app.database as _database
from app.utils.amazon_categories import AMAZON_US_CATEGORIES, POPULAR_NICHES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _score_label(score: float | None) -> str:
    """Map opportunity score to a human-readable label."""
    if score is None:
        return "Nuevo"
    if score >= 70:
        return "Oportunidad"
    if score >= 55:
        return "Bueno"
    if score >= 40:
        return "Competido"
    return "Difícil"


@router.get("")
async def get_categories():
    return {
        "categories": AMAZON_US_CATEGORIES,
        "total": len(AMAZON_US_CATEGORIES),
    }


@router.get("/popular-niches")
async def get_popular_niches():
    return {"niches": POPULAR_NICHES}


@router.get("/smart-niches")
async def get_smart_niches():
    """Cross-reference popular niches with DB analysis data.

    Returns all popular niches — analyzed ones enriched with score/label,
    unanalyzed ones marked as 'Nuevo'. Analyzed first (sorted by score desc),
    then unanalyzed (shuffled for discovery).
    """
    db = _database.get_db()

    # Fetch latest analysis per keyword for all popular niches (case-insensitive)
    pipeline = [
        {"$match": {"keyword": {"$in": POPULAR_NICHES}}},
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": "$keyword",
                "analysis_id": {"$first": "$id"},
                "opportunity_score": {"$first": "$opportunity_score"},
                "avg_price": {"$first": "$avg_price"},
                "avg_rating": {"$first": "$avg_rating"},
                "total_products": {"$first": "$total_products"},
                "brand_count": {"$first": "$brand_count"},
                "created_at": {"$first": "$created_at"},
            }
        },
    ]

    analyzed_map: dict[str, dict] = {}
    try:
        async for doc in db.niche_analyses.aggregate(pipeline):
            analyzed_map[doc["_id"]] = doc
    except Exception:
        logger.exception("Error querying smart niches from DB")

    analyzed: list[dict] = []
    unanalyzed: list[dict] = []

    for kw in POPULAR_NICHES:
        if kw in analyzed_map:
            info = analyzed_map[kw]
            score = info.get("opportunity_score")
            analyzed.append({
                "keyword": kw,
                "analyzed": True,
                "analysis_id": info.get("analysis_id"),
                "opportunity_score": score,
                "avg_price": info.get("avg_price"),
                "avg_rating": info.get("avg_rating"),
                "total_products": info.get("total_products"),
                "brand_count": info.get("brand_count"),
                "label": _score_label(score),
                "created_at": info.get("created_at"),
            })
        else:
            unanalyzed.append({
                "keyword": kw,
                "analyzed": False,
                "analysis_id": None,
                "opportunity_score": None,
                "avg_price": None,
                "avg_rating": None,
                "total_products": None,
                "brand_count": None,
                "label": "Nuevo",
                "created_at": None,
            })

    # Analyzed first sorted by score desc, then unanalyzed
    analyzed.sort(key=lambda x: x["opportunity_score"] or 0, reverse=True)

    return {
        "niches": analyzed + unanalyzed,
        "total": len(POPULAR_NICHES),
        "analyzed_count": len(analyzed),
    }


@router.get("/{category_id}")
async def get_category(category_id: str):
    for cat in AMAZON_US_CATEGORIES:
        if cat["id"] == category_id:
            return cat
        for sub in cat.get("subcategories", []):
            if sub["id"] == category_id:
                return {**sub, "parent": cat["name"]}
    return {"error": "Category not found"}
