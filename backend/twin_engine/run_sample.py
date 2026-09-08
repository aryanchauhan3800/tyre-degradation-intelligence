"""
TYRETRACE — Twin Engine Real Telemetry Verification Runner
Evaluates the first-principles Physics Digital Twin against real normalized
Formula 1 session telemetry (2023 Monza Qualifying - Max Verstappen).
"""

import json
from pathlib import Path
import sys

from backend.replay.engine import ReplayEngine
from backend.twin_engine.interface import TwinEngine
from backend.twin_engine.parameters import PhysicsParameters


def run_monza_verification(dataset_path: str = "data/replay/f1_2023_monza_q_ver.json"):
    path = Path(dataset_path)
    if not path.exists():
        print(f"Error: Dataset {dataset_path} not found.", file=sys.stderr)
        sys.exit(1)

    print("=" * 85)
    print(" TYRETRACE FIRST-PRINCIPLES PHYSICS TWIN ENGINE — REAL DATA EVALUATION")
    print("=" * 85)
    print(f"Dataset : {dataset_path}")

    replay = ReplayEngine()
    total_frames = replay.load_file(dataset_path)
    print(f"Loaded  : {total_frames} canonical frames (Session: {replay.session_id})")

    params = PhysicsParameters()
    twin = TwinEngine(parameters=params)

    # Process all frames through the physics engine
    twin_outputs = []
    while replay.has_next():
        frame = replay.step()
        out = twin.step(frame)
        twin_outputs.append((frame, out))

    print(f"Physics : Successfully evaluated {len(twin_outputs)} time-steps through TwinEngine.")
    print("-" * 85)

    # Pick 3 representative frames:
    # 1. High-speed straight (Throttle 100%, Speed > 300 km/h)
    # 2. Braking event (Brake > 0%)
    # 3. Corner apex / exit transition
    sample_straight = None
    sample_braking = None
    sample_corner = None

    for frame, out in twin_outputs:
        if sample_straight is None and frame.vehicle.throttle_pct == 100.0 and frame.vehicle.speed_kph > 320.0 and out.derived_acceleration_mps2 is not None:
            sample_straight = (frame, out)
        if sample_braking is None and frame.vehicle.brake_pct > 0.0 and out.derived_acceleration_mps2 is not None:
            sample_braking = (frame, out)
        if sample_corner is None and frame.vehicle.speed_kph < 120.0 and frame.vehicle.throttle_pct > 20.0 and out.derived_acceleration_mps2 is not None:
            sample_corner = (frame, out)

    samples_to_show = [
        ("HIGH-SPEED STRAIGHT (FULL THROTTLE / 320+ KM/H)", sample_straight or twin_outputs[5]),
        ("HEAVY BRAKING ZONE", sample_braking or twin_outputs[35]),
        ("CORNER EXIT ACCELERATION", sample_corner or twin_outputs[45]),
    ]

    for label, (frame, out) in samples_to_show:
        v = frame.vehicle
        print("\n" + "=" * 85)
        print(f" PHASE: {label}")
        print("=" * 85)
        print(f"  Timestamp                       : T+{out.timestamp:06.2f}s (Lap {out.lap})")
        print(f"  Input Speed (Measured)          : {out.actual_speed_mps:.2f} m/s ({v.speed_kph:.1f} km/h)")
        print(f"  Input Throttle (Measured)       : {v.throttle_pct:.1f} %")
        print(f"  Input Brake (Measured)          : {v.brake_pct:.1f} %")
        print(f"  Input Gear / RPM (Measured)     : Gear {v.gear} | {v.rpm} RPM" if v.rpm else f"  Input Gear (Measured)           : Gear {v.gear}")
        print(f"  Derived Acceleration            : {out.derived_acceleration_mps2:+.3f} m/s^2 (DERIVED: Delta v / Delta t from FastF1 speed)")
        print(f"  Calculated Aero Drag Force      : {out.expected_drag_n:+.1f} N (0.5 * rho * Cd * A * v^2)")
        print(f"  Calculated Rolling Resistance   : {out.expected_rolling_resistance_n:+.1f} N (Crr * m * g)")
        print(f"  Modelled Traction Force         : {out.expected_traction_force_n:+.1f} N (P_engine / v capped by tyre grip)")
        print(f"  Modelled Brake Force            : {out.expected_brake_force_n:+.1f} N (pedal clamp capped by tyre grip)")
        print(f"  -------------------------------------------------------------------")
        print(f"  EXPECTED ACCELERATION (Twin)    : {out.expected_acceleration_mps2:+.3f} m/s^2  [ (F_tr - F_drag - F_roll - F_brk) / m ]")
        print(f"  Expected Normal Load (Fz_total) : {out.expected_vertical_load_n:.1f} N")
        print(f"  Expected Load Transfer (DeltaFz): {out.expected_load_transfer_n:.1f} N (Front: {out.expected_fz_front_n:.1f} N, Rear: {out.expected_fz_rear_n:.1f} N)")
        print(f"  Thermal Model Status            : {out.thermal_status} (dT/dt = {out.thermal_prediction_k_per_s})")
        print(f"  Digital Twin Model Confidence   : {out.model_confidence * 100:.0f} %")
        print(f"  Unavailable Physics Signals     : {len(out.unavailable_inputs)} channels strictly None (unmeasured)")

    print("\n" + "=" * 85)
    print(" SAMPLE RAW TWIN OUTPUT JSON (FRAME #25):")
    print("=" * 85)
    print(json.dumps(twin_outputs[25][1].model_dump(), indent=2))
    print("=" * 85)


if __name__ == "__main__":
    run_monza_verification()
