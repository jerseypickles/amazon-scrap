from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BrandInfo(BaseModel):
    name: str
    count: int
    avg_price: float | None = None
    avg_rating: float | None = None
    market_share: float = 0.0
    total_reviews: int = 0
    best_seller_count: int = 0
    amazon_choice_count: int = 0
    has_monthly_bought: bool = False
    threat_level: str = "low"  # low / medium / high


class PriceRange(BaseModel):
    range: str
    count: int


class AnalysisRequest(BaseModel):
    keyword: str
    pages: int = 2
    parent_keyword: str | None = None


class NicheAnalysisResponse(BaseModel):
    id: int
    keyword: str
    total_products: int
    avg_price: float | None = None
    min_price: float | None = None
    max_price: float | None = None
    median_price: float | None = None
    avg_rating: float | None = None
    avg_reviews: float | None = None
    avg_bsr: float | None = None
    top_brands: list[BrandInfo] = []
    brand_count: int | None = None
    top3_brand_share: float | None = None
    opportunity_score: float | None = None
    demand_score: float | None = None
    competition_score: float | None = None
    price_score: float | None = None
    quality_gap_score: float | None = None
    entrant_viability_score: float | None = None
    revenue_estimate: float | None = None
    revenue_top: float | None = None
    revenue_entry: float | None = None
    # Extended metrics
    median_reviews: float | None = None
    prime_percentage: float | None = None
    monthly_bought_percentage: float | None = None
    best_seller_percentage: float | None = None
    amazon_choice_percentage: float | None = None
    estimated_margin: float | None = None
    search_result_count: int | None = None
    # Score breakdowns (each signal that composes the score)
    demand_breakdown: list[dict] = []
    competition_breakdown: list[dict] = []
    price_breakdown: list[dict] = []
    quality_breakdown: list[dict] = []
    entrant_viability_breakdown: list[dict] = []
    # Market saturation
    saturation: dict | None = None
    # Price opportunity window
    price_opportunity: dict | None = None
    # Distributions
    price_distribution: list[PriceRange] = []
    rating_distribution: list[dict] = []
    review_distribution: list[dict] = []
    # Keepa historical data
    keepa_trend: dict | None = None
    keepa_seasonality: dict | None = None
    keepa_price_stability: dict | None = None
    keepa_seller_dynamics: dict | None = None
    keepa_rating_evolution: dict | None = None
    keepa_sales_estimate: dict | None = None
    keepa_data_confidence: int | None = None
    keepa_products_analyzed: int | None = None
    # Launch investment (calculated)
    launch_investment: dict | None = None
    # Newcomer success analysis
    newcomer_success: dict | None = None
    parent_keyword: str | None = None
    created_at: datetime | None = None
    is_cached: bool = False

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    total_analyses: int
    total_products_tracked: int
    top_opportunities: list[NicheAnalysisResponse]
    recent_analyses: list[NicheAnalysisResponse]


class AnalysisHistoryItem(BaseModel):
    id: int
    keyword: str
    total_products: int
    avg_price: float | None
    opportunity_score: float | None
    parent_keyword: str | None = None
    created_at: datetime | None

    model_config = {"from_attributes": True}
