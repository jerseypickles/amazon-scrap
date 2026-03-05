from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.watchlist import AIAnalysisRequest, AIChatRequest, CompareRequest
from app.services.ai_advisor import ai_advisor

router = APIRouter(prefix="/api/ai", tags=["ai-advisor"])


@router.post("/analyze")
async def ai_analyze_niche(request: AIAnalysisRequest):
    """Generate AI-powered strategic analysis for a niche."""
    try:
        # Only use cache when no custom budget (or default budget)
        if not request.budget:
            cached = await ai_advisor.get_cached_insight(request.analysis_id, "full_analysis")
            if cached:
                return {"analysis_id": request.analysis_id, "insight": cached, "cached": True}

        result = await ai_advisor.analyze_niche_ai(request.analysis_id, budget=request.budget)
        return {**result, "cached": False}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/compare")
async def compare_niches(request: CompareRequest):
    """Compare multiple niches and get AI recommendation."""
    if len(request.analysis_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 analyses to compare")
    if len(request.analysis_ids) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 analyses to compare")

    try:
        result = await ai_advisor.compare_niches(request.analysis_ids, budget=request.budget)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")


@router.post("/product-ideas")
async def get_product_ideas(request: AIAnalysisRequest):
    """Generate AI product ideas for a niche."""
    try:
        if not request.budget:
            cached = await ai_advisor.get_cached_insight(request.analysis_id, "product_idea")
            if cached:
                return {**cached, "cached": True}

        result = await ai_advisor.get_product_ideas(request.analysis_id, budget=request.budget)
        return {**result, "cached": False}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Product ideas generation failed: {str(e)}")


@router.post("/refresh/{analysis_id}")
async def refresh_ai_analysis(analysis_id: int, budget: int | None = None):
    """Force refresh AI analysis (bypass cache)."""
    try:
        result = await ai_advisor.analyze_niche_ai(analysis_id, budget=budget)
        return {**result, "cached": False}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/chat")
async def ai_chat(request: AIChatRequest):
    """Interactive chat about a specific niche analysis."""
    try:
        result = await ai_advisor.chat(
            analysis_id=request.analysis_id,
            message=request.message,
            history=request.history,
            budget=request.budget,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")
