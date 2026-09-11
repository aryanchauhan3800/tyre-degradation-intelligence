"""
TYRETRACE — Twin Engine Interface & Concrete Physics Digital Twin
Executes first-principles physics models on canonical TelemetryFrames, producing expected
longitudinal dynamics, aerodynamic drag, rolling resistance, and load transfer while maintaining
explicit provenance tracking (MEASURED, DERIVED, MODELLED, UNAVAILABLE).
"""

from abc import ABC, abstractmethod
import math
from typing import Any, Dict, List, Optional

from backend.schemas.telemetry import TelemetryFrame
from backend.schemas.twin import SignalOrigin, TwinEngineOutput
from backend.twin_engine.parameters import PhysicsParameters
from backend.twin_engine.physics_model import (
    calculate_drag,
    calculate_effective_grip,
    calculate_expected_acceleration,
    calculate_load_transfer,
    calculate_rolling_resistance,
    calculate_thermal_rate,
    calculate_tyre_force_limit,
    calculate_vertical_load,
)


class BaseTwinEngine(ABC):
    """
    Abstract interface for all Digital Twin engine implementations.
    """

    @abstractmethod
    def initialize(self) -> None:
        """Initializes internal states, filters, and parameter buffers."""
        pass

    @abstractmethod
    def step(self, telemetry_frame: TelemetryFrame) -> TwinEngineOutput:
        """
        Executes one time-step update of the digital twin using the incoming frame.
        Must execute real physical calculations (never hardcoded mock values).
        """
        pass

    @abstractmethod
    def reset(self) -> None:
        """Resets kinematics history and internal state variables to defaults."""
        pass

    @abstractmethod
    def health(self) -> Dict[str, Any]:
        """Returns engine operational health, processed frame count, and status."""
        pass


