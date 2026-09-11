"""
TYRETRACE — Blender Digital Twin Integration Tests (Phase 11)
Validates WebSocket payload parsing, strict REAL_REPLAY vs DEMO_SIMULATION mode separation,
four-wheel unavailability integrity, tyre corner mapping, selected component tracking,
and fault-tolerant connection lifecycle.
"""

import json
import subprocess
from pathlib import Path
from typing import Any, Dict
import pytest

from blender.tyretrace_live_bridge import (
    PayloadParser,
    TyreTraceFrame,
    TyreTraceNetworkClient,
    TyreTraceSceneManager,
)


# ==============================================================================
# 1. PAYLOAD PARSING & SCHEMA VALIDATION
# ==============================================================================

def test_websocket_payload_parsing_standard():
    raw_payload = {
        "type": "telemetry_update",
        "sequence": 105,
        "timestamp": 45.32,
        "data_mode": "REPLAY",
        "telemetry": {
            "vehicle": {
                "speed_mps": 75.5,
                "speed_kph": 271.8,
                "throttle_pct": 98.5,
                "brake_pct": 0.0,
                "gear": 7,
                "drs": 1,
            },
            "tyre": {
                "compound": "HARD",
                "tyre_life_laps": 14,
            },
            "timestamp_iso": "2023-09-03T13:12:00.000Z",
            "lap": 12,
        },
        "tdi": {
            "physics_tdi": 18.2,
            "ai_tdi": 19.5,
            "final_tdi": 18.7,
            "state": "STABLE",
            "confidence": 0.85,
            "trend": "STABLE",
        },
        "residual": {
            "r_ax": -0.85,
        },
        "confounders": {
            "scores": {
                "tyre_evidence_quality": 0.82,
                "non_tyre_explanation_score": 0.15,
            }
        },
        "blender": {
            "sequence": 105,
            "timestamp_iso": "2023-09-03T13:12:00.000Z",
            "lap": 12,
            "data_mode": "REPLAY",
            "vehicle": {
                "speed_kph": 271.8,
                "speed_mps": 75.5,
                "throttle_pct": 98.5,
                "brake_pct": 0.0,
                "gear": 7,
                "drs_active": True,
            },
            "tyres": {
                "FL": {"available": False, "tdi": None},
                "FR": {"available": False, "tdi": None},
                "RL": {"available": False, "tdi": None},
                "RR": {"available": False, "tdi": None},
            },
            "global_tdi": 18.7,
            "degradation_state": "STABLE",
            "selected_component": "Wheel_FR",
        },
    }

    frame = PayloadParser.parse(raw_payload)
    assert frame is not None
    assert frame.sequence == 105
    assert frame.speed_kph == 271.8
    assert frame.speed_mps == 75.5
    assert frame.throttle_pct == 98.5
    assert frame.gear == 7
    assert frame.drs_active is True
    assert frame.global_tdi == 18.7
    assert frame.confidence == 0.85
    assert frame.trend == "STABLE"
    assert frame.residual_rax == -0.85
    assert frame.evidence_quality == 0.82
    assert frame.confounder_score == 0.15
    assert frame.selected_component == "Wheel_FR"
    assert frame.data_mode == "REPLAY"


# ==============================================================================
# 2. REAL_REPLAY MODE ENFORCEMENT
# ==============================================================================

def test_real_replay_mode_preserves_unavailable_tyres():
    """In REAL_REPLAY mode, FastF1 corner wear must remain strictly unavailable."""
    replay_payload = {
        "data_mode": "REPLAY",
        "blender": {
            "data_mode": "REPLAY",
            "vehicle": {"speed_kph": 290.0},
            "tyres": {
                "FL": {"available": False, "tdi": None},
                "FR": {"available": False, "tdi": None},
                "RL": {"available": False, "tdi": None},
                "RR": {"available": False, "tdi": None},
            },
            "global_tdi": 12.0,
        },
    }

    frame = PayloadParser.parse(replay_payload)
    assert frame is not None
    assert frame.data_mode == "REPLAY"
    for corner in ("FL", "FR", "RL", "RR"):
        assert frame.corner_available[corner] is False
        assert frame.corner_tdi[corner] is None


def test_real_replay_rejects_injected_corner_wear():
    """Even if an adversary attempts to inject corner TDI into REPLAY, the parser forces it to None."""
    forged_replay_payload = {
        "data_mode": "REPLAY",
        "blender": {
            "data_mode": "REPLAY",
            "vehicle": {"speed_kph": 300.0},
            "tyres": {
                "FL": {"available": True, "tdi": 99.9},  # Fake wear injected
            },
        },
    }

    frame = PayloadParser.parse(forged_replay_payload)
    assert frame is not None
    assert frame.corner_available["FL"] is False
    assert frame.corner_tdi["FL"] is None


# ==============================================================================
# 3. DEMO_SIMULATION MODE VALIDATION
# ==============================================================================

def test_demo_simulation_mode_allows_simulated_tdi():
    """In DEMO_SIMULATION mode, simulated 4-wheel values are parsed and exposed."""
    demo_payload = {
        "data_mode": "DEMO_SIMULATION",
        "blender": {
            "data_mode": "DEMO_SIMULATION",
            "vehicle": {"speed_kph": 260.0},
            "tyres": {
                "FL": {"available": True, "tdi": 32.4},
                "FR": {"available": True, "tdi": 28.1},
                "RL": {"available": True, "tdi": 21.0},
                "RR": {"available": True, "tdi": 19.5},
            },
            "global_tdi": 25.5,
        },
    }

    frame = PayloadParser.parse(demo_payload)
    assert frame is not None
    assert frame.data_mode == "DEMO_SIMULATION"
    assert frame.corner_available["FL"] is True
    assert frame.corner_tdi["FL"] == 32.4
    assert frame.corner_tdi["FR"] == 28.1
    assert frame.corner_tdi["RL"] == 21.0
    assert frame.corner_tdi["RR"] == 19.5


