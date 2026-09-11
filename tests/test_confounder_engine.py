import math
import pytest

from backend.confounders.confounder_engine import ConfounderEngine
from backend.confounders.rules import (
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
    ConfounderInterpretation,
    ExplanatoryClassification,
    TyreAgeBand,
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


def create_sample_residual_frame(
    raw_residual: float = 1.5,
    actual_speed_mps: float = 50.0,
    timestamp: float = 10.0,
    lap: int = 1,
    quality_status: ResidualQualityStatus = ResidualQualityStatus.VALID,
    tyre_age: int = 5,
    compound: str = "SOFT",
) -> ResidualFrame:
    expected_acc = (4.0 - raw_residual) if raw_residual is not None else 4.0
    norm_res = (raw_residual / 4.0) if raw_residual is not None else None

    return ResidualFrame(
        timestamp=timestamp,
        session_id="CONFOUNDER_TEST",
        lap=lap,
        distance_m=100.0,
        actual_acceleration_mps2=4.0 if raw_residual is not None else None,
        expected_acceleration_mps2=expected_acc,
        acceleration_residual_mps2=raw_residual,
        normalized_residual=norm_res,
        actual_speed_mps=actual_speed_mps,
        tyre_age=tyre_age,
        compound=compound,
        stint=1,
        quality_status=quality_status,
        quality_reason=None if quality_status == ResidualQualityStatus.VALID else "Test error",
    )


def create_sample_telemetry_frame(
    drs: int = 0,
    throttle_pct: float = 50.0,
    brake_pct: float = 0.0,
    speed_mps: float = 50.0,
    timestamp: float = 10.0,
    rainfall: bool = False,
    track_temp_c: float = 35.0,
    wind_speed_mps: float = 2.0,
) -> TelemetryFrame:
    def make_tyre(c):
        return TyreState(corner=c, compound="SOFT", tyre_life_laps=5, stint=1)

    return TelemetryFrame(
        timestamp=timestamp,
        session_id="CONFOUNDER_TEST",
        lap=1,
        vehicle=VehicleState(
            speed_mps=speed_mps,
            speed_kph=speed_mps * 3.6,
            throttle_pct=throttle_pct,
            brake_pct=brake_pct,
            drs=drs,
            gear=4,
        ),
        tyres=FourWheelTyreStates(
            fl=make_tyre(WheelCorner.FL),
            fr=make_tyre(WheelCorner.FR),
            rl=make_tyre(WheelCorner.RL),
            rr=make_tyre(WheelCorner.RR),
        ),
        environment=EnvironmentState(
            ambient_temp_c=25.0,
            track_temp_c=track_temp_c,
            wind_speed_mps=wind_speed_mps,
            rainfall=rainfall,
            track_condition="wet" if rainfall else "dry",
        ),
    )


# ========================================================
# 1. TEST DRS DETECTION
# ========================================================
def test_drs_detection():
    # DRS active (code 12) with significant residual
    drs_active = evaluate_drs(drs_code=12, residual_mag=1.5)
    assert drs_active.active is True
    assert drs_active.strength == 1.0
    assert drs_active.classification == ExplanatoryClassification.EXPLANATORY
    assert "DRS active" in drs_active.reason

    # DRS closed (code 0)
    drs_closed = evaluate_drs(drs_code=0, residual_mag=1.5)
    assert drs_closed.active is False
    assert drs_closed.classification == ExplanatoryClassification.NONE

    # DRS signal unavailable
    drs_none = evaluate_drs(drs_code=None, residual_mag=1.5)
    assert drs_none.active is False
    assert drs_none.status == "UNAVAILABLE"
    assert drs_none.classification == ExplanatoryClassification.UNKNOWN


# ========================================================
# 2. TEST BRAKING DETECTION
# ========================================================
def test_braking_detection():
    # Heavy braking (85% pedal)
    brk_heavy = evaluate_braking(brake_pct=85.0, residual_mag=2.5)
    assert brk_heavy.active is True
    assert brk_heavy.strength >= 0.85
    assert brk_heavy.classification == ExplanatoryClassification.EXPLANATORY

    # Light / zero braking (5% pedal)
    brk_low = evaluate_braking(brake_pct=5.0, residual_mag=2.5)
    assert brk_low.active is False
    assert brk_low.strength == 0.0
    assert brk_low.classification == ExplanatoryClassification.NONE


# ========================================================
# 3. TEST HIGH THROTTLE DEMAND
# ========================================================
def test_high_throttle_detection():
    th_high = evaluate_throttle(throttle_pct=95.0)
    assert th_high.active is True
    assert th_high.classification == ExplanatoryClassification.POSSIBLE

    th_cruising = evaluate_throttle(throttle_pct=40.0)
    assert th_cruising.active is False
    assert th_cruising.classification == ExplanatoryClassification.NONE


# ========================================================
# 4. TEST HIGH SPEED DETECTION
# ========================================================
def test_high_speed_detection():
    # 85 m/s (~306 km/h) -> above 70 m/s threshold
    spd_high = evaluate_high_speed(speed_mps=85.0)
    assert spd_high.active is True
    assert spd_high.classification == ExplanatoryClassification.EXPLANATORY
    assert "High vehicle speed" in spd_high.reason

    # 40 m/s (~144 km/h) -> normal speed
    spd_mid = evaluate_high_speed(speed_mps=40.0)
    assert spd_mid.active is False


# ========================================================
# 5. TEST TRANSIENT DETECTION
# ========================================================
def test_transient_detection():
    # Rapid throttle lift: -200 %/s
    tr_pedal = evaluate_transient(d_throttle_dt=-200.0, d_brake_dt=0.0, d_accel_dt=5.0)
    assert tr_pedal.active is True
    assert tr_pedal.classification == ExplanatoryClassification.EXPLANATORY
    assert "throttle rate" in tr_pedal.reason

    # Steady state
    tr_steady = evaluate_transient(d_throttle_dt=10.0, d_brake_dt=0.0, d_accel_dt=2.0)
    assert tr_steady.active is False
    assert tr_steady.classification == ExplanatoryClassification.NONE


# ========================================================
# 6. TEST TYRE AGE BANDING
# ========================================================
def test_tyre_age_banding():
    band_new, eval_new = classify_tyre_age(2)
    assert band_new == TyreAgeBand.NEW

    band_early, _ = classify_tyre_age(6)
    assert band_early == TyreAgeBand.EARLY_LIFE

    band_mid, _ = classify_tyre_age(12)
    assert band_mid == TyreAgeBand.MID_LIFE

    band_late, eval_late = classify_tyre_age(22)
    assert band_late == TyreAgeBand.LATE_LIFE
    assert eval_late.strength == 1.0

    band_none, eval_none = classify_tyre_age(None)
    assert band_none == TyreAgeBand.UNKNOWN
    assert eval_none.status == "UNAVAILABLE"


# ========================================================
# 7. TEST COMPOUND EVALUATION
# ========================================================
def test_compound_evaluation():
    comp_soft = evaluate_compound("SOFT")
    assert comp_soft.active is False  # Context only, never active confounder
    assert "SOFT" in comp_soft.reason

    comp_none = evaluate_compound(None)
    assert comp_none.status == "UNAVAILABLE"


# ========================================================
# 8. TEST ENVIRONMENT EVALUATION
# ========================================================
def test_environment_evaluation():
    # Track temp 48°C (nominal 35°C, delta 13°C)
    env_hot = evaluate_environment(track_temp_c=48.0, air_temp_c=30.0, wind_speed_mps=3.0)
    assert env_hot.active is True
    assert "track temp" in env_hot.reason

    # High wind 9 m/s
    env_wind = evaluate_environment(track_temp_c=35.0, air_temp_c=25.0, wind_speed_mps=9.0)
    assert env_wind.active is True
    assert "wind speed" in env_wind.reason

    # Nominal environment
    env_normal = evaluate_environment(track_temp_c=35.0, air_temp_c=25.0, wind_speed_mps=2.0)
    assert env_normal.active is False


# ========================================================
# 9. TEST POOR DATA QUALITY
# ========================================================
def test_poor_data_quality_handling():
    engine = ConfounderEngine()
    rf_bad = create_sample_residual_frame(
        raw_residual=None,
        quality_status=ResidualQualityStatus.INVALID_DT,
    )
    cf = engine.evaluate_frame(rf_bad)

    assert cf.interpretation == ConfounderInterpretation.INSUFFICIENT_DATA
    assert cf.tyre_evidence_quality == 0.0
    assert "DATA_QUALITY_INVALID_DT" in cf.active_flags


# ========================================================
# 10. TEST COMBINED CONFOUNDER SCENARIO
# ========================================================
def test_combined_confounder_scenario():
    engine = ConfounderEngine()

    # Frame with DRS + High Speed + Throttle
    rf = create_sample_residual_frame(raw_residual=2.0, actual_speed_mps=88.0)
    tf = create_sample_telemetry_frame(drs=12, throttle_pct=100.0, speed_mps=88.0)

    cf = engine.evaluate_frame(rf, tf)

    assert "DRS_ACTIVE" in cf.active_flags
    assert "HIGH_SPEED" in cf.active_flags
    assert "HIGH_THROTTLE" in cf.active_flags
    assert cf.non_tyre_explanation_score > 0.50
    assert cf.interpretation == ConfounderInterpretation.NON_TYRE_EXPLANATION_DOMINANT


# ========================================================
# 11. TEST TYRE EVIDENCE SCORING
# ========================================================
def test_tyre_evidence_scoring_clean_frame():
    engine = ConfounderEngine()

    # Steady state corner exit: speed 45 m/s, throttle 60%, brake 0%, no DRS, late life tyres
    rf = create_sample_residual_frame(
        raw_residual=1.8,
        actual_speed_mps=45.0,
        tyre_age=18,
    )
    tf = create_sample_telemetry_frame(
        drs=0,
        throttle_pct=60.0,
        brake_pct=0.0,
        speed_mps=45.0,
    )

    cf = engine.evaluate_frame(rf, tf)

    # Clean conditions: non-tyre explanation should be low, tyre evidence should be high
    assert cf.non_tyre_explanation_score < 0.20
    assert cf.tyre_evidence_quality > 0.70
    assert cf.interpretation == ConfounderInterpretation.STRONG_TYRE_EVIDENCE
    assert cf.adjusted_residual is not None
    assert math.isclose(cf.adjusted_residual, cf.raw_residual * cf.tyre_evidence_quality, rel_tol=1e-4)


# ========================================================
# 12. TEST DETERMINISTIC REPEATABILITY
# ========================================================
def test_confounder_engine_determinism():
    engine_1 = ConfounderEngine()
    engine_2 = ConfounderEngine()

    rf = create_sample_residual_frame(raw_residual=1.2, actual_speed_mps=65.0)
    tf = create_sample_telemetry_frame(drs=0, throttle_pct=75.0, speed_mps=65.0)

    cf_1 = engine_1.evaluate_frame(rf, tf)
    cf_2 = engine_2.evaluate_frame(rf, tf)

    assert cf_1.model_dump() == cf_2.model_dump()
    assert cf_1.non_tyre_explanation_score == cf_2.non_tyre_explanation_score
    assert cf_1.tyre_evidence_quality == cf_2.tyre_evidence_quality
