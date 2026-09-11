"""
TYRETRACE — Real-Time Runtime State Management
Maintains in-memory, thread-safe runtime state of all telemetry, physics, residuals, TDI,
and rolling history streams for real-time REST querying and WebSocket broadcasts.
"""

from collections import deque
from datetime import datetime
import threading
from typing import Any, Deque, Dict, List, Optional

from backend.api.pipeline import PipelineResult
from backend.api.schemas import (
    CornerSlot,
    FourWheelTyresResponse,
    LapSummaryResponse,
    ReplayStatusResponse,
    ResidualHistoryPoint,
    SessionResponse,
    TDIHistoryPoint,
)
from backend.schemas.telemetry import TelemetryFrame


class RuntimeState:
    """
    In-memory state store keeping the latest pipeline output and historical buffers.
    """

    def __init__(self, history_limit: int = 300):
        self.history_limit = history_limit
        self._lock = threading.Lock()

        # Session metadata
        self.session_info: Dict[str, Any] = {
            "session_id": "F1_2023_MONZA_Q_VER",
            "event": "Italian Grand Prix",
            "year": 2023,
            "session": "Q",
            "driver": "VER",
            "data_mode": "REPLAY",
            "total_laps": 1,
            "current_lap": 20,
            "tyre_compound": "SOFT",
            "tyre_age": 2,
        }

        # Latest frame containers
        self.current_telemetry: Optional[TelemetryFrame] = None
        self.current_physics: Optional[Dict[str, Any]] = None
        self.current_residual: Optional[Dict[str, Any]] = None
        self.current_confounders: Optional[Dict[str, Any]] = None
        self.current_tdi: Optional[Dict[str, Any]] = None
        self.current_tyres: FourWheelTyresResponse = FourWheelTyresResponse()

        # Historical rolling trajectories
        self.tdi_history: Deque[TDIHistoryPoint] = deque(maxlen=history_limit)
        self.residual_history: Deque[ResidualHistoryPoint] = deque(maxlen=history_limit)

        # Lap-level tracking
        self.lap_summaries: Dict[int, LapSummaryResponse] = {}

        # Replay controller status
        self.replay_status: Dict[str, Any] = {
            "running": False,
            "paused": False,
            "current_frame": 0,
            "total_frames": 0,
            "current_lap": 1,
            "playback_speed": 1.0,
            "session_id": "F1_2023_MONZA_Q_VER",
            "data_mode": "REPLAY",
        }

    def update_from_pipeline_result(self, result: PipelineResult) -> None:
        """
        Atomically updates the runtime state using a fresh PipelineResult.
        """
        with self._lock:
            tel = result.telemetry
            iso_ts = tel.timestamp_iso or f"T+{tel.timestamp:.3f}s"
            lap = tel.lap

            # 1. Update latest components
            self.current_telemetry = tel
            self.current_physics = result.physics

            res_frame = result.residual
            self.current_residual = {
                "actual_acceleration_mps2": res_frame.actual_acceleration_mps2,
                "expected_acceleration_mps2": res_frame.expected_acceleration_mps2,
                "raw_residual_mps2": res_frame.acceleration_residual_mps2,
                "normalized_residual": res_frame.normalized_residual,
                "quality_status": res_frame.quality_status.value,
                "rolling_features": {},
                "trend": "STABLE",
            }

            conf_frame = result.confounders
            flags = conf_frame.active_flags
            self.current_confounders = {
                "active_flags": flags,
                "drs_active": "DRS_ACTIVE" in flags,
                "braking_active": "HEAVY_BRAKING" in flags,
                "throttle_active": "HIGH_THROTTLE" in flags,
                "high_speed_active": "HIGH_SPEED" in flags,
                "transient_active": "TRANSIENT_EVENT" in flags or "TRANSIENT_DYNAMICS" in flags,
                "tyre_age_laps": tel.tyres.fl.tyre_life_laps,
                "compound": tel.tyres.fl.compound,
                "non_tyre_explanation_score": conf_frame.non_tyre_explanation_score,
                "tyre_evidence_quality": conf_frame.tyre_evidence_quality,
                "confounders": conf_frame.confounders.model_dump(),
            }

            tdi_frame = result.tdi_frame
            self.current_tdi = {
                "physics_tdi": result.physics_tdi,
                "ai_tdi": result.ai_tdi,
                "final_tdi": result.final_tdi,
                "state": tdi_frame.state.value,
                "trend": tdi_frame.trend.value,
                "confidence": tdi_frame.confidence,
                "model_reliability": result.model_reliability,
                "evidence": tdi_frame.evidence,
                "counter_evidence": tdi_frame.counter_evidence,
            }

            # 2. Tyres state (FastF1 source: wheel-level degradation is explicitly unavailable)
            self.current_tyres = FourWheelTyresResponse(
                FL=CornerSlot(available=False, tdi=None),
                FR=CornerSlot(available=False, tdi=None),
                RL=CornerSlot(available=False, tdi=None),
                RR=CornerSlot(available=False, tdi=None),
            )

            # 3. Update session metadata
            self.session_info["current_lap"] = lap
            self.session_info["tyre_compound"] = tel.tyres.fl.compound
            self.session_info["tyre_age"] = tel.tyres.fl.tyre_life_laps

            # 4. Append to rolling history
            self.tdi_history.append(
                TDIHistoryPoint(
                    timestamp_iso=iso_ts,
                    timestamp_sec=tel.timestamp,
                    lap=lap,
                    physics_tdi=result.physics_tdi,
                    ai_tdi=result.ai_tdi,
                    final_tdi=result.final_tdi,
                )
            )

            self.residual_history.append(
                ResidualHistoryPoint(
                    timestamp_iso=iso_ts,
                    timestamp_sec=tel.timestamp,
                    lap=lap,
                    raw_residual_mps2=res_frame.acceleration_residual_mps2,
                    normalized_residual=res_frame.normalized_residual,
                    tyre_evidence_quality=conf_frame.tyre_evidence_quality,
                    non_tyre_explanation_score=conf_frame.non_tyre_explanation_score,
                )
            )

            # 5. Maintain lap summary aggregation
            if lap not in self.lap_summaries:
                self.lap_summaries[lap] = LapSummaryResponse(
                    lap=lap,
                    tyre_compound=tel.tyres.fl.compound,
                    tyre_age=tel.tyres.fl.tyre_life_laps,
                    mean_residual_mps2=res_frame.acceleration_residual_mps2,
                    mean_tdi=result.final_tdi,
                    min_tdi=result.final_tdi,
                    max_tdi=result.final_tdi,
                    final_tdi=result.final_tdi,
                    trend=tdi_frame.trend.value,
                    confidence=tdi_frame.confidence,
                    sample_count=1,
                )
            else:
                summary = self.lap_summaries[lap]
                n = summary.sample_count + 1
                new_mean_tdi = round(((summary.mean_tdi * summary.sample_count) + result.final_tdi) / n, 2)
                res_val = res_frame.acceleration_residual_mps2 or 0.0
                curr_res = summary.mean_residual_mps2 or 0.0
                new_mean_res = round(((curr_res * summary.sample_count) + res_val) / n, 3)

                self.lap_summaries[lap] = LapSummaryResponse(
                    lap=lap,
                    tyre_compound=tel.tyres.fl.compound,
                    tyre_age=tel.tyres.fl.tyre_life_laps,
                    mean_residual_mps2=new_mean_res,
                    mean_tdi=new_mean_tdi,
                    min_tdi=min(summary.min_tdi, result.final_tdi),
                    max_tdi=max(summary.max_tdi, result.final_tdi),
                    final_tdi=result.final_tdi,
                    trend=tdi_frame.trend.value,
                    confidence=tdi_frame.confidence,
                    sample_count=n,
                )

    def reset(self) -> None:
        """Clears all state and histories."""
        with self._lock:
            self.current_telemetry = None
            self.current_physics = None
            self.current_residual = None
            self.current_confounders = None
            self.current_tdi = None
            self.tdi_history.clear()
            self.residual_history.clear()
            self.lap_summaries.clear()
            self.replay_status["current_frame"] = 0
            self.replay_status["running"] = False
            self.replay_status["paused"] = False


# Global singleton instance for API dependency injection
runtime_state = RuntimeState()
