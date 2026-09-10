"""
TYRETRACE — Blender Digital Twin Bridge Schemas
Defines compact data contracts for external 3D visualization layers (Blender, Three.js, Unreal).

SCIENTIFIC INTEGRITY RULE:
FastF1 source data does NOT provide wheel-level degradation telemetry.
Therefore, FL, FR, RL, RR corner entries are explicitly marked as unavailable with reason.
Do NOT fabricate corner-specific wear values.
"""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class BlenderVehicleState(BaseModel):
    speed_kph: float = Field(..., description="Vehicle ground speed in km/h")
    speed_mps: float = Field(..., description="Vehicle ground speed in m/s")
    throttle_pct: float = Field(..., description="Throttle input [0..100]")
    brake_pct: float = Field(..., description="Brake input [0..100]")
    gear: int = Field(..., description="Current gear index")
    drs_active: bool = Field(..., description="DRS wing open state")
    rpm: Optional[float] = Field(None, description="Engine rotational speed in RPM")
    steer_angle_deg: Optional[float] = Field(None, description="Steering wheel angle in degrees")
    position: Optional[list] = Field(None, description="3D world position in Blender [x, y, z]")
    heading: Optional[float] = Field(None, description="Heading angle in radians around world Z")
    heading_deg: Optional[float] = Field(None, description="Heading angle in degrees")
    track_distance_m: Optional[float] = Field(None, description="Distance along racing line in meters")
    lap_fraction: Optional[float] = Field(None, description="Normalized progress along lap [0..1]")
    track_error_m: Optional[float] = Field(0.0, description="Deviation from expected racing line in meters")


class BlenderCornerSlot(BaseModel):
    available: bool = Field(False, description="Whether wheel-level degradation telemetry exists")
    tdi: Optional[float] = Field(None, description="Corner-specific TDI in [0, 100] if available")
    reason: str = Field(
        "Wheel-level telemetry unavailable in FastF1 source",
        description="Scientific explanation for data omission",
    )


class BlenderTyresState(BaseModel):
    FL: BlenderCornerSlot = Field(default_factory=BlenderCornerSlot)
    FR: BlenderCornerSlot = Field(default_factory=BlenderCornerSlot)
    RL: BlenderCornerSlot = Field(default_factory=BlenderCornerSlot)
    RR: BlenderCornerSlot = Field(default_factory=BlenderCornerSlot)


class BlenderFramePayload(BaseModel):
    """
    Compact, high-frequency synchronization payload consumed by the Blender digital twin bridge.
    """
    sequence: int = Field(..., description="Monotonically increasing sequence number")
    timestamp_iso: str = Field(..., description="ISO-8601 formatted session timestamp")
    lap: int = Field(..., description="Current lap index")
    vehicle: BlenderVehicleState
    tyres: BlenderTyresState = Field(default_factory=BlenderTyresState)
    global_tdi: float = Field(..., description="Vehicle-level inferred Tyre Degradation Index [0..100]")
    degradation_state: str = Field(..., description="Classified degradation state")
    selected_component: Optional[str] = Field(None, description="Currently focused telemetry component")
    data_mode: str = Field("REPLAY", description="REPLAY or DEMO_SIMULATION")
    mode: str = Field("REAL_TELEMETRY", description="TEST_MODE or REAL_TELEMETRY")
