"""
TYRETRACE — Replay Engine
Streams canonical telemetry frames sequentially from recorded JSON sessions.
"""

import json
from pathlib import Path
import time
from typing import Any, Callable, Dict, Iterator, List, Optional, Union

from backend.schemas.telemetry import TelemetryFrame
from backend.telemetry.adapter import CanonicalTelemetryAdapter, MalformedTelemetryError, TelemetryAdapter


class ReplayEngine:
    """
    Sequentially replays TelemetryFrame instances from serialized JSON sessions.
    Supports real-time pacing, custom playback speed multipliers, or instant stepping.
    """

    def __init__(
        self,
        adapter: Optional[TelemetryAdapter] = None,
        strict: bool = True,
    ):
        self.adapter: TelemetryAdapter = adapter or CanonicalTelemetryAdapter()
        self.strict: bool = strict
        self._frames_raw: List[Dict[str, Any]] = []
        self._parsed_frames: List[TelemetryFrame] = []
        self._current_index: int = 0
        self._session_id: Optional[str] = None
        self.dropped_frames_count: int = 0

    def load_file(self, file_path: Union[str, Path]) -> int:
        """
        Loads and parses a JSON or JSONL file into the replay buffer.
        Returns the number of successfully parsed frames.
        """
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"Telemetry replay file not found: {path}")

        raw_content = path.read_text(encoding="utf-8").strip()
        if not raw_content:
            raise ValueError(f"Telemetry replay file is empty: {path}")

        raw_items: List[Any] = []
        if raw_content.startswith("["):
            # Standard JSON array
            try:
                raw_items = json.loads(raw_content)
            except json.JSONDecodeError as exc:
                raise MalformedTelemetryError(f"Corrupted JSON array in {path}: {exc}") from exc
        else:
            # Assume JSON-Lines format (one JSON object per line)
            for line_no, line in enumerate(raw_content.splitlines(), start=1):
                trimmed = line.strip()
                if not trimmed:
                    continue
                try:
                    raw_items.append(json.loads(trimmed))
                except json.JSONDecodeError as exc:
                    if self.strict:
                        raise MalformedTelemetryError(
                            f"Corrupted JSON line {line_no} in {path}: {exc}"
                        ) from exc
                    self.dropped_frames_count += 1

        return self.load_data(raw_items)

    def load_data(self, items: List[Dict[str, Any]]) -> int:
        """
        Validates and loads a list of raw telemetry items into memory.
        """
        self.reset()
        self._frames_raw = items
        self._parsed_frames = []

        for idx, item in enumerate(items):
            try:
                frame = self.adapter.parse(item)
                self._parsed_frames.append(frame)
                if not self._session_id:
                    self._session_id = frame.session_id
            except Exception as e:
                if self.strict:
                    raise MalformedTelemetryError(
                        f"Failed parsing frame at index {idx}: {str(e)}"
                    ) from e
                self.dropped_frames_count += 1

        return len(self._parsed_frames)

    def has_next(self) -> bool:
        """Checks if there are remaining frames in the replay stream."""
        return self._current_index < len(self._parsed_frames)

    def step(self) -> Optional[TelemetryFrame]:
        """
        Advances by one frame and returns it, or None if the end of replay is reached.
        """
        if not self.has_next():
            return None
        frame = self._parsed_frames[self._current_index]
        self._current_index += 1
        return frame

    def rewind(self, to_index: int = 0) -> None:
        """Rewinds playback cursor to a specific frame index."""
        if to_index < 0 or to_index > len(self._parsed_frames):
            raise IndexError(f"Invalid frame index {to_index} (total {len(self._parsed_frames)})")
        self._current_index = to_index

    def reset(self) -> None:
        """Resets engine state and playback cursor to 0."""
        self._frames_raw = []
        self._parsed_frames = []
        self._current_index = 0
        self._session_id = None
        self.dropped_frames_count = 0

    @property
    def total_frames(self) -> int:
        return len(self._parsed_frames)

    @property
    def current_index(self) -> int:
        return self._current_index

    @property
    def session_id(self) -> Optional[str]:
        return self._session_id

    def stream(
        self,
        playback_speed: float = 0.0,
        start_from_current: bool = False,
    ) -> Iterator[TelemetryFrame]:
        """
        Generator that streams frames sequentially.
        If playback_speed > 0, pauses according to timestamp deltas divided by playback_speed.
        If playback_speed == 0, yields instantly with zero delay.
        """
        if not start_from_current:
            self._current_index = 0

        last_timestamp: Optional[float] = None

        while self.has_next():
            frame = self.step()
            if frame is None:
                break

            if playback_speed > 0.0 and last_timestamp is not None:
                delta_t = frame.timestamp - last_timestamp
                if delta_t > 0:
                    sleep_sec = delta_t / playback_speed
                    # Cap excessive gaps to prevent freezing during simulation pauses
                    time.sleep(min(sleep_sec, 2.0))

            last_timestamp = frame.timestamp
            yield frame

    def play(
        self,
        callback: Callable[[TelemetryFrame], None],
        playback_speed: float = 0.0,
    ) -> int:
        """
        Plays all remaining frames, invoking callback(frame) on each frame.
        Returns the count of processed frames.
        """
        count = 0
        for frame in self.stream(playback_speed=playback_speed, start_from_current=True):
            callback(frame)
            count += 1
        return count
