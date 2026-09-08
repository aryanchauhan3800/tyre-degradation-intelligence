"""
TYRETRACE — Tyre Degradation Index (TDI) Scoring Engine
Provides deterministic, explainable scoring functions for computing the Tyre Degradation Index (TDI).

MATHEMATICAL DEFINITION & POLICY:
All weights and categorization thresholds are engineering assumptions:
LABEL: MODEL PARAMETER — DEMO ASSUMPTION

TDI is strictly an inferred degradation severity index in [0, 100].
It is NOT physical tread depth (mm), remaining tyre life in mm, physical rubber loss,
probability, or guaranteed tyre failure prediction.
"""

from typing import Dict, List, Optional, Tuple
from backend.tdi.schemas import TDIComponentScores, TDIState


# ==============================================================================
# MODEL PARAMETER — DEMO ASSUMPTION
# Component weights summing to 1.00 for evidence aggregation
# ==============================================================================
WEIGHT_RESIDUAL_SEVERITY: float = 0.25   # Weight for magnitude of physical discrepancy
WEIGHT_PERSISTENCE: float = 0.25          # Weight for time-persistence of discrepancy
WEIGHT_TREND: float = 0.15                # Weight for upward divergence trajectory
WEIGHT_TYRE_AGE: float = 0.20             # Weight for FastF1 TyreLife completed laps
WEIGHT_EVIDENCE_QUALITY: float = 0.15     # Weight for Confounder Engine observation quality

# Confounder attenuation effect: high non-tyre explanation dampens degradation evidence
# 0.70 means maximum confounding can reduce the evidence score by up to 70%
CONFOUNDER_ATTENUATION_COEFF: float = 0.70

# Normalization scaling thresholds
RESIDUAL_SEVERITY_THRESHOLD: float = 3.0  # m/s^2 acceleration residual for saturation


# ==============================================================================
# A — RESIDUAL SEVERITY SCORE
# ==============================================================================
def calculate_residual_severity(
    raw_residual: Optional[float],
    normalized_residual: Optional[float] = None,
    threshold: float = RESIDUAL_SEVERITY_THRESHOLD,
) -> float:
    """
    Computes normalized residual severity in [0.0, 1.0].
    Uses magnitude of residual without allowing single-frame extreme spikes to dominate.

    Formula:
        severity = min(abs(residual) / threshold, 1.0)
    """
    if raw_residual is None:
        return 0.0
    val = abs(normalized_residual) if normalized_residual is not None else abs(raw_residual)
    if threshold <= 0.0:
        return 0.0
    return round(min(1.0, max(0.0, val / threshold)), 4)


# ==============================================================================
# B — PERSISTENCE SCORE
# ==============================================================================
def calculate_persistence_score(persistence_ratio: Optional[float]) -> float:
    """
    Uses Phase 4/5 persistence feature in [0.0, 1.0].
    Persistence indicates a repeated, sustained discrepancy over consecutive frames.
    """
    if persistence_ratio is None:
        return 0.0
    return min(1.0, max(0.0, float(persistence_ratio)))


# ==============================================================================
# C — DEGRADATION TREND SCORE
# ==============================================================================
def calculate_degradation_trend_score(
    slope: Optional[float],
    consistency: Optional[float] = None,
    sample_count: int = 0,
    min_samples: int = 5,
) -> float:
    """
    Computes trend score in [0.0, 1.0] based on residual trajectory slope and consistency.
    Positive slope indicates widening actual vs expected deficit.
    If sample count is insufficient, returns 0.0 (no contribution).
    """
    if sample_count < min_samples or slope is None:
        return 0.0

    # If slope is negative or zero, discrepancy is shrinking or flat
    if slope <= 0.0:
        return 0.0

    # Slope scaling: slope of 0.5 m/s^2 per second reaches 1.0
    # MODEL PARAMETER — DEMO ASSUMPTION
    slope_factor = min(1.0, slope / 0.5)

    # Consistency factor (R^2 or sign consistency) in [0, 1] if available
    consist_factor = 1.0
    if consistency is not None:
        consist_factor = min(1.0, max(0.0, consistency))

    return min(1.0, max(0.0, slope_factor * consist_factor))


