"""
TYRETRACE — Confounder Analysis Engine
Processes Actual-vs-Expected residuals and contextual telemetry, evaluating candidate non-tyre
physical factors (aero DRS, threshold braking, transients, environmental shifts) to quantify
non-tyre explanations and isolate clean tyre evidence.
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from backend.confounders.rules import (
    calculate_scores_and_interpretation,
    classify_tyre_age,
    evaluate_braking,
    evaluate_compound,
    evaluate_data_quality,
    evaluate_drs,
    evaluate_environment,
    evaluate_high_speed,
    evaluate_rainfall,
    evaluate_throttle,
    evaluate_transient,
)
from backend.confounders.schemas import (
    ConfounderEvaluation,
    ConfounderFrame,
    ConfounderInterpretation,
    LapConfounderSummary,
    SessionConfounderReport,
    TyreAgeBand,
)
from backend.residual.schemas import ResidualFrame, ResidualQualityStatus
from backend.schemas.telemetry import TelemetryFrame


class ConfounderEngine:
    """
    Deterministic Confounder Analysis Engine for TYRETRACE.
    Evaluates whether abnormal residuals can plausibly be explained by non-tyre factors.
    """

    def __init__(self):
        self._last_timestamp: Optional[float] = None
        self._last_throttle: Optional[float] = None
        self._last_brake: Optional[float] = None
        self._last_accel: Optional[float] = None
        self._history: List[ConfounderFrame] = []

    def reset(self) -> None:
        """Resets dynamic tracking state."""
        self._last_timestamp = None
        self._last_throttle = None
        self._last_brake = None
        self._last_accel = None
        self._history = []

    def evaluate_frame(
        self,
        residual_frame: ResidualFrame,
        telemetry_frame: Optional[TelemetryFrame] = None,
    ) -> ConfounderFrame:
        """
        Evaluates a single ResidualFrame, using associated TelemetryFrame channels if available.
        """
        t_now = residual_frame.timestamp
        raw_res = residual_frame.acceleration_residual_mps2
        res_mag = abs(raw_res) if raw_res is not None else 0.0
        speed_mps = residual_frame.actual_speed_mps

        # Extract telemetry channels (if available)
        drs_code: Optional[int] = None
        throttle_pct: float = 0.0
        brake_pct: float = 0.0
        track_temp_c: Optional[float] = None
        air_temp_c: Optional[float] = None
        wind_speed: Optional[float] = None
        rainfall: Optional[bool] = None
        track_cond: str = "dry"

        if telemetry_frame is not None:
            veh = telemetry_frame.vehicle
            drs_code = veh.drs
            throttle_pct = veh.throttle_pct
            brake_pct = veh.brake_pct

            env = telemetry_frame.environment
            track_temp_c = env.track_temp_c
            air_temp_c = env.ambient_temp_c
            wind_speed = env.wind_speed_mps
            rainfall = env.rainfall
            track_cond = env.track_condition

        # Compute dynamic rates of change for transient detection
        d_throttle_dt: Optional[float] = None
        d_brake_dt: Optional[float] = None
        d_accel_dt: Optional[float] = None

        if self._last_timestamp is not None:
            dt = t_now - self._last_timestamp
            if dt > 0.001:
                if self._last_throttle is not None:
                    d_throttle_dt = (throttle_pct - self._last_throttle) / dt
                if self._last_brake is not None:
                    d_brake_dt = (brake_pct - self._last_brake) / dt
                if residual_frame.actual_acceleration_mps2 is not None and self._last_accel is not None:
                    d_accel_dt = (residual_frame.actual_acceleration_mps2 - self._last_accel) / dt

        # Update tracking state
        self._last_timestamp = t_now
        self._last_throttle = throttle_pct
        self._last_brake = brake_pct
        self._last_accel = residual_frame.actual_acceleration_mps2

        # 1. Evaluate individual confounder categories
        drs_eval = evaluate_drs(drs_code, res_mag)
        brake_eval = evaluate_braking(brake_pct, res_mag)
        throttle_eval = evaluate_throttle(throttle_pct)
        speed_eval = evaluate_high_speed(speed_mps)
        transient_eval = evaluate_transient(d_throttle_dt, d_brake_dt, d_accel_dt)
        age_band, age_eval = classify_tyre_age(residual_frame.tyre_age)
        compound_eval = evaluate_compound(residual_frame.compound)
        env_eval = evaluate_environment(track_temp_c, air_temp_c, wind_speed)
        rain_eval = evaluate_rainfall(rainfall, track_cond)
        quality_eval = evaluate_data_quality(residual_frame.quality_status, residual_frame.quality_reason)

        conf_eval = ConfounderEvaluation(
            drs=drs_eval,
            braking=brake_eval,
            throttle=throttle_eval,
            high_speed=speed_eval,
            transient=transient_eval,
            tyre_age=age_eval,
            compound=compound_eval,
            environment=env_eval,
            rainfall=rain_eval,
            data_quality=quality_eval,
        )

        # Collect active flag strings
        active_flags = []
        if drs_eval.active:
            active_flags.append("DRS_ACTIVE")
        if brake_eval.active:
            active_flags.append("HEAVY_BRAKING")
        if throttle_eval.active:
            active_flags.append("HIGH_THROTTLE")
        if speed_eval.active:
            active_flags.append("HIGH_SPEED")
        if transient_eval.active:
            active_flags.append("TRANSIENT_EVENT")
        if rain_eval.active:
            active_flags.append("RAIN_PRESENT")
        if env_eval.active:
            active_flags.append("ENVIRONMENT_SHIFT")
        if quality_eval.active:
            active_flags.append(f"DATA_QUALITY_{residual_frame.quality_status.value}")

        # 2. Synthesize scores, evidence quality, and interpretation
        non_tyre_score, tyre_evidence, interpretation, explanations = calculate_scores_and_interpretation(
            conf=conf_eval,
            residual=raw_res,
            age_band=age_band,
            raw_quality_status=residual_frame.quality_status,
        )

        # 3. Adjusted residual: analytical weighting only (raw * tyre_evidence)
        adj_res = round(raw_res * tyre_evidence, 4) if raw_res is not None else None

        # Residual confidence remaining
        remaining_confidence = round(tyre_evidence, 3) if residual_frame.quality_status == ResidualQualityStatus.VALID else 0.0

        c_frame = ConfounderFrame(
            timestamp=t_now,
            lap=residual_frame.lap,
            distance_m=residual_frame.distance_m,
            raw_residual=raw_res,
            normalized_residual=residual_frame.normalized_residual,
            actual_speed_mps=round(speed_mps, 3),
            confounders=conf_eval,
            active_flags=active_flags,
            non_tyre_explanation_score=non_tyre_score,
            tyre_evidence_quality=tyre_evidence,
            adjusted_residual=adj_res,
            interpretation=interpretation,
            explanation=explanations,
            confidence=remaining_confidence,
        )

        self._history.append(c_frame)
        return c_frame

    def process_session(
        self,
        residual_frames: List[ResidualFrame],
        telemetry_frames: Optional[List[TelemetryFrame]] = None,
    ) -> Tuple[List[ConfounderFrame], SessionConfounderReport]:
        """
        Executes confounder analysis over an entire session.
        """
        self.reset()
        conf_frames: List[ConfounderFrame] = []

        tel_map = {round(f.timestamp, 4): f for f in telemetry_frames} if telemetry_frames else {}

        for rf in residual_frames:
            tf = tel_map.get(round(rf.timestamp, 4))
            cf = self.evaluate_frame(rf, tf)
            conf_frames.append(cf)

        # Lap-level summaries
        laps_dict: Dict[int, List[ConfounderFrame]] = defaultdict(list)
        for cf in conf_frames:
            laps_dict[cf.lap].append(cf)

        lap_summaries: List[LapConfounderSummary] = []
        for lap_num in sorted(laps_dict.keys()):
            frames_in_lap = laps_dict[lap_num]
            sample_count = len(frames_in_lap)
            valid_samples = sum(1 for f in frames_in_lap if f.raw_residual is not None)
            affected_count = sum(1 for f in frames_in_lap if len(f.active_flags) > 0)

            drs_c = sum(1 for f in frames_in_lap if f.confounders.drs.active)
            brk_c = sum(1 for f in frames_in_lap if f.confounders.braking.active)
            trn_c = sum(1 for f in frames_in_lap if f.confounders.transient.active)
            spd_c = sum(1 for f in frames_in_lap if f.confounders.high_speed.active)
            pql_c = sum(1 for f in frames_in_lap if f.confounders.data_quality.active)

            strong_c = sum(1 for f in frames_in_lap if f.interpretation == ConfounderInterpretation.STRONG_TYRE_EVIDENCE)
            mod_c = sum(1 for f in frames_in_lap if f.interpretation == ConfounderInterpretation.MODERATE_TYRE_EVIDENCE)
            low_c = sum(1 for f in frames_in_lap if f.interpretation == ConfounderInterpretation.LOW_TYRE_EVIDENCE)
            non_tyre_c = sum(1 for f in frames_in_lap if f.interpretation == ConfounderInterpretation.NON_TYRE_EXPLANATION_DOMINANT)
            insuf_c = sum(1 for f in frames_in_lap if f.interpretation == ConfounderInterpretation.INSUFFICIENT_DATA)

            mean_non_tyre = float(np.mean([f.non_tyre_explanation_score for f in frames_in_lap]))
            mean_tyre_ev = float(np.mean([f.tyre_evidence_quality for f in frames_in_lap]))

            ref_res = residual_frames[0]
            age_band, _ = classify_tyre_age(ref_res.tyre_age)

            lap_summary = LapConfounderSummary(
                lap=lap_num,
                sample_count=sample_count,
                valid_sample_count=valid_samples,
                confounder_affected_count=affected_count,
                drs_count=drs_c,
                braking_count=brk_c,
                transient_count=trn_c,
                high_speed_count=spd_c,
                poor_quality_count=pql_c,
                strong_evidence_count=strong_c,
                moderate_evidence_count=mod_c,
                low_evidence_count=low_c,
                non_tyre_dominant_count=non_tyre_c,
                insufficient_data_count=insuf_c,
                mean_non_tyre_score=round(mean_non_tyre, 3),
                mean_tyre_evidence_quality=round(mean_tyre_ev, 3),
                tyre_age_band=age_band,
                compound=ref_res.compound,
                stint=ref_res.stint,
            )
            lap_summaries.append(lap_summary)

        # Session-level report
        total_frames = len(conf_frames)
        valid_frames = sum(1 for f in conf_frames if f.raw_residual is not None)
        frames_with_conf = sum(1 for f in conf_frames if len(f.active_flags) > 0)

        session_drs = sum(1 for f in conf_frames if f.confounders.drs.active)
        session_brk = sum(1 for f in conf_frames if f.confounders.braking.active)
        session_trn = sum(1 for f in conf_frames if f.confounders.transient.active)
        session_spd = sum(1 for f in conf_frames if f.confounders.high_speed.active)
        session_pql = sum(1 for f in conf_frames if f.confounders.data_quality.active)

        session_strong = sum(1 for f in conf_frames if f.interpretation == ConfounderInterpretation.STRONG_TYRE_EVIDENCE)
        session_mod = sum(1 for f in conf_frames if f.interpretation == ConfounderInterpretation.MODERATE_TYRE_EVIDENCE)
        session_low = sum(1 for f in conf_frames if f.interpretation == ConfounderInterpretation.LOW_TYRE_EVIDENCE)
        session_nontyre = sum(1 for f in conf_frames if f.interpretation == ConfounderInterpretation.NON_TYRE_EXPLANATION_DOMINANT)
        session_insuf = sum(1 for f in conf_frames if f.interpretation == ConfounderInterpretation.INSUFFICIENT_DATA)

        avg_non_tyre = float(np.mean([f.non_tyre_explanation_score for f in conf_frames])) if conf_frames else 0.0
        avg_tyre_ev = float(np.mean([f.tyre_evidence_quality for f in conf_frames])) if conf_frames else 0.0

        sess_id = residual_frames[0].session_id if residual_frames else "UNKNOWN_SESSION"

        scientific_boundaries = {
            "residual_claim": "Residual is NOT automatically tyre degradation; it is an unexplained difference between actual and expected vehicle dynamics.",
            "confounder_claim": "non_tyre_explanation_score is NOT a probability or causal model; it is a deterministic physical plausibility metric.",
            "evidence_claim": "tyre_evidence_quality is NOT tyre health or physical wear; it is an analytical weighting of sample suitability.",
            "tyre_age_claim": "TyreLife represents lap age count, NOT physical tread depth in millimeters.",
            "causality_claim": "No causal wear claim is made in this phase without downstream persistence and TDI analysis.",
        }

        report = SessionConfounderReport(
            session_id=sess_id,
            total_frames=total_frames,
            valid_frames=valid_frames,
            frames_with_confounders=frames_with_conf,
            drs_affected_frames=session_drs,
            braking_affected_frames=session_brk,
            transient_affected_frames=session_trn,
            high_speed_affected_frames=session_spd,
            poor_quality_frames=session_pql,
            strong_tyre_evidence_frames=session_strong,
            moderate_tyre_evidence_frames=session_mod,
            low_tyre_evidence_frames=session_low,
            non_tyre_dominant_frames=session_nontyre,
            insufficient_data_frames=session_insuf,
            average_non_tyre_explanation_score=round(avg_non_tyre, 3),
            average_tyre_evidence_quality=round(avg_tyre_ev, 3),
            lap_summaries=lap_summaries,
            scientific_boundaries=scientific_boundaries,
        )

        return conf_frames, report
