"""
TYRETRACE — Real-Time Replay Controller
Controls simulation playback of historical canonical FastF1 telemetry datasets.
Supports variable playback speeds (0.25x - 10x), seeking, pausing, and step-by-step pipeline execution.
"""

import asyncio
import json
import logging
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional

from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.api.state import RuntimeState
from backend.api.websocket import ConnectionManager
from backend.schemas.telemetry import TelemetryFrame

logger = logging.getLogger(__name__)

SUPPORTED_SPEEDS = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0]


class ReplayController:
    """
    Asynchronous replay engine coordinating frame playback, pipeline execution, and WebSocket broadcasting.
    """

    def __init__(
        self,
        pipeline: UnifiedIntelligencePipeline,
        state: RuntimeState,
        ws_manager: ConnectionManager,
        default_file: str = "data/replay/f1_2023_monza_q_ver.json",
    ):
        self.pipeline = pipeline
        self.state = state
        self.ws_manager = ws_manager
        self.default_file = default_file

        self.frames: List[TelemetryFrame] = []
        self.current_idx: int = 0
        self.is_running: bool = False
        self.is_paused: bool = False
        self.playback_speed: float = 1.0

        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        # Load default replay data if present
        if Path(default_file).exists():
            self.load_dataset(default_file)

    def load_dataset(self, filepath: str) -> int:
        """
        Loads and parses a canonical TelemetryFrame replay file.
        """
        p = Path(filepath)
        if not p.exists():
            raise FileNotFoundError(f"Replay dataset not found: {filepath}")

        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)

        raw_frames = data.get("frames", data) if isinstance(data, dict) else data
        parsed_frames = []
        for item in raw_frames:
            try:
                parsed_frames.append(TelemetryFrame.model_validate(item))
            except Exception as e:
                logger.warning(f"Skipping malformed frame in replay file: {e}")

        if not parsed_frames:
            raise ValueError(f"No valid TelemetryFrames found in {filepath}")

        self.frames = parsed_frames
        self.current_idx = 0
        self.is_running = False
        self.is_paused = False

        # Update runtime state session metadata
        initial_frame = self.frames[0]
        self.state.session_info.update({
            "session_id": initial_frame.session_id,
            "total_laps": max(f.lap for f in self.frames),
            "current_lap": initial_frame.lap,
            "driver": initial_frame.driver or "VER",
            "tyre_compound": initial_frame.tyres.fl.compound,
            "tyre_age": initial_frame.tyres.fl.tyre_life_laps,
        })
        self._sync_state()

        logger.info(f"Loaded replay dataset: {len(self.frames)} frames from {filepath}")
        return len(self.frames)

    def _sync_state(self) -> None:
        """Updates internal status inside RuntimeState."""
        lap = self.frames[self.current_idx].lap if (self.frames and self.current_idx < len(self.frames)) else 1
        self.state.replay_status.update({
            "running": self.is_running,
            "paused": self.is_paused,
            "current_frame": self.current_idx,
            "total_frames": len(self.frames),
            "current_lap": lap,
            "playback_speed": self.playback_speed,
            "session_id": self.state.session_info["session_id"],
            "data_mode": "REPLAY",
        })

    async def start(self) -> Dict[str, Any]:
        """Starts replay playback loop from current position."""
        if self.is_running and not self.is_paused:
            return self.get_status()

        if not self.frames:
            raise RuntimeError("No replay dataset loaded.")

        if self.is_paused:
            self.is_paused = False
            self.is_running = True
            self._sync_state()
            return self.get_status()

        self.is_running = True
        self.is_paused = False
        self._sync_state()

        # Start playback loop in background task
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._playback_loop())
        return self.get_status()

    async def pause(self) -> Dict[str, Any]:
        """Pauses active playback."""
        if not self.is_running:
            return self.get_status()
        self.is_paused = True
        self._sync_state()
        return self.get_status()

    async def resume(self) -> Dict[str, Any]:
        """Resumes paused playback."""
        if self.is_running and self.is_paused:
            self.is_paused = False
            self._sync_state()
        elif not self.is_running:
            await self.start()
        return self.get_status()

    async def stop(self) -> Dict[str, Any]:
        """Stops playback and cancels running task."""
        self.is_running = False
        self.is_paused = False
        if self._task and not self._task.done():
            self._task.cancel()
        self._sync_state()
        return self.get_status()

    async def reset(self) -> Dict[str, Any]:
        """Stops and resets playback position to beginning."""
        await self.stop()
        self.current_idx = 0
        self.pipeline.reset()
        self.state.reset()
        self.ws_manager.reset()
        self._sync_state()
        return self.get_status()

    async def seek(self, frame_index: int) -> Dict[str, Any]:
        """Seeks to a designated frame index."""
        if frame_index < 0 or frame_index >= len(self.frames):
            raise ValueError(
                f"Seek index {frame_index} out of bounds (valid: 0..{len(self.frames) - 1})"
            )
        self.current_idx = frame_index
        # Process single frame to update pipeline and state to seek position
        await self.step_frame()
        self._sync_state()
        return self.get_status()

    def set_playback_speed(self, speed: float) -> Dict[str, Any]:
        """Sets playback speed multiplier."""
        if speed <= 0.0 or speed > 10.0:
            raise ValueError(f"Invalid playback speed {speed}. Must be > 0.0 and <= 10.0")
        self.playback_speed = float(speed)
        self._sync_state()
        return self.get_status()

    async def step_frame(self) -> Optional[TelemetryFrame]:
        """
        Processes a single frame through the pipeline and broadcasts output.
        """
        if self.current_idx >= len(self.frames):
            self.is_running = False
            self._sync_state()
            return None

        frame = self.frames[self.current_idx]
        result = self.pipeline.process_frame(frame)
        self.state.update_from_pipeline_result(result)
        await self.ws_manager.broadcast_pipeline_result(result)

        self.current_idx += 1
        self._sync_state()
        return frame

    async def _playback_loop(self) -> None:
        """Internal asynchronous loop driving temporal playback."""
        try:
            while self.is_running and self.current_idx < len(self.frames):
                if self.is_paused:
                    await asyncio.sleep(0.1)
                    continue

                curr_frame = self.frames[self.current_idx]
                next_frame = self.frames[self.current_idx + 1] if self.current_idx + 1 < len(self.frames) else None

                # Calculate temporal delay between consecutive frames
                dt = 0.1  # Nominal default
                if next_frame is not None:
                    raw_dt = next_frame.timestamp - curr_frame.timestamp
                    if 0.0 < raw_dt < 5.0:
                        dt = raw_dt

                delay = max(0.005, dt / max(0.1, self.playback_speed))

                await self.step_frame()
                await asyncio.sleep(delay)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in playback loop: {e}", exc_info=True)
        finally:
            self.is_running = False
            self._sync_state()

    def get_status(self) -> Dict[str, Any]:
        """Returns current status dictionary."""
        self._sync_state()
        return dict(self.state.replay_status)
