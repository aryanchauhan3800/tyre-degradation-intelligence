import json
import pytest

from backend.schemas.telemetry import WheelCorner
from backend.telemetry.adapter import (
    CanonicalTelemetryAdapter,
    FlatTelemetryAdapter,
    MalformedTelemetryError,
)
from tests.test_schemas import create_valid_frame


def test_canonical_adapter_parses_dict():
    adapter = CanonicalTelemetryAdapter()
    frame = create_valid_frame()
    frame_dict = frame.model_dump()

    parsed = adapter.parse(frame_dict)
    assert parsed.session_id == frame.session_id
    assert parsed.vehicle.speed_mps == frame.vehicle.speed_mps
    assert parsed.tyres.fl.corner == WheelCorner.FL


def test_canonical_adapter_parses_json_string():
    adapter = CanonicalTelemetryAdapter()
    frame = create_valid_frame()
    json_str = json.dumps(frame.model_dump())

    parsed = adapter.parse(json_str)
    assert parsed.session_id == frame.session_id
    assert parsed.tyres.rr.pressure_bar == 2.0


def test_canonical_adapter_rejects_malformed_json():
    adapter = CanonicalTelemetryAdapter()
    with pytest.raises(MalformedTelemetryError) as exc_info:
        adapter.parse("{broken_json: true,")
    assert "Invalid JSON string format" in str(exc_info.value)


def test_canonical_adapter_rejects_missing_fields():
    adapter = CanonicalTelemetryAdapter()
    # Missing 'tyres' and 'vehicle'
    with pytest.raises(MalformedTelemetryError) as exc_info:
        adapter.parse({"timestamp": 1.0, "session_id": "TEST", "lap": 1})
    assert "Validation failed" in str(exc_info.value)


def test_adapter_validate_raw_helper():
    adapter = CanonicalTelemetryAdapter()
    valid_data = create_valid_frame().model_dump()
    is_valid, err = adapter.validate_raw(valid_data)
    assert is_valid is True
    assert err is None

    is_valid, err = adapter.validate_raw({"bad": "payload"})
    assert is_valid is False
    assert err is not None


def test_flat_adapter_parses_flat_dict():
    adapter = FlatTelemetryAdapter()
    flat_data = {
        "timestamp": 12.5,
        "session_id": "FLAT_RUN",
        "lap": 3,
        "speed_kph": 120.0,
        "steer": -5.0,
        "throttle": 80.0,
        "brake": 0.0,
        "fl_pressure": 2.1,
        "fr_pressure": 2.1,
        "rl_pressure": 2.0,
        "rr_pressure": 2.0,
        "fl_surface_temp": 85.0,
        "fr_surface_temp": 88.0,
        "rl_surface_temp": 80.0,
        "rr_surface_temp": 80.0,
    }

    frame = adapter.parse(flat_data)
    assert frame.session_id == "FLAT_RUN"
    assert frame.lap == 3
    assert frame.vehicle.speed_kph == 120.0
    assert frame.tyres.fl.pressure_bar == 2.1
    assert frame.tyres.fr.surface_temp_c == 88.0
