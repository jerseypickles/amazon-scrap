from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class WatchlistAddRequest(BaseModel):
    keyword: str
    analysis_id: int | None = None
    score: float | None = None
    interval_hours: int = 24
    notes: str | None = None


class ScoreHistoryPoint(BaseModel):
    score: float
    date: str


class WatchlistItemResponse(BaseModel):
    id: int
    keyword: str
    last_analysis_id: int | None = None
    last_score: float | None = None
    previous_score: float | None = None
    score_trend: str | None = None
    score_history: list[ScoreHistoryPoint] = []
    check_interval_hours: int = 24
    is_active: bool = True
    is_paused: bool = False
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


class ProductSnapshot(BaseModel):
    date: str
    price: float | None = None
    bsr: int | None = None
    rating: float | None = None
    reviews_count: int | None = None
    is_best_seller: bool = False
    is_amazon_choice: bool = False
    monthly_bought: str | None = None


class TrackedProductResponse(BaseModel):
    id: int
    asin: str
    title: str
    brand: str | None = None
    image_url: str | None = None
    product_url: str | None = None
    category: str | None = None
    current_price: float | None = None
    current_bsr: int | None = None
    current_bsr_category: str | None = None
    current_rating: float | None = None
    current_reviews: int | None = None
    current_is_best_seller: bool = False
    current_is_amazon_choice: bool = False
    current_monthly_bought: str | None = None
    features: str | None = None
    description: str | None = None
    snapshots: list[ProductSnapshot] = []
    check_interval_hours: int = 24
    is_active: bool = True
    is_paused: bool = False
    notes: str | None = None
    from_keyword: str | None = None
    from_analysis_id: int | None = None
    last_checked_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class TrackProductRequest(BaseModel):
    asin: str
    title: str | None = None
    brand: str | None = None
    price: float | None = None
    rating: float | None = None
    reviews_count: int | None = None
    bsr: int | None = None
    bsr_category: str | None = None
    image_url: str | None = None
    product_url: str | None = None
    is_best_seller: bool = False
    is_amazon_choice: bool = False
    monthly_bought: str | None = None
    from_keyword: str | None = None
    from_analysis_id: int | None = None
    notes: str | None = None
    interval_hours: int = 24


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
