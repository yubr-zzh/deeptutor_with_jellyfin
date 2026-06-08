# =============================================================================
# DeepTutor-Plus MoA API Routes
# =============================================================================
# Integration of Open-TutorAi's MoA functionality into DeepTutor backend
# License: Apache 2.0

"""
MoA (Mixture of Agents) API Routes

Provides endpoints for multi-model parallel chat functionality.
"""

import os
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from deeptutor.services.moa import ModelConfig, MoAService, MoAStrategy, get_moa_service


router = APIRouter(prefix="/moa", tags=["moa"])


class MoACompletionRequest(BaseModel):
    """Request model for MoA completion"""
    messages: list[dict] = Field(..., description="Chat messages")
    system_prompt: Optional[str] = Field(None, description="Optional system prompt")
    strategy: str = Field("parallel", description="Merge strategy: parallel, merge, vote")
    models: Optional[list[str]] = Field(None, description="Override default models")


class MoACompletionResponse(BaseModel):
    """Response from MoA completion"""
    responses: list[dict]
    merged: Optional[str] = None
    strategy: str
    total_latency_ms: float


@router.post("/completions", response_model=MoACompletionResponse)
async def generate_moa_completion(request: MoACompletionRequest):
    """
    Generate completions from multiple models in parallel.
    
    This endpoint allows querying multiple LLM models simultaneously
    and optionally merging their responses.
    
    Args:
        request: MoA completion request
        
    Returns:
        Responses from all models plus optional merged response
    """
    try:
        # Convert strategy string to enum
        strategy_map = {
            "parallel": MoAStrategy.PARALLEL,
            "merge": MoAStrategy.MERGE,
            "vote": MoAStrategy.VOTE,
        }
        strategy = strategy_map.get(request.strategy, MoAStrategy.PARALLEL)
        
        if request.models:
            moa_service = MoAService(models=[
                ModelConfig(
                    name=m,
                    provider="openai",
                    model=m,
                )
                for m in request.models
            ])
        else:
            moa_service = get_moa_service()
        
        # Execute MoA chat
        result = await moa_service.chat(
            messages=request.messages,
            system_prompt=request.system_prompt,
            strategy=strategy,
        )
        
        # Format response
        responses = [
            {
                "model": r.model_name,
                "content": r.content,
                "finish_reason": r.finish_reason,
                "latency_ms": r.latency_ms,
                "tokens_used": r.tokens_used,
                "error": r.error,
            }
            for r in result.responses
        ]
        
        return MoACompletionResponse(
            responses=responses,
            merged=result.merged_response,
            strategy=result.strategy.value,
            total_latency_ms=result.total_latency_ms,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def stream_moa_completion(request: MoACompletionRequest):
    """
    Stream completions from multiple models.
    
    Note: This is a simplified streaming endpoint. For full streaming
    support, additional WebSocket handling would be required.
    """
    # TODO: Implement full streaming support
    raise HTTPException(
        status_code=501,
        detail="Streaming not yet implemented. Use /completions for now."
    )


@router.get("/models")
async def list_moa_models():
    """
    List available models for MoA.
    
    Returns:
        List of available models with their providers
    """
    moa_service = get_moa_service()
    
    models = [
        {
            "name": m.name,
            "provider": m.provider,
            "model": m.model,
        }
        for m in moa_service.models
    ]
    
    return {
        "models": models,
        "default_merge_model": moa_service.merge_model.name,
        "enabled": os.getenv("MOA_ENABLED", "false").lower() == "true",
    }


@router.post("/reset")
async def reset_moa_service():
    """
    Reset the MoA service.
    
    Useful for testing or when model configurations change.
    """
    from deeptutor.services.moa import reset_moa_service as reset
    
    reset()
    
    return {"status": "success", "message": "MoA service reset successfully"}
