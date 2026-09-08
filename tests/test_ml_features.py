"""
TYRETRACE — ML Temporal Feature Tests
Tests temporal window construction, boundary enforcement, compound encoding, and anti-leakage.
"""

import pytest
import numpy as np
from backend.confounders.schemas import (
    ConfounderDetail,
    ConfounderEvaluation,
    ConfounderFrame,
    ConfounderInterpretation,
    ExplanatoryClassification,
)
from backend.ml.features import (
    COMPOUND_ENCODING,
    build_temporal_windows,
    extract_window_features,
)
from backend.residual.schemas import ResidualFrame, ResidualQualityStatus
from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)
from backend.tdi.schemas import TDIComponentScores, TDIFrame, TDIState, TDITrend


def _make_dummy_frame_set(
    n: int,
    stint: int = 1,
    compound: str = "MEDIUM",
    driver: str = "VER",
    start_time: float = 100.0,
):
    dummy_detail = ConfounderDetail(
        name="dummy",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="None",
    )
    conf_eval = ConfounderEvaluation(
        drs=dummy_detail, braking=dummy_detail, throttle=dummy_detail,
        high_speed=dummy_detail, transient=dummy_detail, tyre_age=dummy_detail,
        compound=dummy_detail, environment=dummy_detail, rainfall=dummy_detail,
        data_quality=dummy_detail,
    )
    comp_scores = TDIComponentScores(
        residual_severity=0.1, persistence=0.0, degradation_trend=0.0,
        tyre_age=0.2, evidence_quality=0.8, confounder_penalty=0.1,
        raw_evidence_score=0.2, qualified_score=0.18,
    )

    tels, reses, confs, tdis = [], [], [], []
    for i in range(n):
        t = start_time + i * 0.2
        tyre = TyreState(corner=WheelCorner.FL, compound=compound, tyre_life_laps=5 + i // 5, stint=stint)
        tyres = FourWheelTyreStates(
            fl=tyre,
            fr=TyreState(corner=WheelCorner.FR, compound=compound, tyre_life_laps=5 + i // 5, stint=stint),
            rl=TyreState(corner=WheelCorner.RL, compound=compound, tyre_life_laps=5 + i // 5, stint=stint),
            rr=TyreState(corner=WheelCorner.RR, compound=compound, tyre_life_laps=5 + i // 5, stint=stint),
        )
        tel = TelemetryFrame(
            timestamp=t,
            session_id="SESS_TEST",
            lap=1,
            driver=driver,
            vehicle=VehicleState(speed_mps=60.0, speed_kph=216.0, throttle_pct=90.0, brake_pct=0.0, gear=6),
            tyres=tyres,
            environment=EnvironmentState(ambient_temp_c=25.0, track_temp_c=35.0, humidity_pct=50.0),
        )
        res = ResidualFrame(
            timestamp=t, session_id="SESS_TEST", lap=1, actual_speed_mps=60.0,
            actual_acceleration_mps2=1.5, expected_acceleration_mps2=1.2,
            acceleration_residual_mps2=0.3, quality_status=ResidualQualityStatus.VALID,
        )
        conf = ConfounderFrame(
            timestamp=t, lap=1, raw_residual=0.3, actual_speed_mps=60.0,
            confounders=conf_eval, non_tyre_explanation_score=0.1,
            tyre_evidence_quality=0.85, interpretation=ConfounderInterpretation.STRONG_TYRE_EVIDENCE,
            confidence=0.8,
        )
        tdi = TDIFrame(
            timestamp=t, lap=1, tdi=18.0, state=TDIState.HEALTHY_LOW_EVIDENCE,
            confidence=0.8, trend=TDITrend.STABLE, components=comp_scores,
            raw_residual=0.3, tyre_evidence_quality=0.85, non_tyre_explanation_score=0.1,
        )
        tels.append(tel)
        reses.append(res)
        confs.append(conf)
        tdis.append(tdi)

    return tels, reses, confs, tdis


def test_temporal_window_construction():
    tels, reses, confs, tdis = _make_dummy_frame_set(25)
    windows = build_temporal_windows(tels, reses, confs, tdis, window_size=10, stride=5)

    assert len(windows) > 0
    first_w = windows[0]
    assert first_w.timestamp_start < first_w.timestamp_end
    assert first_w.features["mean_speed"] == 60.0
    assert first_w.features["tyre_life"] >= 5


def test_window_boundary_handling():
    # Construct sequence where frames 0..14 are Stint 1 and frames 15..29 are Stint 2
    tels1, reses1, confs1, tdis1 = _make_dummy_frame_set(15, stint=1, compound="MEDIUM")
    tels2, reses2, confs2, tdis2 = _make_dummy_frame_set(15, stint=2, compound="HARD", start_time=200.0)

    tels = tels1 + tels2
    reses = reses1 + reses2
    confs = confs1 + confs2
    tdis = tdis1 + tdis2

    windows = build_temporal_windows(tels, reses, confs, tdis, window_size=10, stride=2)

    # Verify that NO window contains frames from both Stint 1 and Stint 2
    for w in windows:
        # Each window must strictly belong to either stint 1 or stint 2
        assert w.stint_number in (1, 2)
        if w.stint_number == 1:
            assert w.compound == "MEDIUM"
        elif w.stint_number == 2:
            assert w.compound == "HARD"


def test_stint_separation():
    tels1, reses1, confs1, tdis1 = _make_dummy_frame_set(15, stint=1)
    tels2, reses2, confs2, tdis2 = _make_dummy_frame_set(15, stint=2, start_time=200.0)
    windows1 = build_temporal_windows(tels1, reses1, confs1, tdis1, window_size=10, stride=5)
    windows2 = build_temporal_windows(tels2, reses2, confs2, tdis2, window_size=10, stride=5)

    assert all(w.group_id.endswith("STINT1") for w in windows1)
    assert all(w.group_id.endswith("STINT2") for w in windows2)


def test_tyre_compound_handling():
    assert COMPOUND_ENCODING["SOFT"] == 0
    assert COMPOUND_ENCODING["MEDIUM"] == 1
    assert COMPOUND_ENCODING["HARD"] == 2
    assert COMPOUND_ENCODING["UNKNOWN"] == -1

    tels, reses, confs, tdis = _make_dummy_frame_set(12, compound="HARD")
    windows = build_temporal_windows(tels, reses, confs, tdis, window_size=10, stride=2)
    assert windows[0].compound == "HARD"
    assert windows[0].compound_code == 2


def test_feature_calculation():
    tels, reses, confs, tdis = _make_dummy_frame_set(10)
    w_vec = extract_window_features(tels, reses, confs, tdis, window_id="W_TEST")

    feats = w_vec.features
    assert "mean_speed" in feats
    assert "speed_std" in feats
    assert "residual_mean" in feats
    assert "residual_persistence" in feats
    assert "non_tyre_explanation_score" in feats
    assert "baseline_tdi" in feats
    assert feats["residual_mean"] == pytest.approx(0.3, abs=1e-3)


def test_no_future_leakage():
    # Modify residual values for future frames [10..14]
    tels, reses, confs, tdis = _make_dummy_frame_set(15)
    for i in range(10, 15):
        reses[i].acceleration_residual_mps2 = 9.99

    # Window from 0..10
    w_vec = extract_window_features(tels[:10], reses[:10], confs[:10], tdis[:10], window_id="W_LEAK")
    # Residual mean in window [0..10] must NOT be affected by frames [10..14]
    assert w_vec.features["residual_mean"] == pytest.approx(0.3, abs=1e-3)
    assert w_vec.features["residual_max"] < 1.0
