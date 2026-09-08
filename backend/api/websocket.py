"""
TYRETRACE — Real-Time WebSocket Telemetry Streaming Manager
Manages active WebSocket client connections and broadcasts synchronized frame payloads.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Set
from fastapi import WebSocket, WebSocketDisconnect

from backend.api.pipeline import PipelineResult

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Thread-safe connection manager broadcasting frames to all connected dashboard and Blender clients.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._sequence: int = 0

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Active clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Active clients: {len(self.active_connections)}")

    async def broadcast_pipeline_result(self, result: PipelineResult) -> None:
        """
        Formats and broadcasts a unified frame update to all active WebSocket clients.
        """
        self._sequence += 1
        tel = result.telemetry
        iso_ts = tel.timestamp_iso or f"T+{tel.timestamp:.3f}s"

        message = {
            "type": "telemetry_update",
            "sequence": self._sequence,
            "timestamp": iso_ts,
            "telemetry": tel.model_dump(),
            "physics": result.physics,
            "residual": result.residual.model_dump(),
            "confounders": result.confounders.model_dump(),
            "tdi": {
                "physics_tdi": result.physics_tdi,
                "ai_tdi": result.ai_tdi,
                "final_tdi": result.final_tdi,
                "state": result.tdi_frame.state.value,
                "trend": result.tdi_frame.trend.value,
                "confidence": result.tdi_frame.confidence,
                "model_reliability": result.model_reliability,
                "evidence": result.tdi_frame.evidence,
                "counter_evidence": result.tdi_frame.counter_evidence,
            },
            "ai": {
                "ai_tdi": result.ai_tdi,
                "model_reliability": result.model_reliability,
                "target_type": "TDI_BASELINE_PSEUDO_LABEL",
                "model_version": "RF_BASELINE_v1.0",
            },
            "blender": result.blender_payload.model_dump(),
        }

        serialized = json.dumps(message)
        dead_connections: List[WebSocket] = []

        async with self._lock:
            for connection in list(self.active_connections):
                try:
                    await connection.send_text(serialized)
                except Exception as e:
                    logger.debug(f"Error sending to WebSocket client: {e}")
                    dead_connections.append(connection)

            for dead in dead_connections:
                self.active_connections.discard(dead)

    def reset(self) -> None:
        """Resets message sequence counter."""
        self._sequence = 0


# Global singleton manager
ws_manager = ConnectionManager()
