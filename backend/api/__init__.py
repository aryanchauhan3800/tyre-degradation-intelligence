"""
TYRETRACE — Real-Time API Module
FastAPI, WebSocket Streaming, and Replay Controller.
"""

from backend.api.app import app, create_app
from backend.api.pipeline import PipelineResult, UnifiedIntelligencePipeline
from backend.api.replay_controller import ReplayController
from backend.api.routes import create_router
from backend.api.schemas import (
    ConfoundersStateResponse,
    CornerSlot,
    FourWheelTyresResponse,
    HealthResponse,
    LapSummaryResponse,
    PhysicsForces,
    PhysicsStateResponse,
    ReplaySeekRequest,
    ReplaySpeedRequest,
    ReplayStatusResponse,
    ResidualHistoryPoint,
    ResidualStateResponse,
    SessionResponse,
    TDIHistoryPoint,
    TDIStateResponse,
)
from backend.api.state import RuntimeState, runtime_state
from backend.api.websocket import ConnectionManager, ws_manager

__all__ = [
    "app",
    "create_app",
    "UnifiedIntelligencePipeline",
    "PipelineResult",
    "ReplayController",
    "create_router",
    "runtime_state",
    "RuntimeState",
    "ws_manager",
    "ConnectionManager",
    "HealthResponse",
    "SessionResponse",
    "PhysicsForces",
    "PhysicsStateResponse",
    "ResidualStateResponse",
    "ConfoundersStateResponse",
    "TDIStateResponse",
    "CornerSlot",
    "FourWheelTyresResponse",
    "ReplayStatusResponse",
    "ReplaySeekRequest",
    "ReplaySpeedRequest",
    "TDIHistoryPoint",
    "ResidualHistoryPoint",
    "LapSummaryResponse",
]
