"""
TYRETRACE — Real-Time API Endpoints
Implements REST routes for health, session metadata, physics twin outputs, residuals,
confounders, TDI scores, tyre availability, replay control, and historical trajectory queries.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from backend.api.replay_controller import ReplayController
from backend.api.schemas import (
    ConfoundersStateResponse,
    FourWheelTyresResponse,
    HealthResponse,
    LapSummaryResponse,
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
from backend.api.state import RuntimeState
from backend.schemas.telemetry import TelemetryFrame


def create_router(state: RuntimeState, controller: ReplayController) -> APIRouter:
    """
    Constructs FastAPI APIRouter bound to the provided RuntimeState and ReplayController instances.
    """
    router = APIRouter(prefix="/api", tags=["TYRETRACE Intelligence API"])

    # 1. System Health
    @router.get("/health", response_model=HealthResponse)
    async def get_health():
        return HealthResponse(
            status="ok",
            service="TYRETRACE",
            version="1.0.0",
            pipeline="physics_residual_confounder_tdi_ai",
        )

    # 2. Session Context
    @router.get("/session", response_model=SessionResponse)
    async def get_session():
        info = state.session_info
        return SessionResponse(
            session_id=info["session_id"],
            event=info["event"],
            year=info["year"],
            session=info["session"],
            driver=info["driver"],
            data_mode=info.get("data_mode", "REPLAY"),
            total_laps=info["total_laps"],
            current_lap=info["current_lap"],
            tyre_compound=info.get("tyre_compound"),
            tyre_age=info.get("tyre_age"),
        )

    # 3. Canonical Telemetry
    @router.get("/telemetry", response_model=Optional[TelemetryFrame])
    async def get_telemetry():
        if state.current_telemetry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No telemetry frame available yet. Start the replay engine.",
            )
        return state.current_telemetry

    # 4. Physics Twin State
    @router.get("/physics", response_model=PhysicsStateResponse)
    async def get_physics():
        if state.current_physics is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No physics twin state evaluated yet. Start the replay engine.",
            )
        return PhysicsStateResponse(**state.current_physics)

    # 5. Residual Engine State
    @router.get("/residual", response_model=ResidualStateResponse)
    async def get_residual():
        if state.current_residual is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No residual state evaluated yet. Start the replay engine.",
            )
        return ResidualStateResponse(**state.current_residual)

    # 6. Confounders Engine State
    @router.get("/confounders", response_model=ConfoundersStateResponse)
    async def get_confounders():
        if state.current_confounders is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No confounder analysis state evaluated yet. Start the replay engine.",
            )
        return ConfoundersStateResponse(**state.current_confounders)

    # 7. TDI Engine & AI Fusion State
    @router.get("/tdi", response_model=TDIStateResponse)
    async def get_tdi():
        if state.current_tdi is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No TDI state evaluated yet. Start the replay engine.",
            )
        return TDIStateResponse(**state.current_tdi)

    # 8. Four-Wheel Tyre Availability
    @router.get("/tyres", response_model=FourWheelTyresResponse)
    async def get_tyres():
        # Strictly preserves unmeasured wheel-level telemetry as unavailable
        return state.current_tyres

    # 9. Replay Controls
    @router.post("/replay/start", response_model=ReplayStatusResponse)
    async def replay_start():
        res = await controller.start()
        return ReplayStatusResponse(**res)

    @router.post("/replay/pause", response_model=ReplayStatusResponse)
    async def replay_pause():
        res = await controller.pause()
        return ReplayStatusResponse(**res)

    @router.post("/replay/resume", response_model=ReplayStatusResponse)
    async def replay_resume():
        res = await controller.resume()
        return ReplayStatusResponse(**res)

    @router.post("/replay/stop", response_model=ReplayStatusResponse)
    async def replay_stop():
        res = await controller.stop()
        return ReplayStatusResponse(**res)

    @router.post("/replay/reset", response_model=ReplayStatusResponse)
    async def replay_reset():
        res = await controller.reset()
        return ReplayStatusResponse(**res)

    @router.post("/replay/seek", response_model=ReplayStatusResponse)
    async def replay_seek(req: ReplaySeekRequest):
        try:
            res = await controller.seek(req.frame_index)
            return ReplayStatusResponse(**res)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    @router.post("/replay/speed", response_model=ReplayStatusResponse)
    async def replay_speed(req: ReplaySpeedRequest):
        try:
            res = controller.set_playback_speed(req.speed)
            return ReplayStatusResponse(**res)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    @router.get("/replay/status", response_model=ReplayStatusResponse)
    async def get_replay_status():
        return ReplayStatusResponse(**controller.get_status())

    # 10. Historical Trajectory Queries
    @router.get("/history/tdi", response_model=List[TDIHistoryPoint])
    async def get_tdi_history(limit: int = Query(300, ge=1, le=1000)):
        points = list(state.tdi_history)
        return points[-limit:]

    @router.get("/history/residual", response_model=List[ResidualHistoryPoint])
    async def get_residual_history(limit: int = Query(300, ge=1, le=1000)):
        points = list(state.residual_history)
        return points[-limit:]

    # 11. Lap Summaries
    @router.get("/laps", response_model=List[int])
    async def get_available_laps():
        return sorted(state.lap_summaries.keys())

    @router.get("/laps/{lap_number}", response_model=LapSummaryResponse)
    async def get_lap_summary(lap_number: int):
        if lap_number not in state.lap_summaries:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Lap {lap_number} not found or not yet processed in current replay.",
            )
        return state.lap_summaries[lap_number]

    return router
