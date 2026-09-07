"""
TYRETRACE — Canonical Telemetry Schemas
Defines the core Pydantic data contracts for internal vehicle and corner tyre states.
Supports both fully-instrumented synthetic/test benches and real F1 data sources (FastF1).
Unavailable telemetry signals remain explicitly None/null without fabrication.
"""

from datetime import datetime
from enum import Enum
from typing import Dict, Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator


class WheelCorner(str, Enum):
    FL = "FL"
    FR = "FR"
    RL = "RL"
    RR = "RR"


class TyreState(BaseModel):
    """
    Physical and kinematic state for a single corner tyre.
    Preserves unavailable sensor fields as None. Never fabricates unmeasured values.
    """
    corner: WheelCorner
    # Physical sensor measurements (available in bench/sim, None in public F1 telemetry)
    pressure_bar: Optional[float] = Field(None, description="Tyre internal pressure in bar", ge=0.5, le=5.0)
    surface_temp_c: Optional[float] = Field(None, description="Tyre surface bulk temperature in °C", ge=-20.0, le=250.0)
    carcass_temp_c: Optional[float] = Field(None, description="Tyre carcass/internal temperature in °C", ge=-20.0, le=250.0)
    inner_temp_c: Optional[float] = Field(None, description="Tread inner temperature in °C", ge=-20.0, le=250.0)
    middle_temp_c: Optional[float] = Field(None, description="Tread middle temperature in °C", ge=-20.0, le=250.0)
    outer_temp_c: Optional[float] = Field(None, description="Tread outer temperature in °C", ge=-20.0, le=250.0)
    wheel_speed_mps: Optional[float] = Field(None, description="Linear wheel rotational speed in m/s", ge=0.0, le=150.0)
    slip_ratio: Optional[float] = Field(None, description="Longitudinal slip ratio (dimensionless)", ge=-2.0, le=2.0)
    slip_angle_deg: Optional[float] = Field(None, description="Lateral slip angle in degrees", ge=-45.0, le=45.0)
    vertical_load_n: Optional[float] = Field(None, description="Vertical tyre normal load in Newtons", ge=0.0, le=30000.0)

    # Operational tyre metadata (available in F1 timing / stint logs)
    compound: Optional[str] = Field(None, description="Tyre compound (e.g. SOFT, MEDIUM, HARD, INTERMEDIATE, WET)")
    tyre_life_laps: Optional[int] = Field(None, description="Number of laps run on this tyre set", ge=0)
    stint: Optional[int] = Field(None, description="Stint sequence number", ge=1)

    @field_validator("carcass_temp_c")
    @classmethod
    def validate_carcass_temp(cls, v: Optional[float]) -> Optional[float]:
        return round(v, 2) if v is not None else None


class FourWheelTyreStates(BaseModel):
    """
    Canonical 4-corner tyre state mapping: FL, FR, RL, RR.
    """
    fl: TyreState
    fr: TyreState
    rl: TyreState
    rr: TyreState

    @model_validator(mode="after")
    def verify_corner_assignments(self) -> "FourWheelTyreStates":
        if self.fl.corner != WheelCorner.FL:
            raise ValueError(f"fl slot must have corner=FL, got {self.fl.corner}")
        if self.fr.corner != WheelCorner.FR:
            raise ValueError(f"fr slot must have corner=FR, got {self.fr.corner}")
        if self.rl.corner != WheelCorner.RL:
            raise ValueError(f"rl slot must have corner=RL, got {self.rl.corner}")
        if self.rr.corner != WheelCorner.RR:
            raise ValueError(f"rr slot must have corner=RR, got {self.rr.corner}")
        return self

    def get_corner(self, corner: Union[WheelCorner, str]) -> TyreState:
        key = corner.value.lower() if isinstance(corner, WheelCorner) else corner.lower()
        if hasattr(self, key):
            return getattr(self, key)
        raise KeyError(f"Invalid corner: {corner}")

    def as_dict(self) -> Dict[str, TyreState]:
        return {
            WheelCorner.FL.value: self.fl,
            WheelCorner.FR.value: self.fr,
            WheelCorner.RL.value: self.rl,
            WheelCorner.RR.value: self.rr,
        }


