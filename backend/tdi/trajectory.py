"""
TYRETRACE — TDI Trajectory & Trend Engine
Manages rolling degradation trajectories, windowed smoothing, and trend classification.

CRITICAL BEHAVIOURAL RULE:
Do not allow a single-frame anomaly to register as degradation.
A transient pulse like 31 -> 82 -> 29 must be classified as SPIKE and smoothed,
not mistaken for sustained physical degradation.
"""

from collections import deque
from typing import Deque, List, Optional, Tuple
import numpy as np

from backend.tdi.schemas import TDITrend


class TDITrajectoryTracker:
    """
    Maintains a rolling history of TDI observations to compute smoothed trajectories
    and classify temporal trends (STABLE, RISING, FALLING, SPIKE, UNKNOWN).
    """

    def __init__(self, window_size: int = 15, min_samples: int = 5, spike_threshold: float = 25.0):
        self.window_size = window_size
        self.min_samples = min_samples
        self.spike_threshold = spike_threshold

        self.history: Deque[Tuple[float, float]] = deque(maxlen=window_size)  # (timestamp, raw_tdi)
        self.smoothed_history: Deque[float] = deque(maxlen=window_size)

    def add_observation(self, timestamp: float, tdi: float) -> Tuple[float, TDITrend]:
        """
        Appends a new TDI observation, computes the rolling smoothed value,
        and determines the temporal trend.

        Returns:
            (smoothed_tdi, trend)
        """
        self.history.append((timestamp, tdi))

        # Check if current observation is an isolated spike relative to recent history
        is_spike = False
        if len(self.history) >= 3:
            prev_values = [v for _, v in list(self.history)[:-1]]
            recent_median = float(np.median(prev_values[-min(5, len(prev_values)):]))
            if abs(tdi - recent_median) >= self.spike_threshold:
                is_spike = True

        # Calculate robust smoothed TDI (median-damped rolling average)
        values = [v for _, v in self.history]
        if len(values) >= 3:
            # Use rolling median or 80/20 trimmed mean to suppress single frame spikes
            sorted_vals = sorted(values)
            if len(sorted_vals) >= 5:
                # Trim highest and lowest
                trimmed = sorted_vals[1:-1]
                smoothed_tdi = float(np.mean(trimmed))
            else:
                smoothed_tdi = float(np.median(sorted_vals))
        else:
            smoothed_tdi = float(np.mean(values))

        self.smoothed_history.append(smoothed_tdi)

        # Determine trend
        trend = self._classify_trend(is_spike)
        return round(smoothed_tdi, 2), trend

    def _classify_trend(self, is_spike: bool) -> TDITrend:
        """
        Classifies trajectory trend based on recent history slope and spike detection.
        """
        if is_spike:
            return TDITrend.SPIKE

        if len(self.smoothed_history) < self.min_samples:
            return TDITrend.UNKNOWN

        # Linear regression on smoothed values over recent window
        y = np.array(list(self.smoothed_history))
        x = np.arange(len(y))

        # Calculate slope: delta TDI per step
        if np.std(x) == 0:
            return TDITrend.UNKNOWN

        slope, _ = np.polyfit(x, y, 1)

        # Trend classification thresholds (MODEL PARAMETER — DEMO ASSUMPTION)
        # Over a 10-step horizon, slope > 0.2 means +2 TDI points
        if slope > 0.25:
            return TDITrend.RISING
        elif slope < -0.25:
            return TDITrend.FALLING
        else:
            return TDITrend.STABLE

    def get_trajectory_summary(self) -> List[float]:
        """Returns the list of smoothed TDI values currently in window."""
        return list(self.smoothed_history)

    def reset(self) -> None:
        """Clears trajectory tracker buffers."""
        self.history.clear()
        self.smoothed_history.clear()
