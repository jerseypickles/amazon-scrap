from __future__ import annotations

from pydantic import BaseModel


class UserProfile(BaseModel):
    """User business profile that customizes AI analysis."""
    # Business model
    business_model: str = "generic_then_brand"  # "generic_only" | "brand_only" | "generic_then_brand"
    # Product type preference
    product_type: str = "consumable_only"  # "consumable_only" | "any" | "non_consumable_only"
    # Budget
    budget: int = 10000  # USD
    # Experience level
    experience: str = "beginner"  # "beginner" | "intermediate" | "advanced"
    # FBA preference
    fulfillment: str = "fba"  # "fba" | "fbm" | "both"
    # Target marketplace
    marketplace: str = "US"  # "US" | "MX" | "CA" | "UK" | "DE"


class UserProfileResponse(UserProfile):
    updated_at: str | None = None
