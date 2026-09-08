"""
TYRETRACE — Real-Time API Data Contracts & Schemas
Frontend- and visualization-ready Pydantic schemas with explicit units and ISO-8601 timestamps.

SCIENTIFIC INTEGRITY CONTRACT:
1. Replayed FastF1 sessions report data_mode = "REPLAY"
2. Corner degradation for FL, FR, RL, RR is reported as available=False, tdi=None
3. Physics TDI, AI TDI, and Final Fused TDI are strictly kept separate
4. Explanations are derived from deterministic and ML engine features
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field("ok", description="Service health state")
    service: str = Field("TYRETRACE", description="Service canonical name")
    version: str = Field("1.0.0", description="API software version")
    pipeline: str = Field("physics_residual_confounder_tdi_ai", description="Active pipeline stages")


class SessionResponse(BaseModel):
    session_id: str = Field(..., description="Unique session identifier")
    event: str = Field(..., description="Grand Prix event name")
    year: int = Field(..., description="Championship season year")
    session: str = Field(..., description="Session type (R=Race, Q=Qualifying)")
    driver: str = Field(..., description="Driver 3-letter code")
    data_mode: str = Field("REPLAY", description="Data origin: REPLAY or DEMO_SIMULATION")
    total_laps: int = Field(..., description="Total completed laps in replay")
    current_lap: int = Field(..., description="Current playback lap index")
    tyre_compound: Optional[str] = Field(None, description="Active tyre compound (e.g. SOFT, MEDIUM, HARD)")
    tyre_age: Optional[int] = Field(None, description="Completed laps on current tyre set")


class PhysicsForces(BaseModel):
    drag_n: float = Field(..., description="Aerodynamic drag force in Newtons")
    rolling_resistance_n: float = Field(..., description="Rolling resistance force in Newtons")
    brake_force_n: float = Field(..., description="Braking force in Newtons")
    traction_n: float = Field(..., description="Tire longitudinal traction force in Newtons")
    net_force_n: float = Field(..., description="Sum of longitudinal forces in Newtons")


class PhysicsStateResponse(BaseModel):
    expected_acceleration_mps2: float = Field(..., description="Newton's second law predicted acceleration in m/s^2")
    forces: PhysicsForces
    vertical_load_n: float = Field(..., description="Total vehicle normal gravity load in Newtons")
    load_transfer_n: float = Field(..., description="Dynamic longitudinal load transfer in Newtons")
    parameter_provenance: Dict[str, str] = Field(..., description="Provenance tag for each physics parameter")


class ResidualStateResponse(BaseModel):
    actual_acceleration_mps2: Optional[float] = Field(None, description="Actual acceleration from speed derivative in m/s^2")
    expected_acceleration_mps2: float = Field(..., description="Physics twin predicted acceleration in m/s^2")
    raw_residual_mps2: Optional[float] = Field(None, description="Physical model discrepancy: actual - expected in m/s^2")
    normalized_residual: Optional[float] = Field(None, description="Normalized residual scaled by expected dynamics")
    quality_status: str = Field("VALID", description="Data quality validation status")
    rolling_features: Dict[str, Any] = Field(default_factory=dict, description="Rolling window statistical features")
    trend: str = Field("UNKNOWN", description="Residual trend classification")


class ConfoundersStateResponse(BaseModel):
    active_flags: List[str] = Field(default_factory=list, description="List of active non-tyre confounder tags")
    drs_active: bool = Field(False, description="DRS flap open status")
    braking_active: bool = Field(False, description="Heavy braking event flag")
    throttle_active: bool = Field(False, description="Full throttle acceleration flag")
    high_speed_active: bool = Field(False, description="High aerodynamic sensitivity speed flag (>250 km/h)")
    transient_active: bool = Field(False, description="Transient throttle/brake rate flag")
    tyre_age_laps: Optional[int] = Field(None, description="Tyre set life in completed laps")
    compound: Optional[str] = Field(None, description="Current tyre compound")
    non_tyre_explanation_score: float = Field(..., ge=0.0, le=1.0, description="Confounder explanatory score in [0, 1]")
    tyre_evidence_quality: float = Field(..., ge=0.0, le=1.0, description="Tyre observation quality score in [0, 1]")


class TDIStateResponse(BaseModel):
    physics_tdi: float = Field(..., ge=0.0, le=100.0, description="Phase 6 First-principles Physics TDI [0, 100]")
    ai_tdi: float = Field(..., ge=0.0, le=100.0, description="Phase 7 AI Model Inferred Degradation [0, 100]")
    final_tdi: float = Field(..., ge=0.0, le=100.0, description="Weighted Physics + AI Fused TDI [0, 100]")
    state: str = Field(..., description="Degradation severity state (HEALTHY, EARLY, MODERATE, HIGH, SEVERE)")
    trend: str = Field(..., description="Trajectory trend (STABLE, RISING, FALLING, SPIKE, UNKNOWN)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Inference confidence score [0, 1]")
    model_reliability: float = Field(..., ge=0.0, le=1.0, description="Operational AI reliability score [0, 1]")
    evidence: List[str] = Field(default_factory=list, description="Feature-derived positive degradation evidence")
    counter_evidence: List[str] = Field(default_factory=list, description="Feature-derived confounding or mitigating factors")


class CornerSlot(BaseModel):
    available: bool = Field(False, description="Whether wheel-level degradation telemetry is available")
    tdi: Optional[float] = Field(None, description="Corner-specific TDI in [0, 100] if available")
    reason: str = Field("Wheel-level telemetry unavailable in FastF1 source", description="Scientific explanation")


class FourWheelTyresResponse(BaseModel):
    FL: CornerSlot = Field(default_factory=CornerSlot)
    FR: CornerSlot = Field(default_factory=CornerSlot)
    RL: CornerSlot = Field(default_factory=CornerSlot)
    RR: CornerSlot = Field(default_factory=CornerSlot)


class ReplayStatusResponse(BaseModel):
    running: bool = Field(False, description="Replay engine active state")
    paused: bool = Field(False, description="Playback pause state")
    current_frame: int = Field(0, description="Index of current replay frame")
    total_frames: int = Field(0, description="Total frames loaded in dataset")
    current_lap: int = Field(1, description="Current lap being replayed")
    playback_speed: float = Field(1.0, description="Playback multiplier (0.25x, 0.5x, 1x, 2x, 5x, 10x)")
    session_id: str = Field("UNKNOWN", description="Active session ID")
    data_mode: str = Field("REPLAY", description="REPLAY or DEMO_SIMULATION")


class ReplaySeekRequest(BaseModel):
    frame_index: int = Field(..., ge=0, description="Target frame index to seek to")


class ReplaySpeedRequest(BaseModel):
    speed: float = Field(..., gt=0.0, le=10.0, description="Playback speed multiplier")


class TDIHistoryPoint(BaseModel):
    timestamp_iso: str = Field(..., description="ISO-8601 timestamp")
    timestamp_sec: float = Field(..., description="Timestamp in seconds")
    lap: int = Field(..., description="Lap index")
    physics_tdi: float = Field(..., description="Physics TDI score")
    ai_tdi: float = Field(..., description="AI inferred degradation")
    final_tdi: float = Field(..., description="Fused TDI score")


class ResidualHistoryPoint(BaseModel):
    timestamp_iso: str = Field(..., description="ISO-8601 timestamp")
    timestamp_sec: float = Field(..., description="Timestamp in seconds")
    lap: int = Field(..., description="Lap index")
    raw_residual_mps2: Optional[float] = Field(None, description="Raw acceleration residual in m/s^2")
    normalized_residual: Optional[float] = Field(None, description="Normalized residual")
    tyre_evidence_quality: float = Field(..., description="Tyre evidence quality [0, 1]")
    non_tyre_explanation_score: float = Field(..., description="Confounder score [0, 1]")


class LapSummaryResponse(BaseModel):
    lap: int = Field(..., description="Lap index")
    tyre_compound: Optional[str] = Field(None, description="Tyre compound")
    tyre_age: Optional[int] = Field(None, description="Tyre age in laps")
    mean_residual_mps2: Optional[float] = Field(None, description="Mean acceleration residual in m/s^2")
    mean_tdi: float = Field(..., description="Mean fused TDI across lap")
    min_tdi: float = Field(..., description="Minimum TDI across lap")
    max_tdi: float = Field(..., description="Peak TDI across lap")
    final_tdi: float = Field(..., description="Final TDI at end of lap")
    trend: str = Field(..., description="Dominant trend in lap")
    confidence: float = Field(..., description="Mean confidence in lap")
    sample_count: int = Field(..., description="Samples evaluated in lap")


class ComponentSelectRequest(BaseModel):
    component: Optional[str] = Field(None, description="Focused component name (e.g. Wheel_FL, BrakeDisc_FR)")
    tyre: Optional[str] = Field(None, description="Tyre corner alias (FL, FR, RL, RR)")


class ComponentSelectResponse(BaseModel):
    selected_component: Optional[str] = Field(None, description="Currently active component")
    selected_tyre: Optional[str] = Field(None, description="Currently active tyre corner alias (FL, FR, RL, RR)")


class ModeSelectRequest(BaseModel):
    mode: str = Field(..., description="Target mode (REPLAY or DEMO_SIMULATION)")


class ModeSelectResponse(BaseModel):
    data_mode: str = Field(..., description="Current active mode")

