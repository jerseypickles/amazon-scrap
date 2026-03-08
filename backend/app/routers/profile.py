from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException

import app.database as _database
from app.schemas.profile import (
    SavedProfile,
    SavedProfileResponse,
    UserProfile,
    UserProfileResponse,
)

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


# ── Saved Profiles ──────────────────────────────────────────────

@router.get("/saved", response_model=list[SavedProfileResponse])
async def list_saved_profiles():
    cursor = _database.db.saved_profiles.find().sort("created_at", 1)
    active_doc = await _get_profile_doc()
    active_saved_id = active_doc.get("active_saved_id") if active_doc else None
    results = []
    async for doc in cursor:
        results.append(SavedProfileResponse(
            id=str(doc["_id"]),
            name=doc["name"],
            profile=UserProfile(**{k: v for k, v in doc["profile"].items()}),
            is_active=str(doc["_id"]) == active_saved_id,
            created_at=doc.get("created_at"),
        ))
    return results


@router.post("/saved", response_model=SavedProfileResponse)
async def save_profile(saved: SavedProfile):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "name": saved.name,
        "profile": saved.profile.model_dump(),
        "created_at": now,
    }
    result = await _database.db.saved_profiles.insert_one(doc)
    return SavedProfileResponse(
        id=str(result.inserted_id),
        name=saved.name,
        profile=saved.profile,
        is_active=False,
        created_at=now,
    )


@router.post("/saved/{profile_id}/load")
async def load_saved_profile(profile_id: str):
    """Load a saved profile as the active profile."""
    try:
        doc = await _database.db.saved_profiles.find_one({"_id": ObjectId(profile_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid profile ID")
    if not doc:
        raise HTTPException(status_code=404, detail="Saved profile not found")

    profile_data = doc["profile"]
    profile_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    profile_data["active_saved_id"] = profile_id
    await _database.db.user_profile.update_one(
        {"_id": PROFILE_KEY},
        {"$set": profile_data},
        upsert=True,
    )
    await _database.db.ai_insights.delete_many({})
    return {"ok": True, "loaded": doc["name"]}


@router.delete("/saved/{profile_id}")
async def delete_saved_profile(profile_id: str):
    try:
        result = await _database.db.saved_profiles.delete_one({"_id": ObjectId(profile_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid profile ID")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Saved profile not found")
    return {"ok": True}
