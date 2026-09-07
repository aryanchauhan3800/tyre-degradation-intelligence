"""
TYRETRACE — Synthetic Demo Telemetry Generator
Generates realistic multi-phase track driving telemetry with physical corner-by-corner
load transfer, tyre temperatures, pressures, and slip dynamics across FL, FR, RL, RR.
"""

import json
import math
from pathlib import Path
from typing import Any, Dict, List

from backend.schemas.telemetry import (
    EnvironmentState,
    FourWheelTyreStates,
    TelemetryFrame,
    TyreState,
    VehicleState,
    WheelCorner,
)


def generate_demo_session(
    num_frames: int = 80,
    dt: float = 0.2,
    session_id: str = "SESSION_DEMO_001",
) -> List[TelemetryFrame]:
    """
    Generates a deterministic sequence of canonical TelemetryFrames containing:
    - Straight line acceleration
    - Heavy threshold braking zone (front load transfer + thermal rise)
    - High-load left hairpin (right tyre wear/load surge)
    - Fast right chicane (left tyre wear/load surge, asymmetric FL degradation signature)
    - Full throttle straight
    """
    frames: List[TelemetryFrame] = []

    # Initial states
    speed_mps = 25.0  # 90 km/h
    distance_m = 0.0

    # Tyre baseline temperatures (°C)
    fl_surf = 82.0
    fr_surf = 82.0
    rl_surf = 78.0
    rr_surf = 78.0

    fl_carcass = 80.0
    fr_carcass = 80.0
    rl_carcass = 76.0
    rr_carcass = 76.0

    # Tyre baseline pressures (bar)
    base_pressure_f = 2.05
    base_pressure_r = 1.95

    for i in range(num_frames):
        t = round(i * dt, 2)

        # Driving Phase Segmentation
        if t < 4.0:
            # Phase 1: Straight acceleration
            phase = "ACCEL_STRAIGHT"
            throttle = 100.0
            brake = 0.0
            steer = 0.0
            ax = 0.85 - (speed_mps / 120.0)
            ay = 0.0
            yaw_rate = 0.0
            gear = 3 if speed_mps < 40 else 4
        elif t < 7.0:
            # Phase 2: Heavy braking zone
            phase = "HEAVY_BRAKING"
            throttle = 0.0
            brake = 85.0
            steer = -2.0  # slight correction
            ax = -1.45
            ay = 0.05
            yaw_rate = 0.5
            gear = 2
        elif t < 11.0:
            # Phase 3: Left-hand turn (heavy load on outside tyres FR, RR)
            phase = "LEFT_CORNER"
            throttle = 35.0
            brake = 0.0
            steer = -18.0
            ax = 0.1
            ay = 1.55  # lateral g to the right
            yaw_rate = 16.0
            gear = 2
        elif t < 14.5:
            # Phase 4: Fast right transition (heavy load on outside tyres FL, RL)
            # Inducing deliberate FL excess slip & thermal rise for degradation signature
            phase = "RIGHT_CORNER"
            throttle = 50.0
            brake = 0.0
            steer = 22.0
            ax = 0.2
            ay = -1.65
            yaw_rate = -18.5
            gear = 3
        else:
            # Phase 5: Straight exit
            phase = "STRAIGHT_EXIT"
            throttle = 100.0
            brake = 0.0
            steer = 0.0
            ax = 0.70
            ay = 0.0
            yaw_rate = 0.0
            gear = 4 if speed_mps < 50 else 5

        # Speed and distance integration
        speed_mps = max(5.0, min(85.0, speed_mps + ax * dt * 9.81 * 0.10))
        speed_kph = speed_mps * 3.6
        distance_m += speed_mps * dt

        # Dynamic Normal Loads (Total ~1600 kg = ~15,696 N baseline, 3924 N per corner)
        base_load = 3924.0
        # Pitch transfer (+ax shifts load to rear, -ax shifts load to front)
        pitch_transfer = -ax * 1100.0
        # Roll transfer (+ay shifts load to right tyres FR, RR; -ay shifts to FL, RL)
        roll_transfer = ay * 950.0

        load_fl = max(500.0, base_load - pitch_transfer - roll_transfer)
        load_fr = max(500.0, base_load - pitch_transfer + roll_transfer)
        load_rl = max(500.0, base_load + pitch_transfer - roll_transfer)
        load_rr = max(500.0, base_load + pitch_transfer + roll_transfer)

        # Thermal dynamics
        cooling_rate = 0.08 * dt
        # Braking heats front tyres heavily
        fl_surf += (brake * 0.015) - cooling_rate
        fr_surf += (brake * 0.015) - cooling_rate
        rl_surf += (brake * 0.005) - cooling_rate
        rr_surf += (brake * 0.005) - cooling_rate

        # Cornering scrub heats outside tyres
        if phase == "LEFT_CORNER":
            fr_surf += 0.45 * dt * abs(ay)
            rr_surf += 0.30 * dt * abs(ay)
        elif phase == "RIGHT_CORNER":
            # FL degradation effect: running 25% hotter under lateral load
            fl_surf += 0.65 * dt * abs(ay)
            rl_surf += 0.30 * dt * abs(ay)

        # Carcass temperature gradually tracks surface
        fl_carcass += (fl_surf - fl_carcass) * 0.03
        fr_carcass += (fr_surf - fr_carcass) * 0.03
        rl_carcass += (rl_surf - rl_carcass) * 0.03
        rr_carcass += (rr_surf - rr_carcass) * 0.03

        # Pressure tracks carcass temperature (Ideal gas approx ~ 0.01 bar / °C)
        p_fl = round(base_pressure_f + (fl_carcass - 80.0) * 0.012, 3)
        p_fr = round(base_pressure_f + (fr_carcass - 80.0) * 0.010, 3)
        p_rl = round(base_pressure_r + (rl_carcass - 76.0) * 0.010, 3)
        p_rr = round(base_pressure_r + (rr_carcass - 76.0) * 0.010, 3)

        # Slip calculations
        brake_slip = -0.08 * (brake / 100.0)
        accel_slip = 0.06 * (throttle / 100.0)

        # Slip angles from steering and lateral accel
        steer_rad = math.radians(steer)
        slip_angle_front = steer * 0.35 + (ay * 1.5)
        slip_angle_rear = -ay * 1.1

        # Excess slip on FL during right turn (degraded tyre grip loss symptom)
        fl_extra_slip = 0.03 if phase == "RIGHT_CORNER" else 0.0

        fl_wheel_speed = speed_mps * (1.0 + brake_slip - fl_extra_slip)
        fr_wheel_speed = speed_mps * (1.0 + brake_slip)
        rl_wheel_speed = speed_mps * (1.0 + accel_slip)
        rr_wheel_speed = speed_mps * (1.0 + accel_slip)

        fl_state = TyreState(
            corner=WheelCorner.FL,
            pressure_bar=p_fl,
            surface_temp_c=round(fl_surf, 2),
            carcass_temp_c=round(fl_carcass, 2),
            wheel_speed_mps=round(fl_wheel_speed, 2),
            slip_ratio=round(brake_slip - fl_extra_slip, 4),
            slip_angle_deg=round(slip_angle_front, 2),
            vertical_load_n=round(load_fl, 1),
        )

        fr_state = TyreState(
            corner=WheelCorner.FR,
            pressure_bar=p_fr,
            surface_temp_c=round(fr_surf, 2),
            carcass_temp_c=round(fr_carcass, 2),
            wheel_speed_mps=round(fr_wheel_speed, 2),
            slip_ratio=round(brake_slip, 4),
            slip_angle_deg=round(slip_angle_front, 2),
            vertical_load_n=round(load_fr, 1),
        )

        rl_state = TyreState(
            corner=WheelCorner.RL,
            pressure_bar=p_rl,
            surface_temp_c=round(rl_surf, 2),
            carcass_temp_c=round(rl_carcass, 2),
            wheel_speed_mps=round(rl_wheel_speed, 2),
            slip_ratio=round(accel_slip, 4),
            slip_angle_deg=round(slip_angle_rear, 2),
            vertical_load_n=round(load_rl, 1),
        )

        rr_state = TyreState(
            corner=WheelCorner.RR,
            pressure_bar=p_rr,
            surface_temp_c=round(rr_surf, 2),
            carcass_temp_c=round(rr_carcass, 2),
            wheel_speed_mps=round(rr_wheel_speed, 2),
            slip_ratio=round(accel_slip, 4),
            slip_angle_deg=round(slip_angle_rear, 2),
            vertical_load_n=round(load_rr, 1),
        )

        frame = TelemetryFrame(
            timestamp=t,
            session_id=session_id,
            lap=1 if distance_m < 2500 else 2,
            distance_m=round(distance_m, 2),
            vehicle=VehicleState(
                speed_mps=round(speed_mps, 2),
                speed_kph=round(speed_kph, 2),
                steer_angle_deg=round(steer, 2),
                throttle_pct=round(throttle, 1),
                brake_pct=round(brake, 1),
                longitudinal_accel_g=round(ax, 2),
                lateral_accel_g=round(ay, 2),
                yaw_rate_deg_s=round(yaw_rate, 2),
                gear=gear,
            ),
            tyres=FourWheelTyreStates(
                fl=fl_state,
                fr=fr_state,
                rl=rl_state,
                rr=rr_state,
            ),
            environment=EnvironmentState(
                ambient_temp_c=24.5,
                track_temp_c=36.2,
                track_condition="dry",
                track_friction_mu=1.0,
            ),
        )
        frames.append(frame)

    return frames


def save_demo_dataset(output_path: Union[str, Path] = "data/replay/demo_session.json") -> Path:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    frames = generate_demo_session(num_frames=80, dt=0.2)
    data = [frame.model_dump() for frame in frames]
    out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    path = save_demo_dataset()
    print(f"Successfully generated {path} with 80 canonical telemetry frames.")
