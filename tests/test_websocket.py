"""
TYRETRACE — Real-Time WebSocket Streaming Tests
Tests WebSocket connection lifecycle, frame update schemas, client ping-pong, and disconnection.
"""

import json
import pytest
from fastapi.testclient import TestClient
from backend.api.app import create_app


def test_websocket_streaming_and_schema():
    app = create_app()
    with TestClient(app) as client:
        with client.websocket_connect("/ws/telemetry") as websocket:
            # Send a ping to verify bidirectional socket
            websocket.send_text("ping")
            response = websocket.receive_text()
            assert response == "pong"

            # Trigger a frame process in controller
            controller = app.state.controller
            # Seek a frame to trigger broadcast
            client.post("/api/replay/seek", json={"frame_index": 2})

            # Receive broadcasted frame update
            msg_text = websocket.receive_text()
            msg = json.loads(msg_text)

            assert msg["type"] == "telemetry_update"
            assert "sequence" in msg
            assert "telemetry" in msg
            assert "physics" in msg
            assert "residual" in msg
            assert "confounders" in msg
            assert "tdi" in msg
            assert "ai" in msg
            assert "blender" in msg

            # Check TDI structure in WebSocket payload
            tdi_data = msg["tdi"]
            assert "physics_tdi" in tdi_data
            assert "ai_tdi" in tdi_data
            assert "final_tdi" in tdi_data
            assert "state" in tdi_data
            assert "confidence" in tdi_data


def test_websocket_disconnect_handling():
    app = create_app()
    ws_manager = app.state.ws_manager
    initial_count = len(ws_manager.active_connections)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/telemetry") as websocket:
            assert len(ws_manager.active_connections) == initial_count + 1
        # Upon exiting context manager, client is disconnected
    assert len(ws_manager.active_connections) == initial_count
