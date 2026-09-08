"""
TYRETRACE — Residual Engine Schemas
Defines data structures for Actual-vs-Expected residual frames, rolling window metrics,
and lap-level statistical aggregations.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ResidualQualityStatus(str, Enum):
    VALID = "VALID"
    MISSING_INPUT = "MISSING_INPUT"
    INVALID_DT = "INVALID_DT"
    NUMERICAL_OUTLIER = "NUMERICAL_OUTLIER"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"


class ResidualTrend(str, Enum):
    STABLE = "STABLE"
    INCREASING = "INCREASING"
    DECREASING = "DECREASING"
    SPIKE = "SPIKE"
    UNKNOWN = "UNKNOWN"


class ResidualFrame(BaseModel):
    """
    Synchronized frame capturing the difference between actual vehicle dynamics
    and first-principles physics twin predictions.

    SCIENTIFIC DEFINITION:
    Residual = Unexplained difference between actual and physics-expected vehicle behaviour.
    (It is NOT tyre degradation directly; tyre degradation is inferred downstream).
    """

    timestamp: float = Field(..., description="Timestamp in seconds")
    timestamp_iso: Optional[str] = Field(None, description="ISO-8601 formatted timestamp string")
    session_id: str = Field(..., description="Session identifier")
    lap: int = Field(..., description="Lap index")
    distance_m: Optional[float] = Field(None, description="Lap track distance in meters")
    relative_distance: Optional[float] = Field(None, description="Normalized lap progress [0.0 - 1.0]")
    driver: Optional[str] = Field(None, description="Driver 3-letter code")

    # Acceleration channels (SI: m/s^2)
    actual_acceleration_mps2: Optional[float] = Field(
        None, description="Actual vehicle longitudinal acceleration (DERIVED_FROM_FASTF1_SPEED: Delta v / Delta t) [m/s^2]"
    )
    expected_acceleration_mps2: float = Field(
        ..., description="Expected vehicle acceleration predicted by Phase 3 Physics Twin [m/s^2]"
    )
    acceleration_residual_mps2: Optional[float] = Field(
        None, description="Core residual: r_ax(t) = ax_actual(t) - ax_expected(t) [m/s^2]"
    )
    normalized_residual: Optional[float] = Field(
        None, description="Normalized residual: r_ax / max(|ax_expected|, epsilon)"
    )

    # Reference kinematics & tyre context
    actual_speed_mps: float = Field(..., description="Measured vehicle speed [m/s]")
    tyre_age: Optional[int] = Field(None, description="Tyre set life in completed laps")
    compound: Optional[str] = Field(None, description="Tyre compound type (e.g. SOFT, MEDIUM, HARD)")
    stint: Optional[int] = Field(None, description="Stint sequence number")

    # Corner-specific extension slot (reserved for future 4-wheel telemetry datasets)
    corner_residuals: Optional[Dict[str, Optional[float]]] = Field(
        None, description="Per-corner residual slots {FL, FR, RL, RR} when corner telemetry is available"
    )

    # Provenance & Data Quality
    quality_status: ResidualQualityStatus = Field(
        ResidualQualityStatus.VALID, description="Data validation status of this residual calculation"
    )
    quality_reason: Optional[str] = Field(None, description="Explanation if status is non-VALID")
    signal_origin: str = Field(
        "DERIVED_FROM_FASTF1_SPEED", description="Origin of actual acceleration signal"
    )


class RollingWindowFeatures(BaseModel):
    """
    Statistical and trend features extracted over a moving window of residual samples.
    """

    window_size: int = Field(..., description="Configured window size in sample count")
    sample_count: int = Field(..., description="Total samples observed in window")
    valid_sample_count: int = Field(..., description="Count of VALID residual samples in window")

    residual_mean: Optional[float] = Field(None, description="Mean acceleration residual [m/s^2]")
    residual_std: Optional[float] = Field(None, description="Standard deviation of residuals [m/s^2]")
    residual_abs_mean: Optional[float] = Field(None, description="Mean of absolute residuals |r_ax| [m/s^2]")
    residual_min: Optional[float] = Field(None, description="Minimum residual in window [m/s^2]")
    residual_max: Optional[float] = Field(None, description="Maximum residual in window [m/s^2]")
    residual_slope: Optional[float] = Field(None, description="Rate of change of residual over time Delta r / Delta t [m/s^3]")
    persistence_ratio: Optional[float] = Field(
        None, description="Ratio of valid samples exceeding the significance threshold [0.0 - 1.0]"
    )
    trend: ResidualTrend = Field(ResidualTrend.UNKNOWN, description="Classified residual trend pattern")


class LapResidualSummary(BaseModel):
    """
    Aggregated statistical summary of residuals for a single completed lap.
    """

    lap: int = Field(..., description="Lap index")
    sample_count: int = Field(..., description="Total frames processed in lap")
    valid_sample_count: int = Field(..., description="Count of VALID residual frames in lap")
    invalid_sample_count: int = Field(..., description="Count of rejected / non-valid frames in lap")

    mean_residual: Optional[float] = Field(None, description="Mean acceleration residual [m/s^2]")
    abs_mean_residual: Optional[float] = Field(None, description="Mean absolute residual [m/s^2]")
    std_residual: Optional[float] = Field(None, description="Standard deviation of residuals [m/s^2]")
    residual_min: Optional[float] = Field(None, description="Minimum residual in lap [m/s^2]")
    residual_max: Optional[float] = Field(None, description="Maximum residual in lap [m/s^2]")
    residual_slope: Optional[float] = Field(None, description="Fitted residual trend slope across lap [m/s^3]")
    persistence_ratio: Optional[float] = Field(None, description="Persistence ratio of significant residuals in lap")

    residual_quality_confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Quality confidence score of lap residuals [0.0 - 1.0]"
    )
    compound: Optional[str] = Field(None, description="Tyre compound during lap")
    tyre_age: Optional[int] = Field(None, description="Tyre life laps during lap")
    stint: Optional[int] = Field(None, description="Stint sequence number")


class ResidualSessionReport(BaseModel):
    """
    Session-level summary report containing overall metrics and per-lap summaries.
    """

    session_id: str = Field(..., description="Session identifier")
    total_samples: int = Field(..., description="Total frames processed")
    valid_samples: int = Field(..., description="Count of valid residual frames")
    invalid_samples: int = Field(..., description="Count of invalid / rejected frames")

    mean_residual: Optional[float] = Field(None, description="Overall mean residual [m/s^2]")
    std_residual: Optional[float] = Field(None, description="Overall standard deviation [m/s^2]")
    mean_abs_residual: Optional[float] = Field(None, description="Overall mean absolute residual [m/s^2]")
    max_abs_residual: Optional[float] = Field(None, description="Overall peak absolute residual [m/s^2]")
    overall_quality_confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Aggregate residual quality confidence [0.0 - 1.0]"
    )
    lap_summaries: List[LapResidualSummary] = Field(default_factory=list, description="Lap-by-lap statistics")
    scientific_note: str = Field(
        "Residual = unexplained difference between actual and physics-expected vehicle behaviour. "
        "Tyre degradation will only be inferred downstream via confounder analysis and persistence evidence.",
        description="Scientific interpretation policy",
    )
