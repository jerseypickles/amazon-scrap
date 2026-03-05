"""Watchlist, Notification, and AIInsight document helpers for MongoDB."""
from __future__ import annotations

from datetime import datetime, timezone


def new_watchlist_item_doc(id: int, **fields) -> dict:
    return {
        "id": id,
        "keyword": fields.get("keyword", ""),
        "last_analysis_id": fields.get("last_analysis_id"),
        "last_score": fields.get("last_score"),
        "previous_score": fields.get("previous_score"),
        "score_trend": fields.get("score_trend"),
        "check_interval_hours": fields.get("check_interval_hours", 24),
        "is_active": fields.get("is_active", True),
        "notes": fields.get("notes"),
        "last_checked_at": fields.get("last_checked_at"),
        "created_at": datetime.now(timezone.utc),
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


def new_ai_insight_doc(id: int, **fields) -> dict:
    return {
        "id": id,
        "analysis_id": fields.get("analysis_id"),
        "keyword": fields.get("keyword", ""),
        "insight_type": fields.get("insight_type", ""),
        "content": fields.get("content", ""),
        "created_at": datetime.now(timezone.utc),
    }
