"""
TYRETRACE — Confounder Analysis Rules & Thresholds
Deterministic detection functions for non-tyre physical factors (DRS, heavy braking,
throttle transients, high speed, ambient shifts, and data quality issues).
"""

from typing import Any, Dict, List, Optional, Tuple

from backend.confounders.schemas import (
    ConfounderDetail,
    ConfounderEvaluation,
    ConfounderInterpretation,
    ExplanatoryClassification,
    TyreAgeBand,
)
from backend.residual.schemas import ResidualFrame, ResidualQualityStatus
from backend.schemas.telemetry import TelemetryFrame


# ==============================================================================
# CONFIGURABLE THRESHOLDS & WEIGHTS (EXPLICIT ENGINEERING CONSTANTS)
# ==============================================================================
DRS_ACTIVE_CODES = (1, 8, 10, 12, 14)

BRAKING_ACTIVE_THRESHOLD_PCT = 25.0   # % pedal effort to qualify as braking
BRAKING_HEAVY_THRESHOLD_PCT = 65.0    # % pedal effort for severe braking

THROTTLE_HIGH_THRESHOLD_PCT = 85.0    # % pedal effort for wide-open-throttle demand
HIGH_SPEED_THRESHOLD_MPS = 70.0       # m/s (~252 km/h) where unmodelled aero forces dominate

THROTTLE_RATE_THRESHOLD_PCT_S = 150.0 # %/s rate of throttle change for transient flag
BRAKE_RATE_THRESHOLD_PCT_S = 150.0    # %/s rate of brake change for transient flag
ACCEL_JERK_THRESHOLD_MPS3 = 25.0      # m/s^3 rate of acceleration change for transient flag

TRACK_TEMP_NOMINAL_C = 35.0           # Nominal reference track temperature
TRACK_TEMP_DELTA_THRESHOLD_C = 8.0    # Deviation from nominal considered confounding
WIND_SPEED_THRESHOLD_MPS = 6.0        # Ambient wind speed considered confounding

SIGNIFICANT_RESIDUAL_THRESHOLD = 1.0  # m/s^2 magnitude to trigger explanatory assessment

# Confounder Weights for non_tyre_explanation_score
WEIGHT_DRS = 0.35
WEIGHT_BRAKING = 0.30
WEIGHT_TRANSIENT = 0.25
WEIGHT_HIGH_SPEED = 0.20
WEIGHT_THROTTLE = 0.15
WEIGHT_RAIN = 0.50
WEIGHT_ENVIRONMENT = 0.10
WEIGHT_DATA_QUALITY = 0.60


def evaluate_drs(drs_code: Optional[int], residual_mag: float) -> ConfounderDetail:
    """Evaluates DRS activation status."""
    if drs_code is None:
        return ConfounderDetail(
            name="DRS",
            active=False,
            strength=0.0,
            classification=ExplanatoryClassification.UNKNOWN,
            reason="DRS telemetry signal unavailable in current frame",
            status="UNAVAILABLE",
        )

    is_active = drs_code in DRS_ACTIVE_CODES or drs_code >= 8
    if is_active:
        classification = (
            ExplanatoryClassification.EXPLANATORY
            if residual_mag >= SIGNIFICANT_RESIDUAL_THRESHOLD
            else ExplanatoryClassification.POSSIBLE
        )
        return ConfounderDetail(
            name="DRS",
            active=True,
            strength=1.0,
            classification=classification,
            reason="DRS active: aerodynamic drag is substantially lower than nominal Twin Engine Cd (0.85), explaining forward acceleration residual",
            status="AVAILABLE",
        )
    return ConfounderDetail(
        name="DRS",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="DRS inactive (rear wing flap closed)",
        status="AVAILABLE",
    )


def evaluate_braking(brake_pct: float, residual_mag: float) -> ConfounderDetail:
    """Evaluates heavy braking application."""
    if brake_pct < BRAKING_ACTIVE_THRESHOLD_PCT:
        return ConfounderDetail(
            name="Braking",
            active=False,
            strength=0.0,
            classification=ExplanatoryClassification.NONE,
            reason=f"Brake demand ({brake_pct:.0f}%) is below active threshold ({BRAKING_ACTIVE_THRESHOLD_PCT}%)",
            status="AVAILABLE",
        )

    strength = min(1.0, brake_pct / 100.0)
    classification = (
        ExplanatoryClassification.EXPLANATORY
        if brake_pct >= BRAKING_HEAVY_THRESHOLD_PCT and residual_mag >= SIGNIFICANT_RESIDUAL_THRESHOLD
        else ExplanatoryClassification.POSSIBLE
    )
    return ConfounderDetail(
        name="Braking",
        active=True,
        strength=round(strength, 3),
        classification=classification,
        reason=f"Brake demand ({brake_pct:.0f}%) active: transient hydraulic pressure, brake bias, and tyre grip limits explain deceleration residual",
        status="AVAILABLE",
    )