# ==============================================================================
# D — TYRE AGE SCORE
# ==============================================================================
def calculate_tyre_age_score(tyre_age_laps: Optional[int]) -> float:
    """
    Maps FastF1 TyreLife (lap count) to a normalized age score in [0.0, 1.0].
    MODEL PARAMETER — DEMO ASSUMPTION.
    Does not claim to represent physical tyre wear curves.

    Thresholds:
        NEW (0-3 laps):        0.0
        EARLY_LIFE (4-10):     0.2
        MID_LIFE (11-20):      0.5
        LATE_LIFE (21-30):     0.8
        EXTREME_LIFE (>30):    1.0
        UNKNOWN (None):        0.0
    """
    if tyre_age_laps is None or tyre_age_laps < 0:
        return 0.0
    if tyre_age_laps <= 3:
        return 0.0
    elif tyre_age_laps <= 10:
        return 0.2
    elif tyre_age_laps <= 20:
        return 0.5
    elif tyre_age_laps <= 30:
        return 0.8
    else:
        return 1.0


# ==============================================================================
# E — EVIDENCE QUALITY SCORE
# ==============================================================================
def calculate_evidence_quality_score(tyre_evidence_quality: Optional[float]) -> float:
    """
    Extracts Phase 5 tyre_evidence_quality in [0.0, 1.0].
    High quality increases TDI reliability; poor quality reduces TDI.
    Does not by itself imply degradation.
    """
    if tyre_evidence_quality is None:
        return 0.0
    return min(1.0, max(0.0, float(tyre_evidence_quality)))


# ==============================================================================
# F — CONFOUNDER PENALTY
# ==============================================================================
def calculate_confounder_penalty(non_tyre_explanation_score: Optional[float]) -> float:
    """
    Extracts Phase 5 non_tyre_explanation_score in [0.0, 1.0].
    Higher non-tyre explanation -> lower degradation evidence.
    """
    if non_tyre_explanation_score is None:
        return 0.0
    return min(1.0, max(0.0, float(non_tyre_explanation_score)))


# ==============================================================================
# COMPONENT SYNTHESIS & TDI COMPUTATION
# ==============================================================================
def compute_tdi_components(
    raw_residual: Optional[float],
    normalized_residual: Optional[float],
    persistence_ratio: Optional[float],
    trend_slope: Optional[float],
    trend_consistency: Optional[float],
    trend_samples: int,
    tyre_age_laps: Optional[int],
    tyre_evidence_quality: Optional[float],
    non_tyre_explanation_score: Optional[float],
) -> Tuple[float, TDIComponentScores]:
    """
    Calculates all 6 normalized components and synthesizes final TDI score in [0.0, 100.0].

    Returns:
        (tdi, components)
    """
    s_res = calculate_residual_severity(raw_residual, normalized_residual)
    s_pers = calculate_persistence_score(persistence_ratio)
    s_trend = calculate_degradation_trend_score(
        trend_slope, trend_consistency, trend_samples
    )
    s_age = calculate_tyre_age_score(tyre_age_laps)
    s_ev = calculate_evidence_quality_score(tyre_evidence_quality)
    s_conf = calculate_confounder_penalty(non_tyre_explanation_score)

    raw_evidence = (
        WEIGHT_RESIDUAL_SEVERITY * s_res
        + WEIGHT_PERSISTENCE * s_pers
        + WEIGHT_TREND * s_trend
        + WEIGHT_TYRE_AGE * s_age
        + WEIGHT_EVIDENCE_QUALITY * s_ev
    )

    # Confounder attenuation
    attenuation = 1.0 - (CONFOUNDER_ATTENUATION_COEFF * s_conf)
    qualified = max(0.0, min(1.0, raw_evidence * attenuation))

    # TDI clamping to [0.0, 100.0]
    tdi = round(max(0.0, min(100.0, qualified * 100.0)), 2)

    components = TDIComponentScores(
        residual_severity=round(s_res, 4),
        persistence=round(s_pers, 4),
        degradation_trend=round(s_trend, 4),
        tyre_age=round(s_age, 4),
        evidence_quality=round(s_ev, 4),
        confounder_penalty=round(s_conf, 4),
        raw_evidence_score=round(raw_evidence, 4),
        qualified_score=round(qualified, 4),
    )

    return tdi, components


