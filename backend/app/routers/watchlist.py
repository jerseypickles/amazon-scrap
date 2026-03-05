from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException

import app.database as _database
from app.schemas.watchlist import NotificationResponse, WatchlistAddRequest, WatchlistItemResponse
from app.services.monitor import monitor

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


def _doc_to_watchlist_response(doc: dict) -> WatchlistItemResponse:
    """Convert a MongoDB document to a WatchlistItemResponse, stripping _id."""
    d = {k: v for k, v in doc.items() if k != "_id"}
    return WatchlistItemResponse(**d)


def _doc_to_notification_response(doc: dict) -> NotificationResponse:
    d = {k: v for k, v in doc.items() if k != "_id"}
    return NotificationResponse(**d)


@router.get("")
async def get_watchlist():
    items = await monitor.get_watchlist()
    return {
        "total": len(items),
        "items": [_doc_to_watchlist_response(item) for item in items],
    }


@router.post("")
async def add_to_watchlist(request: WatchlistAddRequest):
    item = await monitor.add_to_watchlist(
        keyword=request.keyword,
        analysis_id=request.analysis_id,
        score=request.score,
        interval_hours=request.interval_hours,
        notes=request.notes,
    )
    return _doc_to_watchlist_response(item)


@router.get("/check/{keyword}")
async def check_watchlist(keyword: str):
    """Check if a keyword is in the active watchlist."""
    item = await _database.db.watchlist_items.find_one({
        "keyword": {"$regex": f"^{re.escape(keyword)}$", "$options": "i"},
        "is_active": True,
    })
    return {"watched": item is not None, "item_id": item["id"] if item else None}


@router.delete("/{item_id}")
async def remove_from_watchlist(item_id: int):
    removed = await monitor.remove_from_watchlist(item_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    return {"status": "removed"}


# --- Notifications ---
@router.get("/notifications")
async def get_notifications(unread_only: bool = False):
    notifs = await monitor.get_notifications(unread_only=unread_only)
    return {
        "total": len(notifs),
        "unread_count": await monitor.get_unread_count(),
        "notifications": [_doc_to_notification_response(n) for n in notifs],
    }


@router.get("/notifications/unread-count")
async def get_unread_count():
    count = await monitor.get_unread_count()
    return {"count": count}


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: int):
    await monitor.mark_notification_read(notification_id)
    return {"status": "read"}


@router.put("/notifications/read-all")
async def mark_all_read():
    await monitor.mark_all_read()
    return {"status": "all_read"}
