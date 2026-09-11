"""
TYRETRACE — Confounder Analysis Engine Schemas
Defines structured data contracts for confounder detection, explanatory classification,
non-tyre scoring, tyre evidence quality, and lap/session aggregation.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExplanatoryClassification(str, Enum):
    EXPLANATORY = "EXPLANATORY"  # Strong direct physical alternative explanation
    POSSIBLE = "POSSIBLE"        # Plausible contributing physical factor
    WEAK = "WEAK"                # Minor secondary factor
    NONE = "NONE"                # Factor not active or irrelevant
    UNKNOWN = "UNKNOWN"          # Input channel unavailable or unmeasured


class TyreAgeBand(str, Enum):
    NEW = "NEW"                  # 0–3 laps
    EARLY_LIFE = "EARLY_LIFE"    # 4–8 laps
    MID_LIFE = "MID_LIFE"        # 9–15 laps
    LATE_LIFE = "LATE_LIFE"      # 16+ laps
    UNKNOWN = "UNKNOWN"          # TyreLife unavailable


class ConfounderInterpretation(str, Enum):
    STRONG_TYRE_EVIDENCE = "STRONG_TYRE_EVIDENCE"
    MODERATE_TYRE_EVIDENCE = "MODERATE_TYRE_EVIDENCE"
    LOW_TYRE_EVIDENCE = "LOW_TYRE_EVIDENCE"
    NON_TYRE_EXPLANATION_DOMINANT = "NON_TYRE_EXPLANATION_DOMINANT"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class ConfounderDetail(BaseModel):
    """
    Individual evaluation for a specific candidate confounder channel.
    """
    name: str = Field(..., description="Canonical name of confounder category")
    active: bool = Field(..., description="Whether this confounder exceeds active threshold")
    strength: float = Field(..., ge=0.0, le=1.0, description="Normalized severity/strength of confounder [0.0 - 1.0]")
    classification: ExplanatoryClassification = Field(..., description="Explanatory plausibility level")
    reason: str = Field(..., description="Engineering explanation of why this factor is or is not confounding")
    status: str = Field("AVAILABLE", description="AVAILABLE or UNAVAILABLE")


class ConfounderEvaluation(BaseModel):
    """
    Structured container holding the evaluation for all 10 canonical confounder channels.
    """
    drs: ConfounderDetail
    braking: ConfounderDetail
    throttle: ConfounderDetail
    high_speed: ConfounderDetail
    transient: ConfounderDetail
    tyre_age: ConfounderDetail
    compound: ConfounderDetail
    environment: ConfounderDetail
    rainfall: ConfounderDetail
    data_quality: ConfounderDetail


class ConfounderFrame(BaseModel):
    """
    Confounder-evaluated frame combining Phase 4 residuals with non-tyre explanations
    and tyre evidence quality quantification.
    """

    timestamp: float = Field(..., description="Timestamp in seconds")
    lap: int = Field(..., description="Lap number")
    distance_m: Optional[float] = Field(None, description="Track distance along lap in meters")

    # Residual tracking (raw residual preserved untouched)
    raw_residual: Optional[float] = Field(..., description="Untouched Phase 4 actual - expected residual [m/s^2]")
    normalized_residual: Optional[float] = Field(None, description="Phase 4 normalized residual")
    actual_speed_mps: float = Field(..., description="Vehicle speed in m/s")

    # Confounder channels and flags
    confounders: ConfounderEvaluation = Field(..., description="Individual evaluations for all confounder channels")
    active_flags: List[str] = Field(default_factory=list, description="List of all active confounder flag tags")

    # Synthesized metrics
    non_tyre_explanation_score: float = Field(
        ..., ge=0.0, le=1.0, description="Deterministic metric indicating how strongly non-tyre factors explain residual [0.0 - 1.0]"
    )
    tyre_evidence_quality: float = Field(
        ..., ge=0.0, le=1.0, description="Suitability of this sample for downstream tyre degradation analysis [0.0 - 1.0]"
    )
    adjusted_residual: Optional[float] = Field(
        None, description="Analytical weighting: raw_residual * tyre_evidence_quality (NOT a physical acceleration)"
    )

    interpretation: ConfounderInterpretation = Field(
        ..., description="Deterministic category: STRONG/MODERATE/LOW/NON_TYRE_DOMINANT/INSUFFICIENT_DATA"
    )
    explanation: List[str] = Field(
        default_factory=list, description="Detailed explanatory findings for this frame"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Residual quality confidence remaining after confounder analysis [0.0 - 1.0]"
    )


class LapConfounderSummary(BaseModel):
    """
    Lap-level aggregation of confounder frequencies, evidence qualities, and tyre context.
    """
    lap: int = Field(..., description="Lap index")
    sample_count: int = Field(..., description="Total samples in lap")
    valid_sample_count: int = Field(..., description="Valid samples in lap")
    confounder_affected_count: int = Field(..., description="Samples with at least 1 active confounder")

    # Confounder frequency breakdown
    drs_count: int = Field(..., description="Frames with active DRS")
    braking_count: int = Field(..., description="Frames with active heavy braking")
    transient_count: int = Field(..., description="Frames with active transient dynamics")
    high_speed_count: int = Field(..., description="Frames with high vehicle speed")
    poor_quality_count: int = Field(..., description="Frames with data quality flags")

    # Evidence distribution
    strong_evidence_count: int = Field(..., description="Frames with STRONG_TYRE_EVIDENCE")
    moderate_evidence_count: int = Field(..., description="Frames with MODERATE_TYRE_EVIDENCE")
    low_evidence_count: int = Field(..., description="Frames with LOW_TYRE_EVIDENCE")
    non_tyre_dominant_count: int = Field(..., description="Frames with NON_TYRE_EXPLANATION_DOMINANT")
    insufficient_data_count: int = Field(..., description="Frames with INSUFFICIENT_DATA")

    mean_non_tyre_score: float = Field(..., ge=0.0, le=1.0, description="Average non-tyre explanation score across lap")
    mean_tyre_evidence_quality: float = Field(..., ge=0.0, le=1.0, description="Average tyre evidence quality across lap")

    tyre_age_band: TyreAgeBand = Field(..., description="Classified tyre age band for this lap")
    compound: Optional[str] = Field(None, description="Tyre compound")
    stint: Optional[int] = Field(None, description="Stint sequence")


class SessionConfounderReport(BaseModel):
    """
    Session-level summary detailing confounder impact across the full replay.
    """
    session_id: str = Field(..., description="Session identifier")
    total_frames: int = Field(..., description="Total frames evaluated")
    valid_frames: int = Field(..., description="Valid frames evaluated")
    frames_with_confounders: int = Field(..., description="Count of frames with at least one active confounder")

    # Confounder category counts
    drs_affected_frames: int = Field(..., description="Frames where DRS was active")
    braking_affected_frames: int = Field(..., description="Frames where heavy braking was active")
    transient_affected_frames: int = Field(..., description="Frames where throttle/brake/speed transients were active")
    high_speed_affected_frames: int = Field(..., description="Frames where high speed aero dominated")
    poor_quality_frames: int = Field(..., description="Frames flagged with poor data quality")

    # Evidence classifications
    strong_tyre_evidence_frames: int = Field(..., description="Frames suitable as strong tyre evidence")
    moderate_tyre_evidence_frames: int = Field(..., description="Frames with moderate tyre evidence")
    low_tyre_evidence_frames: int = Field(..., description="Frames with low tyre evidence")
    non_tyre_dominant_frames: int = Field(..., description="Frames where non-tyre factors dominate")
    insufficient_data_frames: int = Field(..., description="Frames with insufficient data")

    average_non_tyre_explanation_score: float = Field(..., ge=0.0, le=1.0)
    average_tyre_evidence_quality: float = Field(..., ge=0.0, le=1.0)

    lap_summaries: List[LapConfounderSummary] = Field(default_factory=list)
    scientific_boundaries: Dict[str, str] = Field(
        default_factory=dict, description="Explicit boundaries and non-claims for Phase 5"
    )
