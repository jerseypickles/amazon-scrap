"""Watchlist, Notification, and AIInsight document helpers for MongoDB."""
from __future__ import annotations

from datetime import datetime, timezone


def new_watchlist_item_doc(id: int, **fields) -> dict:
    now = datetime.now(timezone.utc)
    initial_score = fields.get("last_score")
    score_history: list[dict] = []
    if initial_score is not None:
        score_history.append({"score": initial_score, "date": now.isoformat()})
    return {
        "id": id,
        "keyword": fields.get("keyword", ""),
        "last_analysis_id": fields.get("last_analysis_id"),
        "last_score": initial_score,
        "previous_score": fields.get("previous_score"),
        "score_trend": fields.get("score_trend"),
        "score_history": score_history,
        "check_interval_hours": fields.get("check_interval_hours", 24),
        "is_active": fields.get("is_active", True),
        "is_paused": False,
        "notes": fields.get("notes"),
        "last_checked_at": fields.get("last_checked_at"),
        "created_at": now,
    }


def new_notification_doc(id: int, **fields) -> dict:
    return {
        "id": id,
        "type": fields.get("type", "info"),
        "title": fields.get("title", ""),
        "message": fields.get("message", ""),
        "keyword": fields.get("keyword"),
        "analysis_id": fields.get("analysis_id"),
        "is_read": fields.get("is_read", False),
        "severity": fields.get("severity", "info"),
        "created_at": datetime.now(timezone.utc),
    }


def new_tracked_product_doc(id: int, **fields) -> dict:
    """Build a tracked product document for ASIN monitoring."""
    now = datetime.now(timezone.utc)
    initial_snapshot: list[dict] = []
    if fields.get("price") is not None or fields.get("bsr") is not None:
        initial_snapshot.append({
            "date": now.isoformat(),
            "price": fields.get("price"),
            "bsr": fields.get("bsr"),
            "rating": fields.get("rating"),
            "reviews_count": fields.get("reviews_count"),
            "is_best_seller": fields.get("is_best_seller", False),
            "is_amazon_choice": fields.get("is_amazon_choice", False),
            "monthly_bought": fields.get("monthly_bought"),
        })
    return {
        "id": id,
        "asin": fields.get("asin", ""),
        "title": fields.get("title", ""),
        "brand": fields.get("brand"),
        "image_url": fields.get("image_url"),
        "product_url": fields.get("product_url"),
        "category": fields.get("category"),
        "current_price": fields.get("price"),
        "current_bsr": fields.get("bsr"),
        "current_bsr_category": fields.get("bsr_category"),
        "current_rating": fields.get("rating"),
        "current_reviews": fields.get("reviews_count"),
        "current_is_best_seller": fields.get("is_best_seller", False),
        "current_is_amazon_choice": fields.get("is_amazon_choice", False),
        "current_monthly_bought": fields.get("monthly_bought"),
        "features": fields.get("features"),
        "description": fields.get("description"),
        "snapshots": initial_snapshot,
        "check_interval_hours": fields.get("check_interval_hours", 24),
        "is_active": True,
        "is_paused": False,
        "notes": fields.get("notes"),
        "from_keyword": fields.get("from_keyword"),
        "from_analysis_id": fields.get("from_analysis_id"),
        "last_checked_at": now,
        "created_at": now,
    }


def new_ai_insight_doc(id: int, **fields) -> dict:
    return {
        "id": id,
        "analysis_id": fields.get("analysis_id"),
        "keyword": fields.get("keyword", ""),
        "insight_type": fields.get("insight_type", ""),
        "content": fields.get("content", ""),
        "created_at": datetime.now(timezone.utc),
    }
