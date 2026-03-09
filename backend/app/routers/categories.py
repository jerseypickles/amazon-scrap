from __future__ import annotations

import logging
import random

from fastapi import APIRouter

import app.database as _database
from app.utils.amazon_categories import AMAZON_US_CATEGORIES, POPULAR_NICHES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/categories", tags=["categories"])

# ── Build lookup tables from category data ──────────────────────
# term → {category_id, category_name, subcategory_name}
_TERM_TO_CATEGORY: dict[str, dict] = {}
# category_id → list of all search_terms
_CATEGORY_TERMS: dict[str, list[str]] = {}
_ALL_SEARCH_TERMS: set[str] = set()

for _cat in AMAZON_US_CATEGORIES:
    _cat_terms: list[str] = []
    for _sub in _cat.get("subcategories", []):
        for _term in _sub.get("search_terms", []):
            _ALL_SEARCH_TERMS.add(_term)
            _cat_terms.append(_term)
            _TERM_TO_CATEGORY[_term] = {
                "category_id": _cat["id"],
                "category_name": _cat["name"],
                "subcategory": _sub["name"],
            }
    _CATEGORY_TERMS[_cat["id"]] = _cat_terms


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


def _niche_entry(
    kw: str,
    info: dict | None = None,
    section: str = "discover",
) -> dict:
    """Build a single niche entry dict."""
    cat_info = _TERM_TO_CATEGORY.get(kw)
    if info:
        score = info.get("opportunity_score")
        return {
            "keyword": kw,
            "analyzed": True,
            "analysis_id": info.get("analysis_id"),
            "opportunity_score": score,
            "avg_price": info.get("avg_price"),
            "avg_rating": info.get("avg_rating"),
            "total_products": info.get("total_products"),
            "brand_count": info.get("brand_count"),
            "label": _score_label(score),
            "section": section,
            "category_id": cat_info["category_id"] if cat_info else None,
            "category_name": cat_info["category_name"] if cat_info else None,
            "created_at": info.get("created_at"),
        }
    return {
        "keyword": kw,
        "analyzed": False,
        "analysis_id": None,
        "opportunity_score": None,
        "avg_price": None,
        "avg_rating": None,
        "total_products": None,
        "brand_count": None,
        "label": "Nuevo",
        "section": section,
        "category_id": cat_info["category_id"] if cat_info else None,
        "category_name": cat_info["category_name"] if cat_info else None,
        "created_at": None,
    }


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
    """Dynamic smart niche suggestions in three sections:

    1. **analyzed** — All niches the user has already analyzed, sorted by
       score descending.  Always shown.
    2. **suggested** — Unanalyzed keywords from the *same categories* the
       user has explored.  Helps deepen research in areas of interest.
    3. **discover** — Random unanalyzed keywords from categories the user
       has *not* explored yet.  Rotates on every page load so there's
       always something new to find.
    """
    db = _database.get_db()

    # ── 1. Fetch ALL analyses from DB (not just POPULAR_NICHES) ──
    pipeline = [
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

    analyzed_keywords = set(analyzed_map.keys())

    # ── 2. Detect user's interested categories ──
    interested_categories: set[str] = set()
    for kw in analyzed_keywords:
        cat_info = _TERM_TO_CATEGORY.get(kw)
        if cat_info:
            interested_categories.add(cat_info["category_id"])

    # ── 3. Build sections ──

    # Section: analyzed (all user analyses, sorted by score)
    section_analyzed: list[dict] = []
    for kw, info in analyzed_map.items():
        section_analyzed.append(_niche_entry(kw, info, section="analyzed"))
    section_analyzed.sort(
        key=lambda x: x["opportunity_score"] or 0, reverse=True,
    )

    # Section: suggested (unanalyzed terms from interested categories)
    suggested_pool: list[str] = []
    for cat_id in interested_categories:
        for term in _CATEGORY_TERMS.get(cat_id, []):
            if term not in analyzed_keywords:
                suggested_pool.append(term)
    # Deduplicate preserving order
    seen: set[str] = set()
    suggested_unique: list[str] = []
    for t in suggested_pool:
        if t not in seen:
            seen.add(t)
            suggested_unique.append(t)
    random.shuffle(suggested_unique)
    section_suggested = [
        _niche_entry(kw, analyzed_map.get(kw), section="suggested")
        for kw in suggested_unique[:20]
    ]

    # Section: discover (random terms from OTHER categories)
    discover_pool: list[str] = []
    for cat_id, terms in _CATEGORY_TERMS.items():
        if cat_id not in interested_categories:
            for t in terms:
                if t not in analyzed_keywords and t not in seen:
                    discover_pool.append(t)
                    seen.add(t)
    random.shuffle(discover_pool)
    section_discover = [
        _niche_entry(kw, section="discover")
        for kw in discover_pool[:20]
    ]

    return {
        "analyzed": section_analyzed,
        "suggested": section_suggested,
        "discover": section_discover,
        "interested_categories": sorted(interested_categories),
        "total_available": len(_ALL_SEARCH_TERMS),
        "analyzed_count": len(section_analyzed),
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
