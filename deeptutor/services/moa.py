# =============================================================================
# DeepTutor-Plus MoA (Mixture of Agents) Service
# =============================================================================
# Multi-model parallel chat support from Open-TutorAi
# License: Apache 2.0

"""
MoA (Mixture of Agents) Service

This module provides multi-model parallel chat capabilities:
- Simultaneously call multiple LLM models
- Collect responses in parallel
- Merge/synthesize results using a meta-model or voting strategy
"""

import os
from typing import Any, AsyncGenerator, Optional
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel, Field

from deeptutor.services.llm import complete, stream


class MoAStrategy(str, Enum):
    """MoA response merge strategies"""
    PARALLEL = "parallel"       # Return all responses separately
    MERGE = "merge"            # Use meta-model to synthesize
    VOTE = "vote"              # Voting/consensus approach


@dataclass
class ModelConfig:
    """Configuration for a model in MoA"""
    name: str
    provider: str = "openai"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str = "gpt-4o-mini"
    max_tokens: int = 4096
    temperature: float = 0.7


@dataclass
class MoAResponse:
    """Response from a single model"""
    model_name: str
    content: str
    finish_reason: str = "stop"
    latency_ms: float = 0.0
    tokens_used: int = 0
    error: Optional[str] = None


@dataclass
class MoAResult:
    """Combined result from MoA processing"""
    responses: list[MoAResponse]
    merged_response: Optional[str] = None
    strategy: MoAStrategy = MoAStrategy.PARALLEL
    total_latency_ms: float = 0.0


