"""
Tests for TelemetryTrackMapper (Phase 3 Track Coordinate Mapping).
"""

import math
import pytest
from backend.telemetry.track_mapper import TelemetryTrackMapper, MONZA_TRACK_LENGTH_M


@pytest.fixture
def mapper():
    return TelemetryTrackMapper()


def test_mapper_initialization(mapper):
    assert mapper.track_length > 5700.0
    assert len(mapper.samples) > 500


def test_start_finish_coordinates(mapper):
    pos, heading = mapper.world_transform_at_distance(0.0)
    assert abs(pos[0]) < 1e-3
    assert abs(pos[1]) < 1e-3
    assert abs(pos[2]) < 1e-3
    assert isinstance(heading, float)


def test_distance_wrapping(mapper):
    pos1, h1 = mapper.world_transform_at_distance(100.0)
    pos2, h2 = mapper.world_transform_at_distance(mapper.track_length + 100.0)
    assert pytest.approx(pos1[0], abs=1e-2) == pos2[0]
    assert pytest.approx(pos1[1], abs=1e-2) == pos2[1]
    assert pytest.approx(h1, abs=1e-3) == h2


def test_lap_fraction(mapper):
    assert pytest.approx(mapper.lap_fraction(0.0), abs=1e-4) == 0.0
    assert pytest.approx(mapper.lap_fraction(mapper.track_length * 0.5), abs=1e-4) == 0.5
    assert pytest.approx(mapper.lap_fraction(mapper.track_length * 1.5), abs=1e-4) == 0.5


def test_nearest_track_point(mapper):
    pos, _ = mapper.world_transform_at_distance(500.0)
    nearest = mapper.nearest_track_point(pos[0], pos[1])
    assert pytest.approx(nearest[0], abs=1e-1) == pos[0]
    assert pytest.approx(nearest[1], abs=1e-1) == pos[1]


def test_distance_from_position(mapper):
    dist = mapper.distance_from_position(0.0, 0.0)
    assert dist < 10.0 or dist > (mapper.track_length - 10.0)


def test_map_telemetry_frame(mapper):
    frame = {
        "relative_distance": 0.25,
        "vehicle": {"speed_kph": 320.0, "gear": 7},
    }
    result = mapper.map_telemetry_frame(frame)
    assert "position" in result
    assert len(result["position"]) == 3
    assert "heading" in result
    assert "track_distance_m" in result
    assert pytest.approx(result["lap_fraction"], abs=1e-3) == 0.25


def test_calibration(mapper):
    f1_pts = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    blender_pts = [(100.0, 200.0), (110.0, 200.0), (110.0, 210.0), (100.0, 210.0)]
    success = mapper.calibrate(f1_pts, blender_pts)
    assert success is True
    res = mapper.gps_to_blender(5.0, 5.0)
    assert res is not None
    assert pytest.approx(res[0], abs=1e-2) == 105.0
    assert pytest.approx(res[1], abs=1e-2) == 205.0
