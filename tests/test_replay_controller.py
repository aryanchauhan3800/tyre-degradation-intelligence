"""
TYRETRACE — Replay Controller Unit Tests
Tests asynchronous replay lifecycle: load, start, pause, resume, stop, reset, seek,
playback speed modulation, and error handling for missing/malformed files.
"""

import asyncio
import json
import pytest
from pathlib import Path

from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.api.replay_controller import ReplayController
from backend.api.state import RuntimeState
from backend.api.websocket import ConnectionManager


@pytest.fixture
def replay_setup():
    pipeline = UnifiedIntelligencePipeline()
    state = RuntimeState()
    ws_manager = ConnectionManager()
    controller = ReplayController(
        pipeline=pipeline,
        state=state,
        ws_manager=ws_manager,
        default_file="data/replay/f1_2023_monza_q_ver.json",
    )
    return controller, state


@pytest.mark.anyio
async def test_replay_lifecycle(replay_setup):
    controller, state = replay_setup
    assert len(controller.frames) > 0

    # Start
    status = await controller.start()
    assert status["running"] is True
    assert status["paused"] is False

    # Pause
    status_pause = await controller.pause()
    assert status_pause["paused"] is True

    # Resume
    status_resume = await controller.resume()
    assert status_resume["paused"] is False

    # Stop
    status_stop = await controller.stop()
    assert status_stop["running"] is False

    # Reset
    status_reset = await controller.reset()
    assert status_reset["current_frame"] == 0


@pytest.mark.anyio
async def test_replay_seek(replay_setup):
    controller, state = replay_setup
    total = len(controller.frames)

    # Valid seek
    await controller.seek(10)
    assert controller.current_idx == 11  # Seek processes frame and advances to 11

    # Out-of-bounds seek negative
    with pytest.raises(ValueError, match="out of bounds"):
        await controller.seek(-5)

    # Out-of-bounds seek beyond total
    with pytest.raises(ValueError, match="out of bounds"):
        await controller.seek(total + 50)


def test_playback_speed(replay_setup):
    controller, state = replay_setup

    controller.set_playback_speed(2.0)
    assert controller.playback_speed == 2.0

    controller.set_playback_speed(0.5)
    assert controller.playback_speed == 0.5

    with pytest.raises(ValueError, match="Invalid playback speed"):
        controller.set_playback_speed(-1.0)

    with pytest.raises(ValueError, match="Invalid playback speed"):
        controller.set_playback_speed(15.0)


def test_missing_file_handling():
    pipeline = UnifiedIntelligencePipeline()
    state = RuntimeState()
    ws_manager = ConnectionManager()
    controller = ReplayController(
        pipeline=pipeline,
        state=state,
        ws_manager=ws_manager,
        default_file="nonexistent_dir/missing_replay.json",
    )
    # Controller initializes with 0 frames without crashing
    assert len(controller.frames) == 0

    with pytest.raises(FileNotFoundError):
        controller.load_dataset("nonexistent_file.json")


def test_malformed_replay_handling(tmp_path):
    pipeline = UnifiedIntelligencePipeline()
    state = RuntimeState()
    ws_manager = ConnectionManager()
    controller = ReplayController(
        pipeline=pipeline,
        state=state,
        ws_manager=ws_manager,
        default_file="nonexistent_dir/dummy.json",
    )

    bad_json = tmp_path / "bad_replay.json"
    # One valid frame, one malformed frame
    bad_json.write_text(json.dumps([
        {"timestamp": 1.0, "malformed": True},
    ]))

    with pytest.raises(ValueError, match="No valid TelemetryFrames"):
        controller.load_dataset(str(bad_json))
