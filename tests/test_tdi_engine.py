"""
TYRETRACE — Phase 6 TDI Engine Unit Tests
Tests deterministic scoring, component weighting, trajectory trends, confidence,
explainability generation, lap and session aggregation across 20 deterministic scenarios.
"""

import pytest
from backend.confounders.schemas import (
    ConfounderDetail,
    ConfounderEvaluation,
    ConfounderFrame,
    ConfounderInterpretation,
    ExplanatoryClassification,
)
from backend.residual.schemas import ResidualTrend, RollingWindowFeatures
from backend.tdi.schemas import TDIFrame, TDIState, TDITrend
from backend.tdi.scoring import (
    calculate_confounder_penalty,
    calculate_degradation_trend_score,
    calculate_evidence_quality_score,
    calculate_persistence_score,
    calculate_residual_severity,
    calculate_tdi_confidence,
    calculate_tyre_age_score,
    classify_tdi_state,
    compute_tdi_components,
    generate_tdi_explanations,
)
from backend.tdi.tdi_engine import TDIEngine
from backend.tdi.trajectory import TDITrajectoryTracker


def _create_mock_confounder_frame(
    timestamp: float = 100.0,
    lap: int = 1,
    raw_residual: float = 0.0,
    normalized_residual: float = 0.0,
    tyre_evidence_quality: float = 0.5,
    non_tyre_explanation_score: float = 0.2,
    active_flags: list = None,
) -> ConfounderFrame:
    """Helper to generate a mock ConfounderFrame with isolated properties."""
    dummy_detail = ConfounderDetail(
        name="dummy",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="None",
    )
    eval_obj = ConfounderEvaluation(
        drs=dummy_detail,
        braking=dummy_detail,
        throttle=dummy_detail,
        high_speed=dummy_detail,
        transient=dummy_detail,
        tyre_age=dummy_detail,
        compound=dummy_detail,
        environment=dummy_detail,
        rainfall=dummy_detail,
        data_quality=dummy_detail,
    )
    return ConfounderFrame(
        timestamp=timestamp,
        lap=lap,
        distance_m=100.0,
        raw_residual=raw_residual,
        normalized_residual=normalized_residual,
        actual_speed_mps=50.0,
        confounders=eval_obj,
        active_flags=active_flags or [],
        non_tyre_explanation_score=non_tyre_explanation_score,
        tyre_evidence_quality=tyre_evidence_quality,
        adjusted_residual=raw_residual * tyre_evidence_quality,
        interpretation=ConfounderInterpretation.MODERATE_TYRE_EVIDENCE,
        confidence=0.8,
    )


# 1. Zero residual test
def test_zero_residual():
    sev = calculate_residual_severity(raw_residual=0.0, normalized_residual=0.0)
    assert sev == 0.0
    tdi, comp = compute_tdi_components(
        raw_residual=0.0,
        normalized_residual=0.0,
        persistence_ratio=0.0,
        trend_slope=0.0,
        trend_consistency=1.0,
        trend_samples=10,
        tyre_age_laps=0,
        tyre_evidence_quality=0.5,
        non_tyre_explanation_score=0.0,
    )
    # With 0 residual, 0 persistence, 0 trend, 0 age, only evidence quality (0.15 * 0.5 = 0.075) remains
    assert comp.residual_severity == 0.0
    assert tdi < 10.0


# 2. Low residual test
def test_low_residual():
    sev_low = calculate_residual_severity(raw_residual=0.3, threshold=3.0)
    sev_high = calculate_residual_severity(raw_residual=2.5, threshold=3.0)
    assert sev_low == 0.1
    assert sev_low < sev_high


# 3. Persistent residual test
def test_persistent_residual():
    p_zero = calculate_persistence_score(0.0)
    p_mid = calculate_persistence_score(0.5)
    p_full = calculate_persistence_score(1.0)
    assert p_zero == 0.0
    assert p_mid == 0.5
    assert p_full == 1.0

    _, comp_p0 = compute_tdi_components(
        raw_residual=1.5,
        normalized_residual=1.5,
        persistence_ratio=0.0,
        trend_slope=0.0,
        trend_consistency=0.0,
        trend_samples=0,
        tyre_age_laps=5,
        tyre_evidence_quality=0.7,
        non_tyre_explanation_score=0.1,
    )
    _, comp_p1 = compute_tdi_components(
        raw_residual=1.5,
        normalized_residual=1.5,
        persistence_ratio=1.0,
        trend_slope=0.0,
        trend_consistency=0.0,
        trend_samples=0,
        tyre_age_laps=5,
        tyre_evidence_quality=0.7,
        non_tyre_explanation_score=0.1,
    )
    assert comp_p1.raw_evidence_score > comp_p0.raw_evidence_score


# 4. Increasing residual trend test
def test_increasing_residual():
    trend_score_pos = calculate_degradation_trend_score(
        slope=0.5, consistency=1.0, sample_count=10, min_samples=5
    )
    assert trend_score_pos > 0.5


