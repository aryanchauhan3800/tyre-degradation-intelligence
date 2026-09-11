"""
TYRETRACE — Real-Time Intelligence FastAPI Application
Provides the unified REST API, WebSocket streaming gateway, and Replay Controller for TYRETRACE.
"""

from contextlib import asynccontextmanager
import json
import logging
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.api.replay_controller import ReplayController
from backend.api.routes import create_router
from backend.api.state import runtime_state
from backend.api.websocket import ws_manager

logger = logging.getLogger("tyretrace_api")


def create_app(
    replay_file: str = "data/replay/f1_2023_monza_q_ver.json",
    model_path: str = "data/ml/baseline_model.joblib",
    fusion_alpha: float = 0.60,
    data_mode: str = "REPLAY",
) -> FastAPI:
    """
    Application factory initializing the pipeline, replay controller, and FastAPI endpoints.
    """
    pipeline = UnifiedIntelligencePipeline(
        model_path=model_path,
        fusion_alpha=fusion_alpha,
        data_mode=data_mode,
    )

    controller = ReplayController(
        pipeline=pipeline,
        state=runtime_state,
        ws_manager=ws_manager,
        default_file=replay_file,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Initializing TYRETRACE Real-Time Intelligence API...")
        # Step initial frame so the API is immediately queryable on startup
        if controller.frames:
            await controller.step_frame()
        yield
        logger.info("Shutting down TYRETRACE API...")
        await controller.stop()

    app = FastAPI(
        title="TYRETRACE — Real-Time Tyre Degradation Intelligence API",
        version="1.0.0",
        description=(
            "Physics-informed digital twin, Actual-vs-Expected residual engine, "
            "deterministic confounder analysis, and Temporal AI degradation inference."
        ),
        lifespan=lifespan,
    )

    # Enable CORS for local dashboards and Blender WebSockets
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register REST routes
    api_router = create_router(state=runtime_state, controller=controller)
    app.include_router(api_router)

    # Register WebSocket streaming gateway
    @app.websocket("/ws/telemetry")
    async def websocket_telemetry_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                # Keep connection alive and accept client control messages if sent
                data = await websocket.receive_text()
                # Optional client ping/pong or echo
                if data == "ping":
                    await websocket.send_text("pong")
                elif data.startswith("{"):
                    try:
                        msg = json.loads(data)
                        msg_type = msg.get("type")
                        if msg_type in ("tyre_select", "component_select"):
                            tyre = msg.get("tyre") or msg.get("component")
                            if tyre:
                                t_clean = tyre.upper()
                                comp = f"Wheel_{t_clean}" if t_clean in ("FL", "FR", "RL", "RR") else tyre
                            else:
                                comp = None
                            pipeline.set_selected_component(comp)
                        elif msg_type == "set_mode":
                            target_mode = "DEMO_SIMULATION" if str(msg.get("mode", "")).upper() == "DEMO_SIMULATION" else "REPLAY"
                            pipeline.set_data_mode(target_mode)
                            runtime_state.session_info["data_mode"] = target_mode
                    except Exception as err:
                        logger.debug(f"Failed to process client control message: {err}")
        except WebSocketDisconnect:
            await ws_manager.disconnect(websocket)
        except Exception as e:
            logger.debug(f"WebSocket connection exception: {e}")
            await ws_manager.disconnect(websocket)

    # Expose pipeline and controller on app state for programmatic test access
    app.state.pipeline = pipeline
    app.state.controller = controller
    app.state.runtime_state = runtime_state
    app.state.ws_manager = ws_manager

    return app


# Default application instance for uvicorn
app = create_app()
