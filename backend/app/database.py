from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

client: AsyncIOMotorClient = None  # type: ignore[assignment]
db: AsyncIOMotorDatabase = None  # type: ignore[assignment]


async def init_db():
    """Connect to MongoDB Atlas and set up indexes."""
    global client, db
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.amazon

    # Create indexes for frequently queried fields
    await db.products.create_index("asin", unique=True)
    await db.products.create_index("search_keyword")
    await db.niche_analyses.create_index("keyword")
    await db.niche_analyses.create_index("created_at")
    await db.watchlist_items.create_index("keyword")
    await db.notifications.create_index("created_at")
    await db.notifications.create_index("is_read")
    await db.ai_insights.create_index("analysis_id")
    await db.tracked_products.create_index("asin", unique=True)
    await db.tracked_products.create_index("is_active")

    # Counter collection for auto-increment IDs
    if await db.counters.count_documents({}) == 0:
        for name in ["products", "niche_analyses", "watchlist_items", "notifications", "ai_insights", "tracked_products"]:
            await db.counters.update_one(
                {"_id": name}, {"$setOnInsert": {"seq": 0}}, upsert=True,
            )


async def close_db():
    """Close MongoDB connection."""
    global client
    if client:
        client.close()


async def get_next_id(collection_name: str) -> int:
    """Get next auto-increment ID for a collection."""
    result = await db.counters.find_one_and_update(
        {"_id": collection_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return result["seq"]


def get_db() -> AsyncIOMotorDatabase:
    """Get database instance. Always returns the current global `db`."""
    return db


# Convenience: services can do `from app.database import mongodb` and use `mongodb()`
def mongodb() -> AsyncIOMotorDatabase:
    """Shortcut to get the current database reference."""
    return db