# 5. Decreasing residual trend test
def test_decreasing_residual():
    trend_score_neg = calculate_degradation_trend_score(
        slope=-0.3, consistency=1.0, sample_count=10, min_samples=5
    )
    assert trend_score_neg == 0.0


# 6. High confounder score test
def test_high_confounder_score():
    penalty_high = calculate_confounder_penalty(0.9)
    penalty_low = calculate_confounder_penalty(0.1)
    assert penalty_high == 0.9
    assert penalty_low == 0.1

    tdi_high_conf, comp_high = compute_tdi_components(
        raw_residual=2.0,
        normalized_residual=2.0,
        persistence_ratio=0.8,
        trend_slope=0.2,
        trend_consistency=0.8,
        trend_samples=10,
        tyre_age_laps=15,
        tyre_evidence_quality=0.8,
        non_tyre_explanation_score=0.9,
    )
    tdi_low_conf, comp_low = compute_tdi_components(
        raw_residual=2.0,
        normalized_residual=2.0,
        persistence_ratio=0.8,
        trend_slope=0.2,
        trend_consistency=0.8,
        trend_samples=10,
        tyre_age_laps=15,
        tyre_evidence_quality=0.8,
        non_tyre_explanation_score=0.1,
    )
    assert tdi_high_conf < tdi_low_conf


# 7. Low confounder score test
def test_low_confounder_score():
    # Low confounder must preserve degradation evidence
    _, comp = compute_tdi_components(
        raw_residual=2.0,
        normalized_residual=2.0,
        persistence_ratio=0.5,
        trend_slope=0.1,
        trend_consistency=1.0,
        trend_samples=10,
        tyre_age_laps=10,
        tyre_evidence_quality=0.8,
        non_tyre_explanation_score=0.0,
    )
    assert comp.qualified_score == comp.raw_evidence_score


# 8. New tyre test
def test_new_tyre():
    age_new = calculate_tyre_age_score(2)
    assert age_new == 0.0


# 9. Old tyre test
def test_old_tyre():
    age_early = calculate_tyre_age_score(6)
    age_mid = calculate_tyre_age_score(15)
    age_late = calculate_tyre_age_score(25)
    assert age_early == 0.2
    assert age_mid == 0.5
    assert age_late == 0.8


# 10. Missing tyre age test
def test_missing_tyre_age():
    age_none = calculate_tyre_age_score(None)
    assert age_none == 0.0


# 11. Poor evidence quality test
def test_poor_evidence_quality():
    q_poor = calculate_evidence_quality_score(0.1)
    q_high = calculate_evidence_quality_score(0.9)
    assert q_poor == 0.1
    assert q_poor < q_high

    tdi_poor, comp_poor = compute_tdi_components(
        raw_residual=2.0,
        normalized_residual=2.0,
        persistence_ratio=0.5,
        trend_slope=0.0,
        trend_consistency=0.0,
        trend_samples=5,
        tyre_age_laps=10,
        tyre_evidence_quality=0.1,
        non_tyre_explanation_score=0.2,
    )
    tdi_good, comp_good = compute_tdi_components(
        raw_residual=2.0,
        normalized_residual=2.0,
        persistence_ratio=0.5,
        trend_slope=0.0,
        trend_consistency=0.0,
        trend_samples=5,
        tyre_age_laps=10,
        tyre_evidence_quality=0.9,
        non_tyre_explanation_score=0.2,
    )
    assert tdi_poor < tdi_good


# 12. High evidence quality test
def test_high_evidence_quality():
    # High evidence quality boosts raw evidence score without asserting wear on fresh tyres
    tdi, comp = compute_tdi_components(
        raw_residual=0.0,
        normalized_residual=0.0,
        persistence_ratio=0.0,
        trend_slope=0.0,
        trend_consistency=0.0,
        trend_samples=5,
        tyre_age_laps=1,
        tyre_evidence_quality=1.0,
        non_tyre_explanation_score=0.0,
    )
    assert comp.evidence_quality == 1.0
    assert tdi <= 20.0  # Still in healthy/low evidence band


# 13. TDI clamping test
def test_tdi_clamping():
    # Test extreme positive values clamp to 100.0
    tdi_max, _ = compute_tdi_components(
        raw_residual=100.0,
        normalized_residual=100.0,
        persistence_ratio=1.0,
        trend_slope=5.0,
        trend_consistency=1.0,
        trend_samples=20,
        tyre_age_laps=50,
        tyre_evidence_quality=1.0,
        non_tyre_explanation_score=0.0,
    )
    assert tdi_max <= 100.0
    assert tdi_max == 100.0

    # Negative residual magnitudes are absolute, clamp lower bound at 0.0
    tdi_min, _ = compute_tdi_components(
        raw_residual=0.0,
        normalized_residual=0.0,
        persistence_ratio=0.0,
        trend_slope=-10.0,
        trend_consistency=0.0,
        trend_samples=0,
        tyre_age_laps=0,
        tyre_evidence_quality=0.0,
        non_tyre_explanation_score=1.0,
    )
    assert tdi_min >= 0.0
    assert tdi_min == 0.0


