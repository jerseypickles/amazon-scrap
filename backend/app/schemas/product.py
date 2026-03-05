from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ProductBase(BaseModel):
    asin: str
    title: str
    brand: str | None = None
    price: float | None = None
    original_price: float | None = None
    rating: float | None = None
    reviews_count: int | None = None
    bsr: int | None = None
    bsr_category: str | None = None
    image_url: str | None = None
    product_url: str | None = None
    category: str | None = None
    is_prime: bool | None = None
    seller_count: int | None = None
    description: str | None = None
    features: str | None = None
    search_keyword: str | None = None


class ProductResponse(ProductBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchRequest(BaseModel):
    keyword: str
    pages: int = 1


class SearchResponse(BaseModel):
    keyword: str
    total_results: int
    products: list[ProductResponse]