class MoAService:
    """
    Mixture of Agents Service
    
    Manages parallel calls to multiple LLM models and provides
    various strategies for merging their responses.
    """
    
    def __init__(
        self,
        models: Optional[list[ModelConfig]] = None,
        strategy: MoAStrategy = MoAStrategy.PARALLEL,
        merge_model: Optional[ModelConfig] = None,
    ):
        """
        Initialize MoA service.
        
        Args:
            models: List of model configurations to query
            strategy: Strategy for merging responses
            merge_model: Model to use for merging (if strategy is MERGE)
        """
        self.models = models or self._default_models()
        self.strategy = strategy
        self.merge_model = merge_model or self._default_merge_model()
    
    def _default_models(self) -> list[ModelConfig]:
        """Get default models from environment or use sensible defaults"""
        default_names = os.getenv("MOA_MODELS", "gpt-4o,claude-3-opus").split(",")
        
        models = []
        for name in default_names:
            name = name.strip()
            if "gpt" in name.lower():
                models.append(ModelConfig(
                    name=name,
                    provider="openai",
                    model=name,
                ))
            elif "claude" in name.lower():
                models.append(ModelConfig(
                    name=name,
                    provider="anthropic",
                    model=name,
                ))
            elif "gemini" in name.lower():
                models.append(ModelConfig(
                    name=name,
                    provider="gemini",
                    model=name,
                ))
        
        return models if models else [ModelConfig(name="gpt-4o-mini")]
    
    def _default_merge_model(self) -> ModelConfig:
        """Get default merge model"""
        return ModelConfig(
            name="merge-model",
            provider="openai",
            model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        )
    
    async def query_single_model(
        self,
        model: ModelConfig,
        messages: list[dict],
        system_prompt: Optional[str] = None,
    ) -> MoAResponse:
        """
        Query a single model with the given messages.
        
        Args:
            model: Model configuration
            messages: Chat messages
            system_prompt: Optional system prompt override
            
        Returns:
            MoAResponse from the model
        """
        import time
        start_time = time.time()
        
        try:
            # Build final messages with system prompt
            final_messages = messages.copy()
            if system_prompt:
                final_messages.insert(0, {"role": "system", "content": system_prompt})
            
            content = await complete(
                "",
                messages=final_messages,
                model=model.model,
                binding=model.provider,
                api_key=model.api_key,
                base_url=model.base_url,
                max_tokens=model.max_tokens,
                temperature=model.temperature,
            )
            
            latency_ms = (time.time() - start_time) * 1000
            
            return MoAResponse(
                model_name=model.name,
                content=content,
                latency_ms=latency_ms,
            )
            
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            return MoAResponse(
                model_name=model.name,
                content="",
                error=str(e),
                latency_ms=latency_ms,
            )
    
    async def query_all_models(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
    ) -> list[MoAResponse]:
        """
        Query all configured models in parallel.
        
        Args:
            messages: Chat messages
            system_prompt: Optional system prompt
            
        Returns:
            List of responses from all models
        """
        tasks = [
            self.query_single_model(model, messages, system_prompt)
            for model in self.models
        ]
        
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to error responses
        return [
            r if isinstance(r, MoAResponse) else MoAResponse(
                model_name="unknown",
                content="",
                error=str(r),
            )
            for r in responses
        ]
    
    async def merge_responses(
        self,
        responses: list[MoAResponse],
        original_messages: list[dict],
    ) -> str:
        """
        Merge multiple responses into a single response.
        
        Uses a meta-model approach to synthesize responses.
        
        Args:
            responses: List of responses to merge
            original_messages: Original conversation messages
            
        Returns:
            Merged response string
        """
        # Build merge prompt
        responses_text = "\n\n".join([
            f"### Model: {r.model_name}\n{r.content}"
            for r in responses if r.content and not r.error
        ])
        
        merge_prompt = f"""You are a meta-model tasked with synthesizing responses from multiple AI models.

Below are responses from different models to the same query:

{responses_text}

Your task is to create a unified, comprehensive response that:
1. Combines the best insights from each model
2. Resolves any contradictions
3. Provides a clear, well-structured answer
4. Notes any significant disagreements between models

Provide your synthesized response:"""

        merge_messages = original_messages + [
            {"role": "user", "content": merge_prompt}
        ]
        
        result = await self.query_single_model(
            self.merge_model,
            merge_messages,
        )
        
        return result.content or "Failed to merge responses."
    
    async def chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        strategy: Optional[MoAStrategy] = None,
    ) -> MoAResult:
        """
        Main entry point for MoA chat.
        
        Args:
            messages: Chat messages
            system_prompt: Optional system prompt
            strategy: Override default strategy
            
        Returns:
            MoAResult containing all responses and optional merged result
        """
        import time
        start_time = time.time()
        
        strategy = strategy or self.strategy
        
        # Query all models in parallel
        responses = await self.query_all_models(messages, system_prompt)
        
        total_latency_ms = (time.time() - start_time) * 1000
        
        # Merge if requested
        merged_response = None
        if strategy == MoAStrategy.MERGE:
            successful_responses = [r for r in responses if r.content and not r.error]
            if len(successful_responses) >= 2:
                merged_response = await self.merge_responses(responses, messages)
            elif len(successful_responses) == 1:
                merged_response = successful_responses[0].content
        
        return MoAResult(
            responses=responses,
            merged_response=merged_response,
            strategy=strategy,
            total_latency_ms=total_latency_ms,
        )
    
    async def stream_chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[tuple[str, str], None]:
        """
        Stream responses from all models.
        
        Yields tuples of (model_name, content_chunk).
        
        Args:
            messages: Chat messages
            system_prompt: Optional system prompt
        """
        # For streaming, we use a simplified approach
        # In production, this would handle concurrent streaming
        for model in self.models:
            async for chunk in self._stream_model(model, messages, system_prompt):
                yield chunk
    
    async def _stream_model(
        self,
        model: ModelConfig,
        messages: list[dict],
        system_prompt: Optional[str],
    ) -> AsyncGenerator[tuple[str, str], None]:
        """Stream from a single model"""
        try:
            final_messages = messages.copy()
            if system_prompt:
                final_messages.insert(0, {"role": "system", "content": system_prompt})
            
            async for chunk in stream(
                "",
                messages=final_messages,
                model=model.model,
                binding=model.provider,
                api_key=model.api_key,
                base_url=model.base_url,
            ):
                yield (model.name, chunk)
        except Exception as e:
            yield (model.name, f"[Error: {str(e)}]")


# ============================================================================
# API Models
# ============================================================================

class MoARequest(BaseModel):
    """Request model for MoA chat"""
    messages: list[dict] = Field(..., description="Chat messages")
    system_prompt: Optional[str] = Field(None, description="Optional system prompt")
    strategy: MoAStrategy = Field(MoAStrategy.PARALLEL, description="Merge strategy")
    model_override: Optional[list[str]] = Field(None, description="Override default models")


class MoASingleResponse(BaseModel):
    """Response from a single model"""
    model: str
    content: str
    finish_reason: str = "stop"
    latency_ms: float = 0.0
    tokens_used: int = 0
    error: Optional[str] = None


class MoAChatResponse(BaseModel):
    """Full MoA response"""
    responses: list[MoASingleResponse]
    merged: Optional[str] = None
    strategy: str
    total_latency_ms: float


# ============================================================================
# Service singleton
# ============================================================================

_moa_service: Optional[MoAService] = None


def get_moa_service() -> MoAService:
    """Get or create MoA service singleton"""
    global _moa_service
    if _moa_service is None:
        _moa_service = MoAService()
    return _moa_service


def reset_moa_service():
    """Reset MoA service (useful for testing)"""
    global _moa_service
    _moa_service = None
