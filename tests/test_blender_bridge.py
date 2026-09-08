"""
TYRETRACE — Blender Bridge Unit Tests
Tests digital twin serialization, four-wheel omission transparency, and sequence management.
"""

import pytest
from backend.blender.bridge import BlenderBridge
from backend.blender.schemas import BlenderFramePayload


def test_blender_payload_schema():
    bridge = BlenderBridge(data_mode="REPLAY")

    telemetry = {
        "timestamp": 1234.56,
        "timestamp_iso": "2023-09-03T13:05:00.000Z",
        "lap": 12,
        "vehicle": {
            "speed_mps": 86.78,
            "speed_kph": 312.4,
            "throttle_pct": 100.0,
            "brake_pct": 0.0,
            "gear": 8,
            "drs": 1,
        },
    }
    tdi_state = {
        "tdi": 45.2,
        "final_tdi": 47.5,
        "state": "MODERATE_DEGRADATION",
    }

    payload = bridge.format_frame(telemetry=telemetry, tdi_state=tdi_state)

    assert isinstance(payload, BlenderFramePayload)
    assert payload.sequence == 1
    assert payload.vehicle.speed_kph == 312.4
    assert payload.vehicle.drs_active is True
    assert payload.global_tdi == 47.5
    assert payload.degradation_state == "MODERATE_DEGRADATION"
    assert payload.data_mode == "REPLAY"


def test_blender_four_wheel_unavailable_contract():
    bridge = BlenderBridge(data_mode="REPLAY")

    payload = bridge.format_frame(
        telemetry={"vehicle": {"speed_mps": 50.0}},
        tdi_state={"final_tdi": 15.0, "state": "HEALTHY_LOW_EVIDENCE"},
    )

    # In real FastF1 replay, four-wheel corner wear must remain unavailable
    for corner in ("FL", "FR", "RL", "RR"):
        slot = getattr(payload.tyres, corner)
        assert slot.available is False
        assert slot.tdi is None
        assert "unavailable in FastF1" in slot.reason


def test_blender_sequence_incrementation():
    bridge = BlenderBridge()
    p1 = bridge.format_frame(telemetry={}, tdi_state={})
    p2 = bridge.format_frame(telemetry={}, tdi_state={})
    assert p2.sequence == p1.sequence + 1

    bridge.reset()
    p3 = bridge.format_frame(telemetry={}, tdi_state={})
    assert p3.sequence == 1