class TwinEngine(BaseTwinEngine):
    """
    Primary First-Principles Physics Digital Twin for TYRETRACE.
    Combines vehicle parameters, aerodynamics, powertrain limits, and tyre load limits
    to calculate expected physical behaviour for canonical TelemetryFrames.
    """

    def __init__(self, parameters: Optional[PhysicsParameters] = None):
        self.params: PhysicsParameters = parameters or PhysicsParameters()
        self._initialized: bool = False
        self._frame_count: int = 0
        self._last_timestamp: Optional[float] = None
        self._last_speed_mps: Optional[float] = None
        self.initialize()

    def initialize(self) -> None:
        self._initialized = True
        self._frame_count = 0
        self._last_timestamp = None
        self._last_speed_mps = None

    def reset(self) -> None:
        self.initialize()

    def health(self) -> Dict[str, Any]:
        return {
            "status": "OPERATIONAL" if self._initialized else "UNINITIALIZED",
            "type": "PhysicsTwinEngine",
            "processed_frames": self._frame_count,
            "has_kinematic_history": self._last_speed_mps is not None,
            "vehicle_mass_kg": self.params.mass_kg,
            "cd": self.params.cd,
        }

    def step(self, telemetry_frame: TelemetryFrame) -> TwinEngineOutput:
        """
        Evaluates the incoming frame through the first-principles physics pipeline.
        """
        if not self._initialized:
            self.initialize()

        self._frame_count += 1
        t_now = telemetry_frame.timestamp
        veh = telemetry_frame.vehicle

        # 1. Measured Inputs Audit
        v_mps = veh.speed_mps
        throttle_pct = veh.throttle_pct
        brake_pct = veh.brake_pct
        gear = veh.gear
        rpm = veh.rpm

        measured_inputs: Dict[str, Any] = {
            "speed_mps": v_mps,
            "speed_kph": veh.speed_kph,
            "throttle_pct": throttle_pct,
            "brake_pct": brake_pct,
            "gear": gear,
        }
        if rpm is not None:
            measured_inputs["rpm"] = rpm
        if telemetry_frame.environment.ambient_temp_c is not None:
            measured_inputs["ambient_temp_c"] = telemetry_frame.environment.ambient_temp_c
        if telemetry_frame.environment.track_temp_c is not None:
            measured_inputs["track_temp_c"] = telemetry_frame.environment.track_temp_c

        # 2. Acceleration Derivation (DERIVED FROM FASTF1 SPEED: Delta v / Delta t)
        derived_ax: Optional[float] = None
        derived_inputs: Dict[str, Any] = {}

        if v_mps is not None and self._last_timestamp is not None and self._last_speed_mps is not None:
            dt = t_now - self._last_timestamp
            dv = v_mps - self._last_speed_mps

            # Guard against non-positive dt, numerical jitter, and unrealistic sensor spikes (> 6g)
            if dt > 0.001:
                raw_derived = dv / dt
                if abs(raw_derived) <= 60.0:  # Physical bound: ~6g limit for F1 threshold braking
                    derived_ax = round(raw_derived, 3)
                    derived_inputs["derived_acceleration_mps2"] = {
                        "value": derived_ax,
                        "method": "Delta v / Delta t (DERIVED FROM FASTF1 SPEED)",
                        "dt_s": round(dt, 4),
                        "dv_mps": round(dv, 3),
                    }
                else:
                    derived_inputs["derived_acceleration_mps2"] = {
                        "value": None,
                        "warning": f"Unrealistic spike rejected: {raw_derived:.1f} m/s^2",
                    }

        # Update kinematic tracking state
        self._last_timestamp = t_now
        self._last_speed_mps = v_mps

        # Effective speed for physics calculations (0.0 if missing)
        v_physics = float(v_mps) if v_mps is not None else 0.0

        # 3. Aerodynamic Drag: F_drag = 0.5 * rho * Cd * A * v^2
        f_drag = calculate_drag(
            speed_mps=v_physics,
            air_density=self.params.air_density,
            cd=self.params.cd,
            frontal_area_m2=self.params.frontal_area_m2,
        )

        # 4. Rolling Resistance: F_rolling = Crr * m * g
        f_rolling = calculate_rolling_resistance(
            mass_kg=self.params.mass_kg,
            crr=self.params.crr,
            gravity=self.params.gravity,
        )

        # 5. Total Vertical Normal Load: Fz_total = m * g + F_aero (F_aero = 0.0 for initial MVP)
        fz_total = calculate_vertical_load(
            mass_kg=self.params.mass_kg,
            gravity=self.params.gravity,
            f_aero=0.0,
        )

        # 6. Tyre Normal Friction Force Ceiling: F_tyre_max_total = mu_eff * Fz_total
        mu_eff = calculate_effective_grip(
            mu0=self.params.base_tyre_mu,
            degradation=0.0,
        )
        f_tyre_max_total = calculate_tyre_force_limit(mu_eff=mu_eff, fz=fz_total)

        # 7. Modelled Longitudinal Traction Force (MODELLED: P_engine / v, capped by tyre friction)
        if throttle_pct > 0.0:
            effective_v = max(v_physics, 4.0)  # Low-speed virtual gearing / torque cap
            demanded_power_w = (throttle_pct / 100.0) * self.params.max_engine_power_w
            f_power = demanded_power_w / effective_v
            f_traction = min(f_power, f_tyre_max_total)
        else:
            f_traction = 0.0

        # 8. Modelled Braking Force (MODELLED: brake_pct * max_brake_force, capped by tyre friction)
        if brake_pct > 0.0:
            demanded_brake = (brake_pct / 100.0) * self.params.max_brake_force_n
            f_brake = min(demanded_brake, f_tyre_max_total)
        else:
            f_brake = 0.0

        # 9. Authoritative Expected Acceleration: (F_traction - F_drag - F_rolling - F_brake) / m
        ax_expected = calculate_expected_acceleration(
            f_traction=f_traction,
            f_drag=f_drag,
            f_rolling=f_rolling,
            f_brake=f_brake,
            mass_kg=self.params.mass_kg,
        )

        # 10. Longitudinal Load Transfer: DeltaFz = m * ax * h / L
        delta_fz, fz_front, fz_rear = calculate_load_transfer(
            mass_kg=self.params.mass_kg,
            ax_mps2=ax_expected,
            cg_height_m=self.params.cg_height_m,
            wheelbase_m=self.params.wheelbase_m,
            static_front_fraction=self.params.static_front_weight_fraction,
            gravity=self.params.gravity,
            f_aero=0.0,
        )

        # 11. Tyre Thermal Energy Model (Input Verification)
        # In FastF1, wheel speeds, slip ratios, and temperatures are None -> MUST PRESERVE AS UNAVAILABLE
        t_surface_k = (
            telemetry_frame.tyres.fl.surface_temp_c + 273.15
            if telemetry_frame.tyres.fl.surface_temp_c is not None
            else None
        )
        t_ambient_k = (
            telemetry_frame.environment.ambient_temp_c + 273.15
            if telemetry_frame.environment.ambient_temp_c is not None
            else None
        )
        thermal_dt_dt, thermal_status = calculate_thermal_rate(
            fx=None,
            fy=None,
            v_slip_x=None,
            v_slip_y=None,
            hA=self.params.thermal_loss_coefficient,
            t_surface_k=t_surface_k,
            t_ambient_k=t_ambient_k,
            tyre_mass_kg=self.params.tyre_mass_kg,
            cp=self.params.tyre_specific_heat,
        )

        # 12. Provenance and Assumptions Audit
        modelled_inputs: Dict[str, Any] = {
            "F_traction_model": f"{f_traction:.1f} N (MODELLED: P_engine={self.params.max_engine_power_w / 1000:.0f}kW, throttle={throttle_pct:.0f}%)",
            "F_brake_model": f"{f_brake:.1f} N (MODELLED: max_clamp={self.params.max_brake_force_n / 1000:.1f}kN, brake={brake_pct:.0f}%)",
            "F_drag_model": f"{f_drag:.1f} N (MODELLED: Cd={self.params.cd}, A={self.params.frontal_area_m2}m^2, rho={self.params.air_density}kg/m^3)",
            "F_rolling_model": f"{f_rolling:.1f} N (MODELLED: Crr={self.params.crr}, m={self.params.mass_kg}kg)",
            "Fz_total_model": f"{fz_total:.1f} N (MODELLED: static mass {self.params.mass_kg} kg * g)",
        }

        unavailable_inputs: List[str] = [
            "tyres.fl/fr/rl/rr.pressure_bar",
            "tyres.fl/fr/rl/rr.surface_temp_c",
            "tyres.fl/fr/rl/rr.carcass_temp_c",
            "tyres.fl/fr/rl/rr.wheel_speed_mps",
            "tyres.fl/fr/rl/rr.slip_ratio",
            "tyres.fl/fr/rl/rr.slip_angle_deg",
            "tyres.fl/fr/rl/rr.vertical_load_n",
            "vehicle.steer_angle_deg",
            "vehicle.longitudinal_accel_g (measured accelerometer)",
            "vehicle.lateral_accel_g",
            "vehicle.yaw_rate_deg_s",
        ]

        assumptions: List[str] = [
            f"F1 regulations vehicle mass assumed at {self.params.mass_kg} kg",
            f"Aerodynamic drag Cd={self.params.cd}, Frontal Area={self.params.frontal_area_m2} m^2",
            f"Traction force modelled via throttle percentage capped at {self.params.max_engine_power_w / 1000:.0f} kW power curve",
            "Tyre thermal model marked UNAVAILABLE due to unmeasured physical slip/temperature telemetry",
        ]

        # Model Confidence Evaluation
        # 0.90 if kinematic derivative available and inputs clean; 0.80 if first frame without derivative
        confidence = 0.90 if derived_ax is not None else 0.80

        return TwinEngineOutput(
            timestamp=t_now,
            session_id=telemetry_frame.session_id,
            lap=telemetry_frame.lap,
            expected_acceleration_mps2=round(ax_expected, 3),
            expected_drag_n=round(f_drag, 2),
            expected_rolling_resistance_n=round(f_rolling, 2),
            expected_brake_force_n=round(f_brake, 2),
            expected_traction_force_n=round(f_traction, 2),
            expected_vertical_load_n=round(fz_total, 2),
            expected_fz_front_n=round(fz_front, 2),
            expected_fz_rear_n=round(fz_rear, 2),
            expected_load_transfer_n=round(delta_fz, 2),
            actual_speed_mps=round(v_mps, 3) if v_mps is not None else 0.0,
            derived_acceleration_mps2=derived_ax,
            thermal_status=thermal_status,
            thermal_prediction_k_per_s=thermal_dt_dt,
            model_confidence=confidence,
            measured_inputs=measured_inputs,
            derived_inputs=derived_inputs,
            modelled_inputs=modelled_inputs,
            unavailable_inputs=unavailable_inputs,
            assumptions=assumptions,
        )