# ==============================================================================
# CONFIDENCE CALCULATION
# ==============================================================================
def calculate_tdi_confidence(
    tyre_evidence_quality: float,
    non_tyre_explanation_score: float,
    tyre_age_laps: Optional[int],
    sample_count: int,
    min_required_samples: int = 10,
) -> float:
    """
    Calculates confidence in [0.0, 1.0] for the TDI inference.
    Confidence reflects telemetry suitability, absence of confounding, sample sufficiency,
    and tyre age availability.
    A high TDI with low confidence is entirely valid and supported.
    """
    # Base confidence from evidence quality adjusted for confounder presence
    base = tyre_evidence_quality * (1.0 - 0.5 * non_tyre_explanation_score)

    # Sample count scaling factor
    sample_factor = 1.0
    if sample_count < min_required_samples:
        sample_factor = max(0.1, sample_count / max(1, min_required_samples))

    # Known tyre age bonus/penalty
    age_factor = 1.0 if tyre_age_laps is not None else 0.8

    conf = base * sample_factor * age_factor
    return round(max(0.0, min(1.0, conf)), 3)


# ==============================================================================
# STATE CLASSIFICATION
# ==============================================================================
def classify_tdi_state(tdi: float) -> TDIState:
    """
    Maps numerical TDI to deterministic degradation state.
    THRESHOLDS (ENGINEERING / DEMO ASSUMPTIONS):
        0–20:   HEALTHY_LOW_EVIDENCE
        21–40:  EARLY_DEGRADATION
        41–60:  MODERATE_DEGRADATION
        61–80:  HIGH_DEGRADATION
        81–100: SEVERE_DEGRADATION
    """
    if tdi <= 20.0:
        return TDIState.HEALTHY_LOW_EVIDENCE
    elif tdi <= 40.0:
        return TDIState.EARLY_DEGRADATION
    elif tdi <= 60.0:
        return TDIState.MODERATE_DEGRADATION
    elif tdi <= 80.0:
        return TDIState.HIGH_DEGRADATION
    else:
        return TDIState.SEVERE_DEGRADATION


# ==============================================================================
# DYNAMIC EXPLAINABILITY GENERATION
# ==============================================================================
def generate_tdi_explanations(
    components: TDIComponentScores,
    raw_residual: Optional[float],
    tyre_age_laps: Optional[int],
    flagged_confounders: Optional[List[str]] = None,
) -> Tuple[List[str], List[str]]:
    """
    Generates deterministic, feature-derived evidence and counter-evidence lists.
    Does NOT hardcode static explanations.
    """
    evidence: List[str] = []
    counter_evidence: List[str] = []

    # Evidence factors
    if components.residual_severity >= 0.40:
        res_str = f"{abs(raw_residual):.2f} m/s²" if raw_residual is not None else "significant"
        evidence.append(f"Physical acceleration discrepancy exceeds baseline ({res_str})")

    if components.persistence >= 0.50:
        evidence.append(f"Discrepancy persists across {components.persistence * 100:.0f}% of rolling window")

    if components.degradation_trend >= 0.30:
        evidence.append(f"Residual trajectory demonstrates consistent upward divergence ({components.degradation_trend:.2f})")

    if components.tyre_age >= 0.50:
        evidence.append(f"Tyre set has completed {tyre_age_laps} laps (elevated mechanical wear vulnerability)")
    elif components.tyre_age > 0.0:
        evidence.append(f"Tyre set has completed {tyre_age_laps} laps")

    if components.evidence_quality >= 0.60:
        evidence.append(f"High tyre evidence quality ({components.evidence_quality:.2f}) without telemetry distortion")

    # Counter-evidence factors (mitigating / non-tyre explanations)
    if components.confounder_penalty >= 0.40:
        counter_evidence.append(
            f"Non-tyre confounder score ({components.confounder_penalty:.2f}) strongly attenuates degradation confidence"
        )

    if flagged_confounders:
        for c in flagged_confounders:
            counter_evidence.append(f"Confounder active: {c}")

    if components.evidence_quality < 0.40:
        counter_evidence.append(
            f"Low tyre evidence quality ({components.evidence_quality:.2f}) limits observation reliability"
        )

    if tyre_age_laps is None:
        counter_evidence.append("Tyre set age unavailable (no physical age baseline)")
    elif tyre_age_laps <= 3:
        counter_evidence.append(f"Tyre set is fresh ({tyre_age_laps} laps old), reducing degradation likelihood")

    if not evidence:
        evidence.append("No significant degradation evidence detected")

    return evidence, counter_evidence