# ==============================================================================
# 4. MISSING & AVAILABLE TDI EDGE CASES
# ==============================================================================

def test_missing_tdi_handling():
    """Empty or missing TDI blocks yield None, never synthetic fallback defaults."""
    empty_payload = {
        "telemetry": {"vehicle": {"speed_kph": 150.0}},
    }
    frame = PayloadParser.parse(empty_payload)
    assert frame is not None
    assert frame.global_tdi is None
    assert frame.physics_tdi is None
    assert frame.ai_tdi is None
    assert frame.residual_rax is None


def test_available_tdi_bounds():
    """Ensures TDI values are properly recognized within legitimate 0-100 bounds."""
    bounded_payload = {
        "tdi": {"final_tdi": 74.2, "confidence": 0.92, "trend": "CLIFF"},
        "blender": {"global_tdi": 74.2, "degradation_state": "CLIFF_WARNING"},
    }
    frame = PayloadParser.parse(bounded_payload)
    assert frame is not None
    assert frame.global_tdi == 74.2
    assert frame.degradation_state == "CLIFF_WARNING"
    assert frame.confidence == 0.92


# ==============================================================================
# 5. WHEEL MAPPING & COMPONENT SELECTION
# ==============================================================================

def test_wheel_object_mapping():
    """Verifies that corner labels map strictly to canonical Blender mesh names."""
    mgr = TyreTraceSceneManager()
    assert mgr.WHEEL_OBJECTS["FL"] == "Wheel_FL"
    assert mgr.WHEEL_OBJECTS["FR"] == "Wheel_FR"
    assert mgr.WHEEL_OBJECTS["RL"] == "Wheel_RL"
    assert mgr.WHEEL_OBJECTS["RR"] == "Wheel_RR"


def test_selected_component_normalization():
    """Validates component name normalizer across aliases and case variations."""
    mgr = TyreTraceSceneManager()
    assert mgr._normalize_component_name("Wheel_FL") == "FL"
    assert mgr._normalize_component_name("Wheel_FR") == "FR"
    assert mgr._normalize_component_name("fl") == "FL"
    assert mgr._normalize_component_name("BrakeCaliper_RL") == "RL"
    assert mgr._normalize_component_name("UnknownObject") is None
    assert mgr._normalize_component_name(None) is None


# ==============================================================================
# 6. MALFORMED PAYLOAD RESILIENCE
# ==============================================================================

def test_malformed_json_resilience():
    assert PayloadParser.parse("INVALID_NOT_JSON{") is None
    assert PayloadParser.parse(12345) is None
    assert PayloadParser.parse(None) is None

    # Partially malformed dictionaries do not crash
    incomplete_dict = {"blender": "string_instead_of_dict"}
    frame = PayloadParser.parse(incomplete_dict)
    assert frame is not None
    assert frame.speed_kph == 0.0


# ==============================================================================
# 7. NETWORK CLIENT LIFECYCLE & RECONNECT HANDLING
# ==============================================================================

def test_network_client_lifecycle():
    client = TyreTraceNetworkClient(url="ws://127.0.0.1:9999/ws/telemetry", max_queue=3)
    assert client.is_connected is False
    
    # Start worker thread
    client.start()
    assert client._thread is not None
    assert client._thread.is_alive()

    # Worker gracefully attempts connection without crashing
    client.stop()
    assert client.is_connected is False
    assert client._stop_event.is_set()


# ==============================================================================
# 8. HEADLESS BLENDER EXECUTION INTEGRATION TEST (OPTIONAL BUT EXECUTED IF BLENDER PRESENT)
# ==============================================================================

def test_headless_blender_scene_execution():
    """Runs Blender in background mode to test real-scene object interaction."""
    blender_bin = Path("/Applications/Blender.app/Contents/MacOS/Blender")
    blend_file = Path("blender/Formula_2_Car_DigitalTwin_V7_Mechanical_Thermal.blend")

    if not blender_bin.exists() or not blend_file.exists():
        pytest.skip("Blender binary or blend file not found for headless test")

    test_script = """
import sys
sys.path.insert(0, '.')
from blender.tyretrace_live_bridge import PayloadParser, TyreTraceSceneManager
import bpy

mgr = TyreTraceSceneManager()
payload = {
    'blender': {
        'vehicle': {'speed_kph': 280.0, 'speed_mps': 77.78},
        'selected_component': 'Wheel_FL'
    }
}
frame = PayloadParser.parse(payload)
mgr.apply_frame(frame)
assert bpy.data.objects['Wheel_FL'].rotation_euler.z != 0.0
assert bpy.context.scene.camera.name == 'CAM_Wheel_FL_Close'
mgr.reset_all()
print('BLENDER_HEADLESS_TEST_SUCCESS')
"""

    res = subprocess.run(
        [str(blender_bin), "-b", str(blend_file), "--python-expr", test_script],
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        timeout=60,
    )
    assert res.returncode == 0
    assert "BLENDER_HEADLESS_TEST_SUCCESS" in res.stdout