def evaluate_throttle(throttle_pct: float) -> ConfounderDetail:
    """Evaluates high throttle pedal demand."""
    if throttle_pct < THROTTLE_HIGH_THRESHOLD_PCT:
        return ConfounderDetail(
            name="Throttle",
            active=False,
            strength=0.0,
            classification=ExplanatoryClassification.NONE,
            reason=f"Throttle demand ({throttle_pct:.0f}%) below high threshold ({THROTTLE_HIGH_THRESHOLD_PCT}%)",
            status="AVAILABLE",
        )

    strength = min(1.0, (throttle_pct - THROTTLE_HIGH_THRESHOLD_PCT) / (100.0 - THROTTLE_HIGH_THRESHOLD_PCT))
    return ConfounderDetail(
        name="Throttle",
        active=True,
        strength=round(strength, 3),
        classification=ExplanatoryClassification.POSSIBLE,
        reason=f"High throttle application ({throttle_pct:.0f}%): peak powertrain delivery and traction limits active",
        status="AVAILABLE",
    )


def evaluate_high_speed(speed_mps: float) -> ConfounderDetail:
    """Evaluates high vehicle speed where unmodelled aero effects dominate."""
    if speed_mps < HIGH_SPEED_THRESHOLD_MPS:
        return ConfounderDetail(
            name="HighSpeed",
            active=False,
            strength=0.0,
            classification=ExplanatoryClassification.NONE,
            reason=f"Vehicle speed ({speed_mps * 3.6:.1f} km/h) below high-speed threshold ({HIGH_SPEED_THRESHOLD_MPS * 3.6:.1f} km/h)",
            status="AVAILABLE",
        )

    strength = min(1.0, (speed_mps - HIGH_SPEED_THRESHOLD_MPS) / 25.0)
    return ConfounderDetail(
        name="HighSpeed",
        active=True,
        strength=round(strength, 3),
        classification=ExplanatoryClassification.EXPLANATORY,
        reason=f"High vehicle speed ({speed_mps * 3.6:.1f} km/h): aerodynamic drag/downforce scales with v^2, making unmodelled aero effects dominant",
        status="AVAILABLE",
    )


def evaluate_transient(
    d_throttle_dt: Optional[float],
    d_brake_dt: Optional[float],
    d_accel_dt: Optional[float],
) -> ConfounderDetail:
    """Evaluates rapid driver pedal or kinematic transients."""
    th_trans = abs(d_throttle_dt) >= THROTTLE_RATE_THRESHOLD_PCT_S if d_throttle_dt is not None else False
    br_trans = abs(d_brake_dt) >= BRAKE_RATE_THRESHOLD_PCT_S if d_brake_dt is not None else False
    acc_trans = abs(d_accel_dt) >= ACCEL_JERK_THRESHOLD_MPS3 if d_accel_dt is not None else False

    if th_trans or br_trans or acc_trans:
        reasons = []
        strengths = []
        if th_trans:
            reasons.append(f"throttle rate {d_throttle_dt:+.0f}%/s")
            strengths.append(abs(d_throttle_dt) / 300.0)
        if br_trans:
            reasons.append(f"brake rate {d_brake_dt:+.0f}%/s")
            strengths.append(abs(d_brake_dt) / 300.0)
        if acc_trans:
            reasons.append(f"jerk {d_accel_dt:+.1f}m/s^3")
            strengths.append(abs(d_accel_dt) / 50.0)

        strength = min(1.0, max(strengths))
        return ConfounderDetail(
            name="Transient",
            active=True,
            strength=round(strength, 3),
            classification=ExplanatoryClassification.EXPLANATORY,
            reason=f"Rapid dynamic transient ({', '.join(reasons)}): driveline lag and chassis compliance explain transient residual",
            status="AVAILABLE",
        )

    return ConfounderDetail(
        name="Transient",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="Driver inputs and kinematic derivative are in quasi-steady state",
        status="AVAILABLE",
    )


