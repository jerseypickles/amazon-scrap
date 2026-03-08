from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.watchlist import TrackProductRequest, TrackedProductResponse
from app.services.product_tracker import product_tracker
from app.services.keepa_service import keepa_service

router = APIRouter(prefix="/api/tracked-products", tags=["product-tracker"])


def _doc_to_response(doc: dict) -> TrackedProductResponse:
    d = {k: v for k, v in doc.items() if k != "_id"}
    # Migrate old variation format: values were raw dicts or strings, now VariationValue
    if d.get("variations"):
        fixed_vars = []
        for var in d["variations"]:
            if isinstance(var, dict) and "values" in var:
                fixed_values = []
                for v in var["values"]:
                    if isinstance(v, str):
                        fixed_values.append({"value": v, "asin": None, "is_selected": False})
                    elif isinstance(v, dict) and "value" not in v:
                        # Old format: {'asin': '...', 'is_selected': True} without 'value' key
                        label = v.get("name") or v.get("asin") or "?"
                        fixed_values.append({"value": label, "asin": v.get("asin"), "is_selected": v.get("is_selected", False)})
                    else:
                        fixed_values.append(v)
                fixed_vars.append({"name": var.get("name", ""), "values": fixed_values})
            else:
                fixed_vars.append(var)
        d["variations"] = fixed_vars
    return TrackedProductResponse(**d)


@router.get("")
async def get_tracked_products():
    items = await product_tracker.get_tracked_products()
    return {
        "total": len(items),
        "items": [_doc_to_response(item) for item in items],
    }


@router.post("")
async def track_product(request: TrackProductRequest):
    try:
        item = await product_tracker.track_product(
            asin=request.asin,
            title=request.title,
            brand=request.brand,
            price=request.price,
            rating=request.rating,
            reviews_count=request.reviews_count,
            bsr=request.bsr,
            bsr_category=request.bsr_category,
            image_url=request.image_url,
            product_url=request.product_url,
            is_best_seller=request.is_best_seller,
            is_amazon_choice=request.is_amazon_choice,
            monthly_bought=request.monthly_bought,
            from_keyword=request.from_keyword,
            from_analysis_id=request.from_analysis_id,
            notes=request.notes,
            interval_hours=request.interval_hours,
        )
        return _doc_to_response(item)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats")
async def get_stats():
    return await product_tracker.get_stats()


@router.get("/check/{asin}")
async def check_tracked(asin: str):
    return await product_tracker.check_tracked(asin)


@router.get("/debug/keepa/{asin}")
async def debug_keepa(asin: str):
    """Temporary debug endpoint to test Keepa for a single ASIN."""
    result = {"enabled": keepa_service.enabled, "asin": asin}
    if not keepa_service.enabled:
        result["error"] = "Keepa API key not configured"
        return result
    try:
        enrichment = await keepa_service.enrich_asins([asin], days=90)
        result["enrichment"] = enrichment
        result["enrichment_is_none"] = enrichment is None
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
    return result


@router.get("/{product_id}")
async def get_tracked_product(product_id: int):
    item = await product_tracker.get_tracked_product(product_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tracked product not found")
    return _doc_to_response(item)


@router.post("/{product_id}/refresh")
async def force_refresh(product_id: int):
    item = await product_tracker.force_refresh(product_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tracked product not found")
    return _doc_to_response(item)


@router.put("/{product_id}/pause")
async def toggle_pause(product_id: int):
    item = await product_tracker.toggle_pause(product_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tracked product not found")
    return _doc_to_response(item)


@router.put("/{product_id}/notes")
async def update_notes(product_id: int, body: dict):
    item = await product_tracker.update_notes(product_id, body.get("notes", ""))
    if not item:
        raise HTTPException(status_code=404, detail="Tracked product not found")
    return _doc_to_response(item)


@router.delete("/{product_id}")
async def remove_tracked(product_id: int):
    removed = await product_tracker.remove_tracked(product_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Tracked product not found")
    return {"status": "removed"}
