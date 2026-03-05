from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query

import app.database as _database
from app.schemas.analysis import AnalysisRequest
from app.services.analyzer import analyzer

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/niche")
async def analyze_niche(request: AnalysisRequest):
    try:
        result = await analyzer.analyze_niche(
            request.keyword, request.pages, parent_keyword=request.parent_keyword,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/history")
async def get_analysis_history():
    docs = await analyzer.get_analysis_history()
    return {
        "total": len(docs),
        "analyses": [
            {
                "id": a["id"],
                "keyword": a["keyword"],
                "total_products": a.get("total_products", 0),
                "avg_price": a.get("avg_price"),
                "opportunity_score": a.get("opportunity_score"),
                "parent_keyword": a.get("parent_keyword"),
                "created_at": a.get("created_at"),
            }
            for a in docs
        ],
    }


@router.get("/dashboard")
async def get_dashboard():
    return await analyzer.get_dashboard_summary()


@router.delete("/purge-all")
async def purge_all_analyses():
    """Delete ALL analyses, products, and AI cache. Use with caution."""
    a = await _database.db.niche_analyses.delete_many({})
    p = await _database.db.products.delete_many({})
    ai = await _database.db.ai_analyses.delete_many({})
    counters = await _database.db.counters.delete_many({"_id": {"$in": ["niche_analyses", "products"]}})
    return {
        "analyses_deleted": a.deleted_count,
        "products_deleted": p.deleted_count,
        "ai_cache_deleted": ai.deleted_count,
        "counters_reset": counters.deleted_count,
    }


@router.post("/cleanup-duplicates")
async def cleanup_duplicate_analyses():
    """Remove duplicate analyses, keeping only the most recent per keyword."""
    # Aggregation: group by lowercase keyword, keep max id
    pipeline = [
        {"$group": {
            "_id": {"$toLower": "$keyword"},
            "keep_id": {"$max": "$id"},
            "all_ids": {"$push": "$id"},
        }},
    ]
    cursor = _database.db.niche_analyses.aggregate(pipeline)
    groups = await cursor.to_list(length=500)

    keep_ids = set()
    to_delete = set()
    for g in groups:
        keep_ids.add(g["keep_id"])
        for aid in g["all_ids"]:
            if aid != g["keep_id"]:
                to_delete.add(aid)

    if to_delete:
        await _database.db.niche_analyses.delete_many({"id": {"$in": list(to_delete)}})

    return {
        "kept": len(keep_ids),
        "deleted": len(to_delete),
        "deleted_ids": sorted(to_delete),
    }


@router.post("/{analysis_id}/rescrape")
async def rescrape_analysis(analysis_id: int):
    """Force re-scrape an analysis using the latest scraper (structured API)."""
    doc = await _database.db.niche_analyses.find_one({"id": analysis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    try:
        result = await analyzer.analyze_niche(doc["keyword"], 2, force=True)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Re-scrape failed: {str(e)}")


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: int):
    result = await analyzer.get_analysis_by_id(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result


@router.get("/{analysis_id}/products")
async def get_analysis_products(
    analysis_id: int,
    limit: int = Query(100, le=200),
):
    # Get the analysis to find its keyword
    analysis_doc = await _database.db.niche_analyses.find_one({"id": analysis_id})
    if not analysis_doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    keyword = analysis_doc["keyword"]

    # Fetch products matching the keyword (case-insensitive)
    products = await _database.db.products.find(
        {"search_keyword": {"$regex": re.escape(keyword), "$options": "i"}},
    ).sort("reviews_count", -1).limit(limit).to_list(length=limit)

    return {
        "analysis_id": analysis_id,
        "keyword": keyword,
        "total": len(products),
        "products": [
            {
                "asin": p.get("asin", ""),
                "title": p.get("title", ""),
                "brand": p.get("brand"),
                "price": p.get("price"),
                "original_price": p.get("original_price"),
                "rating": p.get("rating"),
                "reviews_count": p.get("reviews_count"),
                "image_url": p.get("image_url"),
                "product_url": p.get("product_url") or f"https://www.amazon.com/dp/{p.get('asin', '')}",
                "is_prime": p.get("is_prime"),
                "is_best_seller": p.get("is_best_seller"),
                "is_amazon_choice": p.get("is_amazon_choice"),
                "monthly_bought": p.get("monthly_bought"),
            }
            for p in products
        ],
    }
