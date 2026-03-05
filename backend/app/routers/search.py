from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query

import app.database as _database
from app.models.product import new_product_doc
from app.services.scraper import scraper

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search_products(
    q: str = Query(..., min_length=1, description="Search keyword"),
    page: int = Query(1, ge=1, le=10),
):
    products = await scraper.search_products(q, page)

    if not products:
        raise HTTPException(status_code=404, detail="No products found")

    # Save to DB
    for p in products:
        existing = await _database.db.products.find_one({"asin": p["asin"]})
        if not existing:
            pid = await _database.get_next_id("products")
            doc = new_product_doc(pid, **p)
            await _database.db.products.insert_one(doc)

    return {
        "keyword": q,
        "page": page,
        "total_results": len(products),
        "products": products,
    }


@router.get("/products")
async def get_saved_products(
    keyword: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_rating: float | None = None,
    limit: int = Query(50, le=200),
):
    query = {}
    if keyword:
        query["search_keyword"] = {"$regex": re.escape(keyword), "$options": "i"}
    if min_price is not None:
        query["price"] = query.get("price", {})
        query["price"]["$gte"] = min_price
    if max_price is not None:
        query["price"] = query.get("price", {})
        query["price"]["$lte"] = max_price
    if min_rating is not None:
        query["rating"] = {"$gte": min_rating}

    products = await _database.db.products.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)

    # Strip _id for JSON serialization
    for p in products:
        p.pop("_id", None)

    return {"total": len(products), "products": products}
