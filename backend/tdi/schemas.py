"""
TYRETRACE — Tyre Degradation Index (TDI) Schemas
Defines data structures for deterministic TDI scoring, degradation states,
trend trajectory analysis, explainability payloads, and session/lap reports.

SCIENTIFIC POLICY:
TDI is an inferred degradation severity index in [0, 100].
It is NOT tread depth (mm), remaining tyre life in mm, physical rubber loss,
probability, or guaranteed failure prediction.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field


class TDIState(str, Enum):
    HEALTHY_LOW_EVIDENCE = "HEALTHY_LOW_EVIDENCE"  # 0–20
    EARLY_DEGRADATION = "EARLY_DEGRADATION"        # 21–40
    MODERATE_DEGRADATION = "MODERATE_DEGRADATION"  # 41–60
    HIGH_DEGRADATION = "HIGH_DEGRADATION"          # 61–80
    SEVERE_DEGRADATION = "SEVERE_DEGRADATION"      # 81–100


class TDITrend(str, Enum):
    STABLE = "STABLE"
    RISING = "RISING"
    FALLING = "FALLING"
    SPIKE = "SPIKE"
    UNKNOWN = "UNKNOWN"


class TDIComponentScores(BaseModel):
    """
    Individual normalized [0, 1] component scores that constitute TDI.
    All formulation weights are labelled: MODEL PARAMETER — DEMO ASSUMPTION.
    """
    residual_severity: float = Field(..., ge=0.0, le=1.0, description="Normalized severity of residual magnitude [0, 1]")
    persistence: float = Field(..., ge=0.0, le=1.0, description="Persistence of significant discrepancy over time [0, 1]")
    degradation_trend: float = Field(..., ge=0.0, le=1.0, description="Trajectory slope & consistency contribution [0, 1]")
    tyre_age: float = Field(..., ge=0.0, le=1.0, description="Normalized age contribution based on lap count [0, 1]")
    evidence_quality: float = Field(..., ge=0.0, le=1.0, description="Quality of tyre evidence from Confounder Engine [0, 1]")
    confounder_penalty: float = Field(..., ge=0.0, le=1.0, description="Penalty derived from non_tyre_explanation_score [0, 1]")
    raw_evidence_score: float = Field(..., ge=0.0, le=1.0, description="Weighted sum of evidence components before penalty")
    qualified_score: float = Field(..., ge=0.0, le=1.0, description="Final score after confounder attenuation")


class TDIFrame(BaseModel):
    """
    Evaluated TDI output frame representing inferred tyre degradation severity at time t.
    """
    timestamp: float = Field(..., description="Timestamp in seconds")
    lap: int = Field(..., description="Lap index")
    distance_m: Optional[float] = Field(None, description="Track distance in meters")

    # Inferred Degradation Target
    tdi: float = Field(..., ge=0.0, le=100.0, description="Inferred Tyre Degradation Index [0.0 - 100.0]")
    state: TDIState = Field(..., description="Classified degradation severity state")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in TDI inference [0.0 - 1.0]")
    trend: TDITrend = Field(..., description="Trajectory trend (STABLE, RISING, FALLING, SPIKE, UNKNOWN)")

    # Underlying Normalized Components
    components: TDIComponentScores = Field(..., description="Breakdown of all 6 normalized components")

    # Separation of Core Variables (CRITICAL ARCHITECTURAL REQUIREMENT)
    raw_residual: Optional[float] = Field(None, description="Physical model discrepancy (Phase 4 actual - expected) [m/s^2]")
    tyre_evidence_quality: float = Field(..., ge=0.0, le=1.0, description="How suitable observation is for degradation inference")
    non_tyre_explanation_score: float = Field(..., ge=0.0, le=1.0, description="Confounder explanatory strength")

    # Operational Context
    tyre_age_laps: Optional[int] = Field(None, description="Tyre set life in completed laps (FastF1 TyreLife)")
    compound: Optional[str] = Field(None, description="Tyre compound type (e.g. SOFT, MEDIUM, HARD)")
    stint: Optional[int] = Field(None, description="Stint sequence number")
    performance_impact_score: Optional[float] = Field(None, description="Estimated performance impact score or None")

    # Explainability
    evidence: List[str] = Field(default_factory=list, description="Calculated positive evidence factors")
    counter_evidence: List[str] = Field(default_factory=list, description="Calculated non-tyre or mitigating factors")
    provenance: str = Field("INFERRED / MODELLED", description="Provenance classification for TDI")


class TDILapSummary(BaseModel):
    """
    Lap-level aggregation of TDI metrics, degradation states, and evidence trends.
    """
    lap: int = Field(..., description="Lap index")
    sample_count: int = Field(..., description="Total samples evaluated in lap")
    valid_sample_count: int = Field(..., description="Valid samples in lap")

    mean_tdi: float = Field(..., ge=0.0, le=100.0, description="Mean TDI across lap")
    min_tdi: float = Field(..., ge=0.0, le=100.0, description="Minimum TDI observed in lap")
    max_tdi: float = Field(..., ge=0.0, le=100.0, description="Maximum TDI observed in lap")
    final_tdi: float = Field(..., ge=0.0, le=100.0, description="Final TDI at end of lap")

    trend: TDITrend = Field(..., description="Classified TDI trend across lap")
    dominant_state: TDIState = Field(..., description="Most prevalent degradation state in lap")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Mean confidence in lap TDI")

    tyre_age_laps: Optional[int] = Field(None, description="Tyre age in laps")
    compound: Optional[str] = Field(None, description="Compound type")
    stint: Optional[int] = Field(None, description="Stint number")
    evidence_summary: List[str] = Field(default_factory=list, description="Lap evidence summary")


class TDISessionReport(BaseModel):
    """
    Full session synthesis of tyre degradation progression and evidence audit.
    """
    session_id: str = Field(..., description="Session identifier")
    total_frames: int = Field(..., description="Total frames evaluated")
    valid_frames: int = Field(..., description="Valid frames evaluated")
    total_laps: int = Field(..., description="Total laps evaluated")

    average_tdi: float = Field(..., ge=0.0, le=100.0, description="Session average TDI")
    maximum_tdi: float = Field(..., ge=0.0, le=100.0, description="Session peak TDI")
    minimum_tdi: float = Field(..., ge=0.0, le=100.0, description="Session minimum TDI")
    final_tdi: float = Field(..., ge=0.0, le=100.0, description="Final recorded TDI in session")

    session_tdi_trend: TDITrend = Field(..., description="Session-level degradation trajectory trend")
    overall_confidence: float = Field(..., ge=0.0, le=1.0, description="Overall confidence across session")
    degradation_state: TDIState = Field(..., description="Overall session degradation state classification")

    tyre_age_range: Tuple[Optional[int], Optional[int]] = Field(..., description="Observed (min_age, max_age) in laps")
    average_evidence_quality: float = Field(..., ge=0.0, le=1.0, description="Mean tyre evidence quality")
    average_non_tyre_score: float = Field(..., ge=0.0, le=1.0, description="Mean non-tyre explanation score")

    lap_summaries: List[TDILapSummary] = Field(default_factory=list, description="Lap-by-lap statistics")
    scientific_limitations: Dict[str, str] = Field(
        default_factory=dict, description="Explicit documentation of scientific boundaries and assumptions"
    )
