"""Product document helpers for MongoDB. Collection: products."""
from __future__ import annotations

from datetime import datetime, timezone


def new_product_doc(id: int, **fields) -> dict:
    """Build a product document ready for MongoDB insertion."""
    now = datetime.now(timezone.utc)
    return {
        "id": id,
        "asin": fields.get("asin", ""),
        "title": fields.get("title", ""),
        "brand": fields.get("brand"),
        "price": fields.get("price"),
        "original_price": fields.get("original_price"),
        "rating": fields.get("rating"),
        "reviews_count": fields.get("reviews_count"),
        "bsr": fields.get("bsr"),
        "bsr_category": fields.get("bsr_category"),
        "image_url": fields.get("image_url"),
        "product_url": fields.get("product_url"),
        "category": fields.get("category"),
        "is_prime": fields.get("is_prime"),
        "is_best_seller": fields.get("is_best_seller"),
        "is_amazon_choice": fields.get("is_amazon_choice"),
        "monthly_bought": fields.get("monthly_bought"),
        "sold_by": fields.get("sold_by"),
        "seller_count": fields.get("seller_count"),
        "description": fields.get("description"),
        "features": fields.get("features"),
        "search_keyword": fields.get("search_keyword"),
        "created_at": now,
        "updated_at": now,
    }
