import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, close_db
from app.routers import analysis, categories, search
from app.routers import ai_advisor, watchlist

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NicheScout - Amazon Niche Analyzer",
    description="AI-powered Amazon US niche analysis for private label opportunities",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(categories.router)
app.include_router(analysis.router)
app.include_router(ai_advisor.router)
app.include_router(watchlist.router)

scheduler = AsyncIOScheduler()


async def run_watchlist_check():
    """Background task to check watchlist items."""
    from app.services.monitor import monitor
    try:
        await monitor.check_watchlist()
    except Exception as e:
        logger.error(f"Watchlist check failed: {e}")


@app.on_event("startup")
async def startup():
    await init_db()
    scheduler.add_job(run_watchlist_check, "interval", minutes=30, id="watchlist_monitor")
    scheduler.start()
    logger.info("NicheScout started with MongoDB Atlas, AI advisor, and monitoring")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
    await close_db()


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "NicheScout",
        "version": "2.0.0",
        "database": "MongoDB Atlas",
        "ai_enabled": bool(settings.anthropic_api_key),
        "monitoring_active": scheduler.running if scheduler else False,
    }