class VehicleState(BaseModel):
    """
    Overall vehicle kinematics, dynamics, and driver inputs.
    """
    speed_mps: float = Field(..., description="True ground vehicle speed in m/s", ge=0.0, le=150.0)
    speed_kph: float = Field(..., description="Vehicle speed in km/h", ge=0.0, le=540.0)
    throttle_pct: float = Field(..., description="Driver throttle position [0..100]", ge=0.0, le=100.0)
    brake_pct: float = Field(..., description="Driver brake pedal position [0..100]", ge=0.0, le=100.0)
    gear: int = Field(0, description="Current selected gear (0=neutral/park, -1=reverse)", ge=-1, le=10)

    # Optional engine / chassis telemetry
    rpm: Optional[float] = Field(None, description="Engine crankshaft revolutions per minute", ge=0.0, le=25000.0)
    drs: Optional[int] = Field(None, description="DRS state (0=inactive, 1/8=active)", ge=0, le=14)
    steer_angle_deg: Optional[float] = Field(None, description="Handwheel or road wheel steer angle in degrees", ge=-900.0, le=900.0)
    longitudinal_accel_g: Optional[float] = Field(None, description="Longitudinal acceleration in g's", ge=-10.0, le=10.0)
    lateral_accel_g: Optional[float] = Field(None, description="Lateral acceleration in g's", ge=-10.0, le=10.0)
    yaw_rate_deg_s: Optional[float] = Field(None, description="Chassis yaw velocity in deg/s", ge=-360.0, le=360.0)

    # Spatial coordinates (from GPS / track position telemetry)
    position_x: Optional[float] = Field(None, description="X coordinate in track reference frame")
    position_y: Optional[float] = Field(None, description="Y coordinate in track reference frame")
    position_z: Optional[float] = Field(None, description="Z coordinate in track reference frame")

    @field_validator("speed_kph")
    @classmethod
    def validate_kph_consistency(cls, v: float, info) -> float:
        speed_mps = info.data.get("speed_mps")
        if speed_mps is not None:
            expected_kph = speed_mps * 3.6
            if abs(v - expected_kph) > 2.0:
                raise ValueError(f"speed_kph ({v}) inconsistent with speed_mps ({speed_mps}, expected ~{expected_kph:.1f})")
        return round(v, 2)


class EnvironmentState(BaseModel):
    """
    Ambient conditions and track surface state.
    """
    ambient_temp_c: Optional[float] = Field(None, description="Ambient temperature in °C", ge=-30.0, le=65.0)
    track_temp_c: Optional[float] = Field(None, description="Track surface temperature in °C", ge=-20.0, le=90.0)
    humidity_pct: Optional[float] = Field(None, description="Relative humidity percentage", ge=0.0, le=100.0)
    air_pressure_mbar: Optional[float] = Field(None, description="Atmospheric pressure in mbar", ge=700.0, le=1100.0)
    wind_speed_mps: Optional[float] = Field(None, description="Wind speed in m/s", ge=0.0, le=60.0)
    wind_direction_deg: Optional[float] = Field(None, description="Wind heading in degrees [0..360]", ge=0.0, le=360.0)
    rainfall: Optional[bool] = Field(None, description="Rain precipitation active")
    track_condition: str = Field("dry", description="Track moisture/condition (dry, damp, wet)")
    track_friction_mu: Optional[float] = Field(None, description="Estimated peak road friction coefficient", ge=0.1, le=2.5)


class TelemetryFrame(BaseModel):
    """
    Canonical Telemetry Frame representing a synchronized time-slice of vehicle,
    4-corner tyre states, and operational context.
    """
    timestamp: float = Field(..., description="Epoch timestamp in seconds or session elapsed time in seconds", ge=0.0)
    timestamp_iso: Optional[str] = Field(None, description="ISO-8601 formatted timestamp string")
    session_id: str = Field(..., description="Unique session / run identifier", min_length=1)
    lap: int = Field(..., description="Current lap number", ge=0)
    distance_m: Optional[float] = Field(None, description="Distance along lap/track in meters", ge=0.0)
    relative_distance: Optional[float] = Field(None, description="Normalized progress around track [0..1]", ge=0.0, le=1.0)
    driver: Optional[str] = Field(None, description="Driver identifier / code (e.g. VER, HAM)")
    vehicle: VehicleState
    tyres: FourWheelTyreStates
    environment: EnvironmentState

    @model_validator(mode="after")
    def sync_iso_timestamp(self) -> "TelemetryFrame":
        if not self.timestamp_iso:
            try:
                self.timestamp_iso = datetime.fromtimestamp(self.timestamp).isoformat()
            except (OverflowError, OSError, ValueError):
                self.timestamp_iso = f"T+{self.timestamp:.3f}s"
        return self