# 14. Confidence calculation test
def test_confidence_calculation():
    # Perfect evidence, no confounding, sufficient samples, known tyre age
    conf_high = calculate_tdi_confidence(
        tyre_evidence_quality=1.0,
        non_tyre_explanation_score=0.0,
        tyre_age_laps=10,
        sample_count=20,
        min_required_samples=10,
    )
    assert conf_high == 1.0

    # Low evidence quality and heavy confounding
    conf_low = calculate_tdi_confidence(
        tyre_evidence_quality=0.2,
        non_tyre_explanation_score=0.8,
        tyre_age_laps=None,
        sample_count=2,
        min_required_samples=10,
    )
    assert conf_low < 0.2
    assert conf_low >= 0.0


# 15. Trend calculation test
def test_trend_calculation():
    tracker = TDITrajectoryTracker(window_size=10, min_samples=4)
    # Feed rising values
    for i in range(6):
        _, trend = tracker.add_observation(timestamp=i * 1.0, tdi=10.0 + i * 4.0)
    assert trend == TDITrend.RISING

    # Feed a spike
    _, spike_trend = tracker.add_observation(timestamp=7.0, tdi=80.0)
    assert spike_trend == TDITrend.SPIKE


# 16. Deterministic repeatability test
def test_deterministic_repeatability():
    engine1 = TDIEngine()
    engine2 = TDIEngine()
    frame = _create_mock_confounder_frame(
        timestamp=10.0,
        lap=1,
        raw_residual=1.5,
        tyre_evidence_quality=0.6,
        non_tyre_explanation_score=0.3,
    )
    res1 = engine1.evaluate_frame(frame, tyre_age_laps=5)
    res2 = engine2.evaluate_frame(frame, tyre_age_laps=5)

    assert res1.tdi == res2.tdi
    assert res1.confidence == res2.confidence
    assert res1.state == res2.state
    assert res1.trend == res2.trend
    assert res1.components.model_dump() == res2.components.model_dump()


# 17. Insufficient data handling test
def test_insufficient_data_handling():
    tracker = TDITrajectoryTracker(min_samples=5)
    # Less than min_samples returns UNKNOWN trend
    _, trend = tracker.add_observation(1.0, 15.0)
    assert trend == TDITrend.UNKNOWN

    trend_score = calculate_degradation_trend_score(slope=0.5, sample_count=2, min_samples=5)
    assert trend_score == 0.0


# 18. Explanation generation test
def test_explanation_generation():
    _, components = compute_tdi_components(
        raw_residual=2.5,
        normalized_residual=2.5,
        persistence_ratio=0.8,
        trend_slope=0.4,
        trend_consistency=1.0,
        trend_samples=10,
        tyre_age_laps=25,
        tyre_evidence_quality=0.85,
        non_tyre_explanation_score=0.5,
    )
    evidence, counter_evidence = generate_tdi_explanations(
        components=components,
        raw_residual=2.5,
        tyre_age_laps=25,
        flagged_confounders=["DRS_ACTIVE", "HIGH_SPEED_AERO"],
    )
    assert any("acceleration discrepancy" in e for e in evidence)
    assert any("persists across" in e for e in evidence)
    assert any("25 laps" in e for e in evidence)
    assert any("DRS_ACTIVE" in c for c in counter_evidence)
    assert any("HIGH_SPEED_AERO" in c for c in counter_evidence)


# 19. Session aggregation test
def test_session_aggregation():
    engine = TDIEngine()
    frames = [
        _create_mock_confounder_frame(timestamp=1.0 * i, lap=1, raw_residual=0.5)
        for i in range(10)
    ]
    tdi_frames, report = engine.process_session(frames, tyre_age_laps=5, session_id="TEST_SESS")
    assert report.session_id == "TEST_SESS"
    assert report.total_frames == 10
    assert report.total_laps == 1
    assert report.average_tdi >= 0.0
    assert "inferred_index_only" in report.scientific_limitations


# 20. Lap aggregation test
def test_lap_aggregation():
    engine = TDIEngine()
    frames_lap1 = [
        _create_mock_confounder_frame(timestamp=1.0 * i, lap=1, raw_residual=0.5)
        for i in range(5)
    ]
    frames_lap2 = [
        _create_mock_confounder_frame(timestamp=10.0 + 1.0 * i, lap=2, raw_residual=1.5)
        for i in range(5)
    ]
    all_frames = frames_lap1 + frames_lap2
    tdi_frames, report = engine.process_session(all_frames, tyre_age_laps=10)
    assert len(report.lap_summaries) == 2
    assert report.lap_summaries[0].lap == 1
    assert report.lap_summaries[1].lap == 2
    assert report.lap_summaries[0].sample_count == 5
    assert report.lap_summaries[1].sample_count == 5