def classify_tyre_age(tyre_life_laps: Optional[int]) -> Tuple[TyreAgeBand, ConfounderDetail]:
    """Classifies tyre age in laps (explicitly NOT physical tread depth)."""
    if tyre_life_laps is None:
        return TyreAgeBand.UNKNOWN, ConfounderDetail(
            name="TyreAge",
            active=False,
            strength=0.0,
            classification=ExplanatoryClassification.UNKNOWN,
            reason="TyreLife unavailable in telemetry; tyre age unknown",
            status="UNAVAILABLE",
        )

    laps = int(tyre_life_laps)
    if laps <= 3:
        band = TyreAgeBand.NEW
        reason = f"New tyre set ({laps} laps): operating in bedding-in window, low wear accumulation"
        strength = 0.10
    elif laps <= 8:
        band = TyreAgeBand.EARLY_LIFE
        reason = f"Early-life tyre ({laps} laps): stabilized thermal and compound state"
        strength = 0.30
    elif laps <= 15:
        band = TyreAgeBand.MID_LIFE
        reason = f"Mid-life tyre ({laps} laps): moderate stint accumulation"
        strength = 0.60
    else:
        band = TyreAgeBand.LATE_LIFE
        reason = f"Late-life tyre ({laps} laps): extended running history; legitimate candidate for wear accumulation"
        strength = 1.00

    return band, ConfounderDetail(
        name="TyreAge",
        active=(band in (TyreAgeBand.NEW, TyreAgeBand.LATE_LIFE)),
        strength=strength,
        classification=ExplanatoryClassification.POSSIBLE,
        reason=reason,
        status="AVAILABLE",
    )


def evaluate_compound(compound: Optional[str]) -> ConfounderDetail:
    """Evaluates tyre compound context."""
    if compound is None:
        return ConfounderDetail(
            name="Compound",
            active=False,
            strength=0.0,
            classification=ExplanatoryClassification.UNKNOWN,
            reason="Compound information unavailable",
            status="UNAVAILABLE",
        )
    return ConfounderDetail(
        name="Compound",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason=f"Compound context: {compound.upper()} (contextual reference, not direct degradation evidence)",
        status="AVAILABLE",
    )


def evaluate_environment(
    track_temp_c: Optional[float],
    air_temp_c: Optional[float],
    wind_speed_mps: Optional[float],
) -> ConfounderDetail:
    """Evaluates environmental confounders (track temperature shifts, high wind)."""
    flags = []
    strengths = []

    if track_temp_c is not None:
        delta_track = abs(track_temp_c - TRACK_TEMP_NOMINAL_C)
        if delta_track >= TRACK_TEMP_DELTA_THRESHOLD_C:
            flags.append(f"track temp {track_temp_c:.1f}°C (delta {delta_track:.1f}°C from nominal)")
            strengths.append(min(1.0, delta_track / 20.0))

    if wind_speed_mps is not None and wind_speed_mps >= WIND_SPEED_THRESHOLD_MPS:
        flags.append(f"wind speed {wind_speed_mps:.1f} m/s")
        strengths.append(min(1.0, wind_speed_mps / 15.0))

    if flags:
        strength = max(strengths)
        return ConfounderDetail(
            name="Environment",
            active=True,
            strength=round(strength, 3),
            classification=ExplanatoryClassification.POSSIBLE,
            reason=f"Environmental deviations active: {', '.join(flags)}",
            status="AVAILABLE",
        )

    return ConfounderDetail(
        name="Environment",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="Ambient temperature and wind within nominal operational bounds",
        status="AVAILABLE",
    )


def evaluate_rainfall(rainfall: Optional[bool], track_condition: Optional[str]) -> ConfounderDetail:
    """Evaluates rain and wet track surface conditions."""
    is_wet = bool(rainfall) or (track_condition is not None and track_condition.lower() in ("wet", "damp"))
    if is_wet:
        return ConfounderDetail(
            name="Rainfall",
            active=True,
            strength=1.0,
            classification=ExplanatoryClassification.EXPLANATORY,
            reason="Wet track surface / rainfall active: surface friction mu drops substantially, fully explaining reduced grip",
            status="AVAILABLE",
        )
    return ConfounderDetail(
        name="Rainfall",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="Dry track surface verified",
        status="AVAILABLE",
    )


