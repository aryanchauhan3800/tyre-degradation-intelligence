from pathlib import Path
import pytest

from backend.replay.engine import ReplayEngine
from backend.telemetry.adapter import MalformedTelemetryError
from tests.test_schemas import create_valid_frame


def test_replay_load_file():
    engine = ReplayEngine()
    count = engine.load_file("data/replay/demo_session.json")
    assert count == 80
    assert engine.total_frames == 80
    assert engine.session_id == "SESSION_DEMO_001"
    assert engine.has_next() is True


def test_replay_sequential_stepping():
    engine = ReplayEngine()
    engine.load_file("data/replay/demo_session.json")

    # Step through first 5 frames
    frames = []
    for _ in range(5):
        f = engine.step()
        assert f is not None
        frames.append(f)

    assert len(frames) == 5
    assert engine.current_index == 5
    # Verify monotonic time advance
    for i in range(1, 5):
        assert frames[i].timestamp > frames[i - 1].timestamp

    # Test rewind
    engine.rewind(0)
    assert engine.current_index == 0
    first_again = engine.step()
    assert first_again.timestamp == frames[0].timestamp


def test_replay_streaming_with_callback():
    engine = ReplayEngine()
    engine.load_file("data/replay/demo_session.json")

    collected = []
    engine.play(callback=lambda f: collected.append(f), playback_speed=0.0)
    assert len(collected) == 80
    assert engine.has_next() is False


def test_replay_rejects_missing_file():
    engine = ReplayEngine()
    with pytest.raises(FileNotFoundError):
        engine.load_file("data/replay/non_existent.json")


def test_replay_strict_malformed_handling():
    engine = ReplayEngine(strict=True)
    valid_item = create_valid_frame().model_dump()
    malformed_item = {"timestamp": 2.0, "bad_data": True}

    with pytest.raises(MalformedTelemetryError):
        engine.load_data([valid_item, malformed_item])


def test_replay_non_strict_malformed_handling():
    engine = ReplayEngine(strict=False)
    valid_item = create_valid_frame().model_dump()
    malformed_item = {"timestamp": 2.0, "bad_data": True}

    count = engine.load_data([valid_item, malformed_item, valid_item])
    assert count == 2
    assert engine.dropped_frames_count == 1
