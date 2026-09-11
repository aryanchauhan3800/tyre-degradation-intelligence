"""
TYRETRACE — Real FastF1 Telemetry Residual Validation Runner
Processes official Formula 1 telemetry (2023 Monza Q - Max Verstappen) through
the Phase 4 Residual Engine, computes comprehensive statistical features, and persists
the normalized residual dataset.
"""

import json
from pathlib import Path
import sys

from backend.replay.engine import ReplayEngine
from backend.residual.residual_engine import ResidualEngine


def run_monza_residuals(
    input_dataset: str = "data/replay/f1_2023_monza_q_ver.json",
    output_dataset: str = "data/replay/f1_2023_monza_q_ver_residuals.json",
):
    in_path = Path(input_dataset)
    if not in_path.exists():
        print(f"Error: Input dataset {input_dataset} not found.", file=sys.stderr)
        sys.exit(1)

    print("=" * 85)
    print(" TYRETRACE RESIDUAL ENGINE — REAL FASTF1 TELEMETRY VALIDATION")
    print("=" * 85)
    print(f"Input Dataset  : {input_dataset}")
    print(f"Output Dataset : {output_dataset}")

    replay = ReplayEngine()
    total_loaded = replay.load_file(input_dataset)
    print(f"Loaded Frames  : {total_loaded} canonical frames (Session: {replay.session_id})")

    # Read all frames into list
    frames = []
    while replay.has_next():
        frames.append(replay.step())

    engine = ResidualEngine(epsilon=1.0, persistence_threshold=1.0)
    residual_frames, report = engine.process_session(frames)

    # Save residuals dataset
    out_path = Path(output_dataset)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    serialized_payload = {
        "report": report.model_dump(),
        "residuals": [f.model_dump() for f in residual_frames],
    }
    out_path.write_text(json.dumps(serialized_payload, indent=2), encoding="utf-8")
    print(f"Saved Dataset  : {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" RESIDUAL STATISTICAL SUMMARY (2023 MONZA QUALIFYING - VERSTAPPEN)")
    print("=" * 85)
    print(f"  Total Processed Samples        : {report.total_samples}")
    print(f"  Valid Residual Samples         : {report.valid_samples} ({report.valid_samples / report.total_samples * 100:.1f}%)")
    print(f"  Invalid / Rejected Samples     : {report.invalid_samples} ({report.invalid_samples / report.total_samples * 100:.1f}%)")
    print(f"  Residual Quality Confidence    : {report.overall_quality_confidence * 100:.1f}%")
    print(f"  Mean Residual (r_ax)           : {report.mean_residual:+.4f} m/s^2")
    print(f"  Standard Deviation (sigma)     : {report.std_residual:.4f} m/s^2")
    print(f"  Mean Absolute Residual (|r_ax|): {report.mean_abs_residual:.4f} m/s^2")
    print(f"  Maximum Absolute Residual      : {report.max_abs_residual:.4f} m/s^2")
    print("-" * 85)

    print("\n[LAP-LEVEL RESIDUAL SUMMARY]")
    for lap_sum in report.lap_summaries:
        print(f"  Lap {lap_sum.lap:02d}:")
        print(f"    Total Samples              : {lap_sum.sample_count}")
        print(f"    Valid Samples              : {lap_sum.valid_sample_count}")
        print(f"    Mean Residual              : {lap_sum.mean_residual:+.4f} m/s^2" if lap_sum.mean_residual else "    Mean Residual: N/A")
        print(f"    Mean Absolute Residual     : {lap_sum.abs_mean_residual:.4f} m/s^2" if lap_sum.abs_mean_residual else "    Mean Absolute Residual: N/A")
        print(f"    Standard Deviation         : {lap_sum.std_residual:.4f} m/s^2" if lap_sum.std_residual else "    Standard Deviation: N/A")
        print(f"    Min / Max Residual         : {lap_sum.residual_min:+.4f} / {lap_sum.residual_max:+.4f} m/s^2" if lap_sum.residual_min else "    Min/Max: N/A")
        print(f"    Fitted Linear Trend Slope  : {lap_sum.residual_slope:+.4f} m/s^3" if lap_sum.residual_slope else "    Slope: N/A")
        print(f"    Persistence Ratio (|r|>=1) : {lap_sum.persistence_ratio * 100:.1f}%" if lap_sum.persistence_ratio is not None else "    Persistence: N/A")
        print(f"    Lap Quality Confidence     : {lap_sum.residual_quality_confidence * 100:.1f}%")
        print(f"    Compound / Tyre Age / Stint: {lap_sum.compound} / {lap_sum.tyre_age} laps / Stint {lap_sum.stint}")

    print("\n" + "=" * 85)
    print(" SAMPLE RESIDUAL FRAMES (JSON REPRESENTATION)")
    print("=" * 85)
    # Print Frame 2 (first valid derived frame)
    sample_valid = residual_frames[1] if len(residual_frames) > 1 else residual_frames[0]
    print(f"--- FRAME #{sample_valid.lap} (T+{sample_valid.timestamp:.2f}s) ---")
    print(json.dumps(sample_valid.model_dump(), indent=2))

    print("\n" + "=" * 85)
    print(" SCIENTIFIC PRINCIPLE:")
    print(" " + report.scientific_note)
    print("=" * 85)


if __name__ == "__main__":
    run_monza_residuals()