def evaluate_data_quality(
    quality_status: ResidualQualityStatus,
    quality_reason: Optional[str],
) -> ConfounderDetail:
    """Evaluates Phase 4 pipeline data quality."""
    if quality_status != ResidualQualityStatus.VALID:
        return ConfounderDetail(
            name="DataQuality",
            active=True,
            strength=1.0,
            classification=ExplanatoryClassification.EXPLANATORY,
            reason=f"Data pipeline flagged non-valid ({quality_status.value}): {quality_reason or 'input anomaly'}",
            status="AVAILABLE",
        )
    return ConfounderDetail(
        name="DataQuality",
        active=False,
        strength=0.0,
        classification=ExplanatoryClassification.NONE,
        reason="Input data and kinematic derivative verified VALID",
        status="AVAILABLE",
    )


def calculate_scores_and_interpretation(
    conf: ConfounderEvaluation,
    residual: Optional[float],
    age_band: TyreAgeBand,
    raw_quality_status: ResidualQualityStatus,
) -> Tuple[float, float, ConfounderInterpretation, List[str]]:
    """
    Synthesizes non_tyre_explanation_score, tyre_evidence_quality, and interpretation.

    SCIENTIFIC POLICY:
    - non_tyre_explanation_score is NOT a probability.
    - tyre_evidence_quality is NOT tyre health; it evaluates suitability for degradation modeling.
    - Raw residual is never altered.
    """
    # 1. Non-tyre explanation score (weighted sum clamped to [0, 1])
    score_components = [
        WEIGHT_DRS * (conf.drs.strength if conf.drs.active else 0.0),
        WEIGHT_BRAKING * (conf.braking.strength if conf.braking.active else 0.0),
        WEIGHT_TRANSIENT * (conf.transient.strength if conf.transient.active else 0.0),
        WEIGHT_HIGH_SPEED * (conf.high_speed.strength if conf.high_speed.active else 0.0),
        WEIGHT_THROTTLE * (conf.throttle.strength if conf.throttle.active else 0.0),
        WEIGHT_RAIN * (conf.rainfall.strength if conf.rainfall.active else 0.0),
        WEIGHT_ENVIRONMENT * (conf.environment.strength if conf.environment.active else 0.0),
        WEIGHT_DATA_QUALITY * (conf.data_quality.strength if conf.data_quality.active else 0.0),
    ]
    non_tyre_score = min(1.0, sum(score_components))

    # 2. Tyre evidence quality [0, 1]
    if raw_quality_status != ResidualQualityStatus.VALID or residual is None:
        tyre_evidence = 0.0
        interpretation = ConfounderInterpretation.INSUFFICIENT_DATA
        explanations = [f"Data quality invalid ({raw_quality_status.value}): residual unsuitable for analysis"]
        return round(non_tyre_score, 3), round(tyre_evidence, 3), interpretation, explanations

    # Base evidence quality inversely scales with non-tyre explanation
    tyre_evidence = max(0.0, 1.0 - non_tyre_score)

    # Context modifier for tyre age: New tyres cannot have high wear evidence
    if age_band == TyreAgeBand.NEW:
        tyre_evidence = min(tyre_evidence, 0.35)

    explanations = []
    if conf.drs.active:
        explanations.append(conf.drs.reason)
    if conf.braking.active:
        explanations.append(conf.braking.reason)
    if conf.transient.active:
        explanations.append(conf.transient.reason)
    if conf.high_speed.active:
        explanations.append(conf.high_speed.reason)
    if conf.rainfall.active:
        explanations.append(conf.rainfall.reason)

    # 3. Interpretation Categorization
    if non_tyre_score >= 0.60:
        interpretation = ConfounderInterpretation.NON_TYRE_EXPLANATION_DOMINANT
        if not explanations:
            explanations.append("Strong non-tyre physical factors account for observed residual")
    elif tyre_evidence >= 0.65 and abs(residual) >= SIGNIFICANT_RESIDUAL_THRESHOLD:
        interpretation = ConfounderInterpretation.STRONG_TYRE_EVIDENCE
        explanations.append("Significant residual observed with minimal non-tyre confounding: suitable as strong tyre evidence candidate")
    elif tyre_evidence >= 0.40:
        interpretation = ConfounderInterpretation.MODERATE_TYRE_EVIDENCE
        explanations.append("Moderate tyre evidence: residual observed under acceptable steady-state conditions")
    else:
        interpretation = ConfounderInterpretation.LOW_TYRE_EVIDENCE
        explanations.append("Low tyre evidence: residual is small or partially confounded")

    return round(non_tyre_score, 3), round(tyre_evidence, 3), interpretation, explanations
