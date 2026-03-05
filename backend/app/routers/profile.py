from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

import app.database as _database
from app.schemas.profile import UserProfile, UserProfileResponse

router = APIRouter(prefix="/api/profile", tags=["profile"])

PROFILE_KEY = "default"  # Single-user app; use a fixed key


async def _get_profile_doc() -> dict | None:
    return await _database.db.user_profile.find_one({"_id": PROFILE_KEY})


async def get_user_profile() -> UserProfile:
    """Retrieve the current user profile (used by other services)."""
    doc = await _get_profile_doc()
    if not doc:
        return UserProfile()
    return UserProfile(**{k: v for k, v in doc.items() if k not in ("_id", "updated_at")})


@router.get("")
async def get_profile():
    doc = await _get_profile_doc()
    if not doc:
        return UserProfileResponse()
    return UserProfileResponse(**{k: v for k, v in doc.items() if k != "_id"})


@router.put("")
async def update_profile(profile: UserProfile):
    data = profile.model_dump()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _database.db.user_profile.update_one(
        {"_id": PROFILE_KEY},
        {"$set": data},
        upsert=True,
    )
    # Invalidate AI insights cache so next analysis uses updated profile
    await _database.db.ai_insights.delete_many({})
    return UserProfileResponse(**data)
