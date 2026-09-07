"""
TYRETRACE — Telemetry Replay CLI
Streams and visually renders canonical telemetry frames from replay datasets.
"""

import argparse
from pathlib import Path
import sys
import time

from backend.replay.engine import ReplayEngine
from backend.schemas.telemetry import TelemetryFrame


def render_frame_line(frame: TelemetryFrame, frame_idx: int, total: int) -> None:
    veh = frame.vehicle
    t = frame.tyres

    steer_str = f"{veh.steer_angle_deg:+5.1f}°" if veh.steer_angle_deg is not None else "  N/A "
    
    def fmt_tyre(tyre) -> str:
        temp = f"{tyre.surface_temp_c:5.1f}°C" if tyre.surface_temp_c is not None else "  N/A "
        press = f"{tyre.pressure_bar:.2f}b" if tyre.pressure_bar is not None else " N/A"
        compound = f"[{tyre.compound[:1]}]" if tyre.compound else ""
        return f"{temp} {press}{compound}"

    sys.stdout.write(
        f"\r[{frame_idx:03d}/{total:03d}] "
        f"T+{frame.timestamp:06.1f}s | "
        f"Lap {frame.lap:02d} | "
        f"Speed: {veh.speed_kph:5.1f} km/h | "
        f"Steer: {steer_str} | "
        f"Thr/Brk: {veh.throttle_pct:3.0f}%/{veh.brake_pct:3.0f}% | "
        f"FL: {fmt_tyre(t.fl)} | "
        f"FR: {fmt_tyre(t.fr)} | "
        f"RL: {fmt_tyre(t.rl)} | "
        f"RR: {fmt_tyre(t.rr)}"
    )
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser(description="TYRETRACE Canonical Telemetry Replay")
    parser.add_argument(
        "--file",
        type=str,
        default="data/replay/demo_session.json",
        help="Path to replay JSON file (default: data/replay/demo_session.json)",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=5.0,
        help="Playback speed multiplier (0.0 = max/instant, 1.0 = real-time, 5.0 = 5x)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of frames to replay",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print each frame on a new line with detailed corner breakdown",
    )

    args = parser.parse_args()
    engine = ReplayEngine(strict=True)

    print("=" * 80)
    print(" TYRETRACE TELEMETRY REPLAY ENGINE — PHASE 1")
    print("=" * 80)
    print(f"Dataset : {args.file}")
    print(f"Speed   : {'Instant' if args.speed <= 0 else f'{args.speed}x'}")

    try:
        count = engine.load_file(args.file)
        print(f"Loaded  : {count} valid canonical frames (Session: {engine.session_id})")
        print("-" * 80)
    except Exception as exc:
        print(f"Error loading replay: {exc}", file=sys.stderr)
        sys.exit(1)

    start_t = time.time()
    rendered = 0
    total_to_run = min(count, args.limit) if args.limit else count

    for frame in engine.stream(playback_speed=args.speed):
        rendered += 1
        if args.verbose:
            print(
                f"Frame {rendered:02d} | T+{frame.timestamp:05.1f}s | Lap {frame.lap} | "
                f"V: {frame.vehicle.speed_kph:.1f} km/h | Steer: {frame.vehicle.steer_angle_deg:+.1f}° | "
                f"FL: {frame.tyres.fl.surface_temp_c:.1f}°C/{frame.tyres.fl.pressure_bar:.2f}b | "
                f"FR: {frame.tyres.fr.surface_temp_c:.1f}°C/{frame.tyres.fr.pressure_bar:.2f}b | "
                f"RL: {frame.tyres.rl.surface_temp_c:.1f}°C/{frame.tyres.rl.pressure_bar:.2f}b | "
                f"RR: {frame.tyres.rr.surface_temp_c:.1f}°C/{frame.tyres.rr.pressure_bar:.2f}b"
            )
        else:
            render_frame_line(frame, rendered, total_to_run)

        if args.limit and rendered >= args.limit:
            break

    elapsed = time.time() - start_t
    print()
    print("-" * 80)
    print(f"Replay finished: {rendered} frames streamed in {elapsed:.2f}s.")
    print("=" * 80)


if __name__ == "__main__":
    main()
