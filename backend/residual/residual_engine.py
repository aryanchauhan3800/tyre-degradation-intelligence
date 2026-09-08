"""
TYRETRACE — Actual-vs-Expected Residual Engine
Calculates the discrepancy between actual derived vehicle acceleration and
first-principles physics digital twin predictions.

SCIENTIFIC POLICY:
Residual = unexplained difference between actual and physics-expected vehicle behaviour.
(It is NOT tyre degradation directly; tyre degradation is inferred downstream).
"""

from collections import defaultdict
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from backend.residual.features import (
    calculate_residual_quality_confidence,
    compute_linear_slope,
    compute_persistence_ratio,
)
from backend.residual.schemas import (
    LapResidualSummary,
    ResidualFrame,
    ResidualQualityStatus,
    ResidualSessionReport,
)
from backend.schemas.telemetry import TelemetryFrame
from backend.schemas.twin import TwinEngineOutput
from backend.twin_engine.interface import TwinEngine


class ResidualEngine:
    """
    Computes and aggregates Actual-vs-Expected acceleration residuals:
        r_ax(t) = ax_actual(t) - ax_expected(t)
    """

    def __init__(
        self,
        twin_engine: Optional[TwinEngine] = None,
        epsilon: float = 1.0,
        persistence_threshold: float = 1.0,
        max_realistic_accel: float = 60.0,
        min_dt: float = 0.001,
    ):
        self.twin: TwinEngine = twin_engine or TwinEngine()
        self.epsilon: float = float(epsilon)
        self.persistence_threshold: float = float(persistence_threshold)
        self.max_realistic_accel: float = float(max_realistic_accel)
        self.min_dt: float = float(min_dt)

        self._last_timestamp: Optional[float] = None
        self._last_speed_mps: Optional[float] = None
        self._processed_count: int = 0
        self._frames: List[ResidualFrame] = []

    def reset(self) -> None:
        """Resets kinematic derivative history and stored frames."""
        self._last_timestamp = None
        self._last_speed_mps = None
        self._processed_count = 0
        self._frames = []
        self.twin.reset()

    def process_frame(
        self,
        telemetry_frame: TelemetryFrame,
        expected_twin_output: Optional[TwinEngineOutput] = None,
    ) -> ResidualFrame:
        """
        Processes a single TelemetryFrame against the TwinEngine output.
        Computes ax_actual, evaluates data quality, and derives r_ax(t).
        """
        self._processed_count += 1
        t_now = float(telemetry_frame.timestamp)
        veh = telemetry_frame.vehicle
        v_now = veh.speed_mps

        # Step Twin Engine if not pre-computed
        if expected_twin_output is None:
            twin_out = self.twin.step(telemetry_frame)
        else:
            twin_out = expected_twin_output

        ax_expected = float(twin_out.expected_acceleration_mps2)

        # Acceleration Derivation & Data Quality Checks
        ax_actual: Optional[float] = None
        residual: Optional[float] = None
        norm_residual: Optional[float] = None
        status = ResidualQualityStatus.VALID
        reason: Optional[str] = None

        if v_now is None or (isinstance(v_now, float) and math.isnan(v_now)):
            status = ResidualQualityStatus.MISSING_INPUT
            reason = "Vehicle speed is None or NaN"
        elif self._last_timestamp is None or self._last_speed_mps is None:
            status = ResidualQualityStatus.MISSING_INPUT
            reason = "Initial frame in session (no preceding kinematic sample)"
        else:
            dt = t_now - self._last_timestamp
            dv = v_now - self._last_speed_mps

            if dt <= 0.0:
                status = ResidualQualityStatus.INVALID_DT
                reason = f"Non-positive or duplicate delta time: dt={dt:.5f}s"
            elif dt < self.min_dt:
                status = ResidualQualityStatus.INVALID_DT
                reason = f"Sub-millisecond jitter below threshold: dt={dt:.5f}s"
            else:
                raw_ax = dv / dt
                if abs(raw_ax) > self.max_realistic_accel:
                    status = ResidualQualityStatus.NUMERICAL_OUTLIER
                    reason = f"Acceleration derivative spike exceeding {self.max_realistic_accel:.0f} m/s^2: {raw_ax:.2f} m/s^2"
                else:
                    # Valid derivative
                    ax_actual = round(float(raw_ax), 4)
                    # Core residual: r_ax = ax_actual - ax_expected
                    residual = round(ax_actual - ax_expected, 4)
                    # Normalized residual: r_ax / max(|ax_expected|, epsilon)
                    denom = max(abs(ax_expected), self.epsilon)
                    norm_residual = round(residual / denom, 4)

        # Update tracking history
        self._last_timestamp = t_now
        self._last_speed_mps = v_now

        tyre_ref = telemetry_frame.tyres.fl
        tyre_age = tyre_ref.tyre_life_laps
        compound = tyre_ref.compound
        stint = tyre_ref.stint

        frame = ResidualFrame(
            timestamp=t_now,
            timestamp_iso=telemetry_frame.timestamp_iso,
            session_id=telemetry_frame.session_id,
            lap=telemetry_frame.lap,
            distance_m=telemetry_frame.distance_m,
            relative_distance=telemetry_frame.relative_distance,
            driver=telemetry_frame.driver,
            actual_acceleration_mps2=ax_actual,
            expected_acceleration_mps2=round(ax_expected, 4),
            acceleration_residual_mps2=residual,
            normalized_residual=norm_residual,
            actual_speed_mps=round(v_now, 4) if v_now is not None else 0.0,
            tyre_age=tyre_age,
            compound=compound,
            stint=stint,
            corner_residuals=None,  # Reserved for multi-wheel telemetry
            quality_status=status,
            quality_reason=reason,
            signal_origin="DERIVED_FROM_FASTF1_SPEED",
        )

        self._frames.append(frame)
        return frame

    def process_session(
        self,
        frames: List[TelemetryFrame],
    ) -> Tuple[List[ResidualFrame], ResidualSessionReport]:
        """
        Executes sequential residual calculations across an entire session.
        Aggregates lap-level metrics and produces a comprehensive session report.
        """
        self.reset()
        residual_frames: List[ResidualFrame] = []

        for f in frames:
            rf = self.process_frame(f)
            residual_frames.append(rf)

        # Aggregation by lap
        laps_dict: Dict[int, List[ResidualFrame]] = defaultdict(list)
        for rf in residual_frames:
            laps_dict[rf.lap].append(rf)

        lap_summaries: List[LapResidualSummary] = []
        for lap_idx in sorted(laps_dict.keys()):
            lap_frames = laps_dict[lap_idx]
            valid_lap_frames = [f for f in lap_frames if f.quality_status == ResidualQualityStatus.VALID and f.acceleration_residual_mps2 is not None]

            sample_count = len(lap_frames)
            valid_count = len(valid_lap_frames)
            invalid_count = sample_count - valid_count

            invalid_dt = sum(1 for f in lap_frames if f.quality_status == ResidualQualityStatus.INVALID_DT)
            outliers = sum(1 for f in lap_frames if f.quality_status == ResidualQualityStatus.NUMERICAL_OUTLIER)
            lap_confidence = calculate_residual_quality_confidence(
                total_samples=sample_count,
                valid_samples=valid_count,
                invalid_dt_count=invalid_dt,
                outlier_count=outliers,
            )

            if valid_count > 0:
                r_vals = [f.acceleration_residual_mps2 for f in valid_lap_frames]
                t_vals = [f.timestamp for f in valid_lap_frames]

                mean_r = round(float(np.mean(r_vals)), 4)
                abs_mean_r = round(float(np.mean(np.abs(r_vals))), 4)
                std_r = round(float(np.std(r_vals, ddof=1)), 4) if valid_count > 1 else 0.0
                min_r = round(float(np.min(r_vals)), 4)
                max_r = round(float(np.max(r_vals)), 4)
                slope_r = compute_linear_slope(t_vals, r_vals)
                if slope_r is not None:
                    slope_r = round(slope_r, 4)
                persistence = compute_persistence_ratio(r_vals, threshold=self.persistence_threshold)
                if persistence is not None:
                    persistence = round(persistence, 4)
            else:
                mean_r = abs_mean_r = std_r = min_r = max_r = slope_r = persistence = None

            ref_frame = lap_frames[0]
            summary = LapResidualSummary(
                lap=lap_idx,
                sample_count=sample_count,
                valid_sample_count=valid_count,
                invalid_sample_count=invalid_count,
                mean_residual=mean_r,
                abs_mean_residual=abs_mean_r,
                std_residual=std_r,
                residual_min=min_r,
                residual_max=max_r,
                residual_slope=slope_r,
                persistence_ratio=persistence,
                residual_quality_confidence=lap_confidence,
                compound=ref_frame.compound,
                tyre_age=ref_frame.tyre_age,
                stint=ref_frame.stint,
            )
            lap_summaries.append(summary)

        # Session-level totals
        total_samples = len(residual_frames)
        all_valid = [f for f in residual_frames if f.quality_status == ResidualQualityStatus.VALID and f.acceleration_residual_mps2 is not None]
        valid_samples = len(all_valid)
        invalid_samples = total_samples - valid_samples

        all_invalid_dt = sum(1 for f in residual_frames if f.quality_status == ResidualQualityStatus.INVALID_DT)
        all_outliers = sum(1 for f in residual_frames if f.quality_status == ResidualQualityStatus.NUMERICAL_OUTLIER)
        overall_conf = calculate_residual_quality_confidence(
            total_samples=total_samples,
            valid_samples=valid_samples,
            invalid_dt_count=all_invalid_dt,
            outlier_count=all_outliers,
        )

        if valid_samples > 0:
            sess_r = [f.acceleration_residual_mps2 for f in all_valid]
            sess_mean = round(float(np.mean(sess_r)), 4)
            sess_std = round(float(np.std(sess_r, ddof=1)), 4) if valid_samples > 1 else 0.0
            sess_abs_mean = round(float(np.mean(np.abs(sess_r))), 4)
            sess_max_abs = round(float(np.max(np.abs(sess_r))), 4)
        else:
            sess_mean = sess_std = sess_abs_mean = sess_max_abs = None

        session_id = residual_frames[0].session_id if residual_frames else "UNKNOWN"
        report = ResidualSessionReport(
            session_id=session_id,
            total_samples=total_samples,
            valid_samples=valid_samples,
            invalid_samples=invalid_samples,
            mean_residual=sess_mean,
            std_residual=sess_std,
            mean_abs_residual=sess_abs_mean,
            max_abs_residual=sess_max_abs,
            overall_quality_confidence=overall_conf,
            lap_summaries=lap_summaries,
        )

        return residual_frames, report

    def get_visualization_data(
        self,
        residual_frames: Optional[List[ResidualFrame]] = None,
    ) -> Dict[str, Any]:
        """
        Produces clean, JSON-serializable timeseries series suitable for plotting:
            time, actual_acceleration, expected_acceleration, residual, normalized_residual
        """
        frames = residual_frames if residual_frames is not None else self._frames

        time_list: List[float] = []
        actual_accel_list: List[Optional[float]] = []
        expected_accel_list: List[float] = []
        residual_list: List[Optional[float]] = []
        norm_residual_list: List[Optional[float]] = []

        for f in frames:
            time_list.append(f.timestamp)
            actual_accel_list.append(f.actual_acceleration_mps2)
            expected_accel_list.append(f.expected_acceleration_mps2)
            residual_list.append(f.acceleration_residual_mps2)
            norm_residual_list.append(f.normalized_residual)

        return {
            "time": time_list,
            "actual_acceleration": actual_accel_list,
            "expected_acceleration": expected_accel_list,
            "residual": residual_list,
            "normalized_residual": norm_residual_list,
        }
