"""
TYRETRACE — FastF1 Telemetry Download CLI
Command line interface to ingest, inspect, and normalize official Formula 1 session telemetry.

Usage:
    python -m backend.telemetry.download --year 2023 --event Monza --session Q --driver VER --fastest
"""

import argparse
import json
from pathlib import Path
import sys

from backend.telemetry.fastf1_adapter import FastF1Adapter, FastF1SessionConfig


def main():
    parser = argparse.ArgumentParser(description="Download and normalize official F1 telemetry using FastF1.")
    parser.add_argument("--year", type=int, default=2023, help="Season / Year (default: 2023)")
    parser.add_argument("--event", type=str, default="Monza", help="Event name or Grand Prix (default: Monza)")
    parser.add_argument("--session", type=str, default="Q", help="Session code: FP1, FP2, FP3, Q, S, R (default: Q)")
    parser.add_argument("--driver", type=str, default="VER", help="Driver 3-letter code (default: VER)")
    parser.add_argument("--laps", type=int, default=None, help="Limit number of laps to ingest (default: all)")
    parser.add_argument("--fastest", action="store_true", help="Ingest only the driver's single fastest lap")
    parser.add_argument("--output", type=str, default=None, help="Target JSON replay output path")

    args = parser.parse_args()

    clean_event = args.event.replace(" ", "_").lower()
    default_out = f"data/replay/f1_{args.year}_{clean_event}_{args.session.lower()}_{args.driver.lower()}.json"
    target_out = args.output or default_out

    config = FastF1SessionConfig(
        year=args.year,
        event=args.event,
        session=args.session,
        driver=args.driver,
        lap_limit=args.laps,
        fastest_only=args.fastest,
    )

    print("=" * 80)
    print(" TYRETRACE FASTF1 INGESTION ENGINE")
    print("=" * 80)
    print(f"Target Session : {args.year} {args.event} [{args.session}]")
    print(f"Driver         : {args.driver}")
    print(f"Mode           : {'Fastest Lap Only' if args.fastest else (f'First {args.laps} Laps' if args.laps else 'All Laps')}")
    print(f"Output Path    : {target_out}")
    print("-" * 80)

    adapter = FastF1Adapter(config=config)

    try:
        frames, meta = adapter.load_session_telemetry(config=config)
    except Exception as exc:
        print(f"Ingestion failed: {exc}", file=sys.stderr)
        sys.exit(1)

    # Save normalized dataset
    out_file = adapter.save_replay_data(frames, target_out)

    print("\n" + "=" * 80)
    print(" INGESTION & NORMALIZATION REPORT")
    print("=" * 80)
    print(f"Event Name               : {meta['event']}")
    print(f"Total Session Laps       : {meta['total_session_laps']}")
    print(f"Driver Laps Processed    : {meta['driver_laps_loaded']}")
    print(f"Normalized Frames Saved  : {meta['telemetry_frames_count']}")
    print(f"Saved Replay File        : {out_file} ({out_file.stat().st_size / 1024:.1f} KB)")
    print("-" * 80)

    print("\n[1] AVAILABLE FASTF1 COLUMNS INSPECTED:")
    for col in meta["available_columns"]:
        print(f"  + {col}")

    print("\n[2] MAPPED CANONICAL FIELDS:")
    print("  + timestamp (from FastF1 SessionTime/Time seconds)")
    print("  + timestamp_iso (from FastF1 Date)")
    print("  + session_id, lap, driver")
    print("  + distance_m (from Distance), relative_distance (from RelativeDistance)")
    print("  + vehicle.speed_kph (from Speed), vehicle.speed_mps (derived)")
    print("  + vehicle.throttle_pct (from Throttle), vehicle.brake_pct (from Brake)")
    print("  + vehicle.gear (from nGear), vehicle.rpm (from RPM), vehicle.drs (from DRS)")
    print("  + vehicle.position_x, position_y, position_z (from X, Y, Z)")
    print("  + tyres.fl/fr/rl/rr.compound (from Lap Compound)")
    print("  + tyres.fl/fr/rl/rr.tyre_life_laps (from Lap TyreLife)")
    print("  + tyres.fl/fr/rl/rr.stint (from Lap Stint)")
    print("  + environment.ambient_temp_c (from Weather AirTemp)")
    print("  + environment.track_temp_c (from Weather TrackTemp)")
    print("  + environment.humidity_pct, air_pressure_mbar, wind_speed_mps, wind_direction_deg, rainfall")

    print("\n[3] UNAVAILABLE FIELDS (PRESERVED STRICTLY AS NULL/NONE - NO FABRICATION):")
    for col in meta["unavailable_columns"]:
        print(f"  - {col}: null")

    if frames:
        print("\n[4] GENERATED NORMALIZED DATA SAMPLE (FRAME #1):")
        sample_dict = frames[0].model_dump()
        print(json.dumps(sample_dict, indent=2))

    print("\n" + "=" * 80)
    print(" FASTF1 INGESTION COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
