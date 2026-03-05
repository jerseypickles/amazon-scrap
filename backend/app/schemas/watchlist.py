from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class WatchlistAddRequest(BaseModel):
    keyword: str
    analysis_id: int | None = None
    score: float | None = None
    interval_hours: int = 24
    notes: str | None = None


class WatchlistItemResponse(BaseModel):
    id: int
    keyword: str
    last_analysis_id: int | None = None
    last_score: float | None = None
    previous_score: float | None = None
    score_trend: str | None = None
    check_interval_hours: int = 24
    is_active: bool = True
    notes: str | None = None
    last_checked_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    keyword: str | None = None
    analysis_id: int | None = None
    is_read: bool = False
    severity: str = "info"
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class AIAnalysisRequest(BaseModel):
    analysis_id: int
    budget: int | None = None


class CompareRequest(BaseModel):
    analysis_ids: list[int]
    budget: int | None = None


class AIChatRequest(BaseModel):
    analysis_id: int
    message: str
    budget: int | None = None
    history: list[dict] | None = None
