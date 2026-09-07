"""
TYRETRACE — Telemetry Adapter Interface & Concrete Adapters
Provides an extensible adapter interface for parsing, converting, and validating
raw telemetry data into the canonical TelemetryFrame representation.
"""

from abc import ABC, abstractmethod
import json
from typing import Any, Dict, Optional, Tuple, Union
from pydantic import ValidationError

from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)


class TelemetryError(Exception):
    """Base exception for all telemetry-related parsing and validation errors."""
    pass


class MalformedTelemetryError(TelemetryError):
    """Raised when incoming telemetry is syntactically invalid or structurally corrupted."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


class TelemetryAdapter(ABC):
    """
    Abstract interface for converting heterogeneous raw telemetry data sources
    into canonical TelemetryFrame instances.
    """

    @abstractmethod
    def parse(self, raw_data: Union[str, bytes, Dict[str, Any]]) -> TelemetryFrame:
        """
        Parses and validates raw telemetry into a canonical TelemetryFrame.
        Raises MalformedTelemetryError if the data cannot be converted.
        """
        pass

    def validate_raw(self, raw_data: Union[str, bytes, Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
        """
        Performs non-raising validation on raw input.
        Returns (True, None) if valid, or (False, error_message) if invalid.
        """
        try:
            self.parse(raw_data)
            return True, None
        except Exception as e:
            return False, str(e)


class CanonicalTelemetryAdapter(TelemetryAdapter):
    """
    Adapter for directly formatted canonical JSON payloads or dictionaries.
    """

    def parse(self, raw_data: Union[str, bytes, Dict[str, Any]]) -> TelemetryFrame:
        payload: Dict[str, Any]

        if isinstance(raw_data, (str, bytes)):
            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError as exc:
                raise MalformedTelemetryError(
                    f"Invalid JSON string format: {str(exc)}",
                    {"raw_snippet": str(raw_data)[:200]},
                ) from exc
        elif isinstance(raw_data, dict):
            payload = raw_data
        else:
            raise MalformedTelemetryError(
                f"Unsupported raw data type: {type(raw_data).__name__}. Expected dict, str, or bytes."
            )

        try:
            return TelemetryFrame.model_validate(payload)
        except ValidationError as val_err:
            errors = val_err.errors()
            formatted_errors = [
                f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
                for err in errors
            ]
            raise MalformedTelemetryError(
                f"Validation failed with {len(errors)} error(s): {'; '.join(formatted_errors)}",
                {"errors": errors},
            ) from val_err


class FlatTelemetryAdapter(TelemetryAdapter):
    """
    Adapter for flat dictionaries (e.g. from tabular CSV streams or legacy CAN logger packets)
    that maps flat keys into the canonical nested TelemetryFrame.
    """

    def parse(self, raw_data: Union[str, bytes, Dict[str, Any]]) -> TelemetryFrame:
        if isinstance(raw_data, (str, bytes)):
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError as exc:
                raise MalformedTelemetryError(f"Invalid JSON payload: {str(exc)}") from exc
        elif isinstance(raw_data, dict):
            data = raw_data
        else:
            raise MalformedTelemetryError(f"Unsupported payload type: {type(raw_data).__name__}")

        try:
            # Vehicle speed handling
            speed_kph = float(data.get("speed_kph", data.get("speed", 0.0)))
            speed_mps = float(data.get("speed_mps", speed_kph / 3.6))

            vehicle = VehicleState(
                speed_mps=speed_mps,
                speed_kph=speed_kph,
                steer_angle_deg=float(data.get("steer_angle_deg", data.get("steer", 0.0))),
                throttle_pct=float(data.get("throttle_pct", data.get("throttle", 0.0))),
                brake_pct=float(data.get("brake_pct", data.get("brake", 0.0))),
                longitudinal_accel_g=float(data.get("longitudinal_accel_g", data.get("ax", 0.0))),
                lateral_accel_g=float(data.get("lateral_accel_g", data.get("ay", 0.0))),
                yaw_rate_deg_s=float(data.get("yaw_rate_deg_s", data.get("yaw_rate", 0.0))),
                gear=int(data.get("gear", 1)),
            )

            # Tyre states
            def make_tyre(corner_str: str) -> TyreState:
                c_upper = corner_str.upper()
                c_lower = corner_str.lower()
                return TyreState(
                    corner=WheelCorner(c_upper),
                    pressure_bar=float(data.get(f"{c_lower}_pressure", data.get(f"pressure_{c_lower}", 2.0))),
                    surface_temp_c=float(data.get(f"{c_lower}_surface_temp", data.get(f"temp_{c_lower}", 80.0))),
                    carcass_temp_c=float(data.get(f"{c_lower}_carcass_temp", data.get(f"temp_carcass_{c_lower}", 80.0))),
                    wheel_speed_mps=float(data.get(f"{c_lower}_wheel_speed", speed_mps)),
                    slip_ratio=float(data.get(f"{c_lower}_slip_ratio", 0.0)),
                    slip_angle_deg=float(data.get(f"{c_lower}_slip_angle", 0.0)),
                    vertical_load_n=float(data.get(f"{c_lower}_vertical_load", 4000.0)),
                )

            tyres = FourWheelTyreStates(
                fl=make_tyre("FL"),
                fr=make_tyre("FR"),
                rl=make_tyre("RL"),
                rr=make_tyre("RR"),
            )

            environment = EnvironmentState(
                ambient_temp_c=float(data.get("ambient_temp_c", data.get("ambient_temp", 25.0))),
                track_temp_c=float(data.get("track_temp_c", data.get("track_temp", 35.0))),
                track_condition=str(data.get("track_condition", "dry")),
                track_friction_mu=float(data.get("track_friction_mu", 1.0)),
            )

            return TelemetryFrame(
                timestamp=float(data.get("timestamp", 0.0)),
                session_id=str(data.get("session_id", "session_flat")),
                lap=int(data.get("lap", 1)),
                distance_m=float(data.get("distance_m", 0.0)) if "distance_m" in data else None,
                vehicle=vehicle,
                tyres=tyres,
                environment=environment,
            )
        except (ValueError, KeyError, ValidationError) as err:
            raise MalformedTelemetryError(f"Flat telemetry mapping error: {str(err)}") from err
