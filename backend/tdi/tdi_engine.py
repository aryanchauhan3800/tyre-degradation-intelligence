"""
TYRETRACE — Tyre Degradation Index (TDI) Engine
Deterministic, physics-informed TDI evaluation engine.

ARCHITECTURAL CONTRACT:
1. RAW RESIDUAL = physical model discrepancy (Phase 4).
2. TYRE EVIDENCE QUALITY = suitability of observation for degradation inference (Phase 5).
3. TDI = inferred degradation severity index in [0, 100] (Phase 6).
These three variables are strictly kept separate and never collapsed into one.
"""

from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from backend.confounders.schemas import ConfounderFrame
from backend.residual.schemas import RollingWindowFeatures
from backend.tdi.schemas import (
    TDIComponentScores,
    TDIFrame,
    TDILapSummary,
    TDISessionReport,
    TDIState,
    TDITrend,
)
from backend.tdi.scoring import (
    calculate_tdi_confidence,
    classify_tdi_state,
    compute_tdi_components,
    generate_tdi_explanations,
)
from backend.tdi.trajectory import TDITrajectoryTracker


class TDIEngine:
    """
    Deterministic Tyre Degradation Index (TDI) Engine.
    Processes ConfounderFrame inputs and optional rolling window features to calculate
    an explainable degradation severity index, trajectory trend, and confidence.
    """

    def __init__(self, trajectory_window: int = 15, min_samples: int = 5):
        self.trajectory_window = trajectory_window
        self.min_samples = min_samples
        self.tracker = TDITrajectoryTracker(window_size=trajectory_window, min_samples=min_samples)
        self._history: List[TDIFrame] = []

    def reset(self) -> None:
        """Resets engine state and trajectory tracking buffers."""
        self.tracker.reset()
        self._history.clear()

    def evaluate_frame(
        self,
        confounder_frame: ConfounderFrame,
        window_features: Optional[RollingWindowFeatures] = None,
        tyre_age_laps: Optional[int] = None,
        compound: Optional[str] = None,
        stint: Optional[int] = None,
    ) -> TDIFrame:
        """
        Evaluates a single frame to compute deterministic TDI, trajectory trend,
        confidence, and dynamic explainability lists.
        """
        raw_res = confounder_frame.raw_residual
        norm_res = confounder_frame.normalized_residual
        ev_qual = confounder_frame.tyre_evidence_quality
        non_tyre = confounder_frame.non_tyre_explanation_score

        # Extract persistence and trend features from Phase 4 rolling window if available
        persistence_ratio = None
        trend_slope = None
        trend_consistency = None
        trend_samples = 0

        if window_features is not None:
            persistence_ratio = window_features.persistence_ratio
            trend_slope = window_features.residual_slope
            trend_samples = window_features.valid_sample_count
            # Approximate consistency from std/mean if available
            if window_features.residual_std is not None and window_features.residual_std > 0:
                trend_consistency = max(0.0, 1.0 - (window_features.residual_std / 3.0))

        # Synthesize normalized components and raw TDI
        raw_tdi, components = compute_tdi_components(
            raw_residual=raw_res,
            normalized_residual=norm_res,
            persistence_ratio=persistence_ratio,
            trend_slope=trend_slope,
            trend_consistency=trend_consistency,
            trend_samples=trend_samples,
            tyre_age_laps=tyre_age_laps,
            tyre_evidence_quality=ev_qual,
            non_tyre_explanation_score=non_tyre,
        )

        # Smooth TDI and determine temporal trajectory trend
        smoothed_tdi, trend = self.tracker.add_observation(
            confounder_frame.timestamp, raw_tdi
        )

        # In case of isolated spike, robust smoothed_tdi protects against false-positive escalation
        final_tdi = smoothed_tdi
        state = classify_tdi_state(final_tdi)

        # Calculate inference confidence
        sample_count = len(self.tracker.history)
        confidence = calculate_tdi_confidence(
            tyre_evidence_quality=ev_qual,
            non_tyre_explanation_score=non_tyre,
            tyre_age_laps=tyre_age_laps,
            sample_count=sample_count,
            min_required_samples=self.min_samples,
        )

        # Generate dynamic feature-derived explanations
        evidence, counter_evidence = generate_tdi_explanations(
            components=components,
            raw_residual=raw_res,
            tyre_age_laps=tyre_age_laps,
            flagged_confounders=confounder_frame.active_flags,
        )

        # Performance impact is strictly UNKNOWN / None without dedicated physical calibration
        perf_impact = None

        frame = TDIFrame(
            timestamp=confounder_frame.timestamp,
            lap=confounder_frame.lap,
            distance_m=confounder_frame.distance_m,
            tdi=final_tdi,
            state=state,
            confidence=confidence,
            trend=trend,
            components=components,
            raw_residual=raw_res,
            tyre_evidence_quality=ev_qual,
            non_tyre_explanation_score=non_tyre,
            tyre_age_laps=tyre_age_laps,
            compound=compound,
            stint=stint,
            performance_impact_score=perf_impact,
            evidence=evidence,
            counter_evidence=counter_evidence,
            provenance="INFERRED / MODELLED",
        )

        self._history.append(frame)
        return frame

    def summarize_lap(self, lap_frames: List[TDIFrame]) -> TDILapSummary:
        """
        Aggregates frame-level TDI assessments into a structured TDILapSummary.
        """
        if not lap_frames:
            raise ValueError("Cannot summarize an empty list of lap frames.")

        lap_idx = lap_frames[0].lap
        total_samples = len(lap_frames)
        valid_samples = [f for f in lap_frames if f.raw_residual is not None]
        valid_count = len(valid_samples)

        tdi_values = [f.tdi for f in lap_frames]
        mean_tdi = float(np.mean(tdi_values))
        min_tdi = float(np.min(tdi_values))
        max_tdi = float(np.max(tdi_values))
        final_tdi = float(lap_frames[-1].tdi)

        conf_values = [f.confidence for f in lap_frames]
        mean_conf = float(np.mean(conf_values))

        # Dominant state across the lap
        state_counts = Counter(f.state for f in lap_frames)
        dominant_state = state_counts.most_common(1)[0][0]

        # Lap-level trend
        lap_trend = lap_frames[-1].trend

        # Context
        tyre_age = lap_frames[-1].tyre_age_laps
        compound = lap_frames[-1].compound
        stint = lap_frames[-1].stint

        # Lap evidence summary
        evidence_summary = []
        if mean_tdi <= 20.0:
            evidence_summary.append("Lap demonstrated low degradation evidence; tyre operating near baseline")
        elif mean_tdi <= 40.0:
            evidence_summary.append("Lap showed early emerging performance discrepancies")
        else:
            evidence_summary.append(f"Lap exhibited elevated degradation metrics (mean TDI {mean_tdi:.1f})")

        return TDILapSummary(
            lap=lap_idx,
            sample_count=total_samples,
            valid_sample_count=valid_count,
            mean_tdi=round(mean_tdi, 2),
            min_tdi=round(min_tdi, 2),
            max_tdi=round(max_tdi, 2),
            final_tdi=round(final_tdi, 2),
            trend=lap_trend,
            dominant_state=dominant_state,
            confidence=round(mean_conf, 3),
            tyre_age_laps=tyre_age,
            compound=compound,
            stint=stint,
            evidence_summary=evidence_summary,
        )

    def generate_session_report(
        self, frames: List[TDIFrame], session_id: str = "REPLAY_SESSION"
    ) -> TDISessionReport:
        """
        Synthesizes all session frames and lap summaries into a comprehensive TDISessionReport.
        """
        if not frames:
            raise ValueError("Cannot generate session report from empty frame list.")

        total_frames = len(frames)
        valid_frames = len([f for f in frames if f.raw_residual is not None])

        tdi_values = [f.tdi for f in frames]
        avg_tdi = float(np.mean(tdi_values))
        max_tdi = float(np.max(tdi_values))
        min_tdi = float(np.min(tdi_values))
        final_tdi = float(frames[-1].tdi)

        conf_values = [f.confidence for f in frames]
        overall_conf = float(np.mean(conf_values))

        # Overall degradation state
        state_counts = Counter(f.state for f in frames)
        overall_state = state_counts.most_common(1)[0][0]

        # Group by lap
        lap_groups: Dict[int, List[TDIFrame]] = defaultdict(list)
        for f in frames:
            lap_groups[f.lap].append(f)

        lap_summaries: List[TDILapSummary] = []
        for lap_idx in sorted(lap_groups.keys()):
            lap_summaries.append(self.summarize_lap(lap_groups[lap_idx]))

        # Overall session trend from lap progression
        if len(lap_summaries) >= 2:
            first_lap_tdi = lap_summaries[0].mean_tdi
            last_lap_tdi = lap_summaries[-1].mean_tdi
            delta = last_lap_tdi - first_lap_tdi
            if delta > 3.0:
                session_trend = TDITrend.RISING
            elif delta < -3.0:
                session_trend = TDITrend.FALLING
            else:
                session_trend = TDITrend.STABLE
        else:
            session_trend = frames[-1].trend

        # Tyre age range
        ages = [f.tyre_age_laps for f in frames if f.tyre_age_laps is not None]
        tyre_age_range: Tuple[Optional[int], Optional[int]] = (
            (min(ages), max(ages)) if ages else (None, None)
        )

        avg_ev = float(np.mean([f.tyre_evidence_quality for f in frames]))
        avg_non_tyre = float(np.mean([f.non_tyre_explanation_score for f in frames]))

        limitations = {
            "inferred_index_only": "TDI is an inferred degradation severity index, not physical tread depth in mm or rubber loss.",
            "not_a_probability": "TDI is not a failure probability or guaranteed failure prediction.",
            "uncalibrated_weights": "Component weights are engineering assumptions (MODEL PARAMETER — DEMO ASSUMPTION).",
            "telemetry_limitations": "FastF1 does not provide tyre temperature, tyre pressure, wheel speeds, slip angles, or corner-specific loads.",
            "qualifying_limitation": "Single-lap qualifying telemetry contains no multi-lap tyre-age progression; confidence remains constrained.",
            "confounding_overlap": "Longitudinal residuals contain aerodynamic model mismatch and non-tyre transient dynamics.",
        }

        return TDISessionReport(
            session_id=session_id,
            total_frames=total_frames,
            valid_frames=valid_frames,
            total_laps=len(lap_groups),
            average_tdi=round(avg_tdi, 2),
            maximum_tdi=round(max_tdi, 2),
            minimum_tdi=round(min_tdi, 2),
            final_tdi=round(final_tdi, 2),
            session_tdi_trend=session_trend,
            overall_confidence=round(overall_conf, 3),
            degradation_state=overall_state,
            tyre_age_range=tyre_age_range,
            average_evidence_quality=round(avg_ev, 4),
            average_non_tyre_score=round(avg_non_tyre, 4),
            lap_summaries=lap_summaries,
            scientific_limitations=limitations,
        )

    def process_session(
        self,
        confounder_frames: List[ConfounderFrame],
        features_list: Optional[List[RollingWindowFeatures]] = None,
        tyre_age_laps: Optional[int] = None,
        compound: Optional[str] = None,
        stint: Optional[int] = None,
        session_id: str = "REPLAY_SESSION",
    ) -> Tuple[List[TDIFrame], TDISessionReport]:
        """
        Executes end-to-end processing of a sequence of ConfounderFrames into TDIFrames
        and generates the overarching TDISessionReport.
        """
        self.reset()
        output_frames: List[TDIFrame] = []

        for i, cf in enumerate(confounder_frames):
            wf = features_list[i] if (features_list and i < len(features_list)) else None
            frame = self.evaluate_frame(
                confounder_frame=cf,
                window_features=wf,
                tyre_age_laps=tyre_age_laps,
                compound=compound,
                stint=stint,
            )
            output_frames.append(frame)

        report = self.generate_session_report(output_frames, session_id=session_id)
        return output_frames, report
