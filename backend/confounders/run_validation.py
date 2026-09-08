"""
TYRETRACE — Confounder Engine Validation Runner
Evaluates candidate non-tyre physical confounders on the 2023 Monza Qualifying session,
quantifies tyre evidence quality, and generates the session report and dataset.
"""

import json
from pathlib import Path
import sys

from backend.confounders.confounder_engine import ConfounderEngine
from backend.replay.engine import ReplayEngine
from backend.residual.residual_engine import ResidualEngine


def run_confounder_validation(
    telemetry_path: str = "data/replay/f1_2023_monza_q_ver.json",
    residuals_path: str = "data/replay/f1_2023_monza_q_ver_residuals.json",
    output_path: str = "data/replay/f1_2023_monza_q_ver_confounders.json",
):
    print("=" * 85)
    print(" TYRETRACE CONFOUNDER ANALYSIS ENGINE — REAL DATA VALIDATION")
    print("=" * 85)
    print(f"Telemetry Dataset : {telemetry_path}")
    print(f"Output Dataset    : {output_path}")

    # 1. Load Telemetry Frames
    replay = ReplayEngine()
    total_tel = replay.load_file(telemetry_path)
    tel_frames = []
    while replay.has_next():
        tel_frames.append(replay.step())
    print(f"Loaded Telemetry  : {total_tel} canonical frames")

    # 2. Process Residuals
    res_engine = ResidualEngine(epsilon=1.0, persistence_threshold=1.0)
    res_frames, res_report = res_engine.process_session(tel_frames)
    print(f"Processed Residuals: {len(res_frames)} frames (Valid: {res_report.valid_samples})")

    # 3. Process Confounders
    conf_engine = ConfounderEngine()
    conf_frames, conf_report = conf_engine.process_session(
        residual_frames=res_frames,
        telemetry_frames=tel_frames,
    )

    # 4. Save Output Dataset
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    serialized = {
        "report": conf_report.model_dump(),
        "confounder_frames": [cf.model_dump() for cf in conf_frames],
    }
    out_p.write_text(json.dumps(serialized, indent=2), encoding="utf-8")
    print(f"Saved Dataset     : {out_p} ({out_p.stat().st_size / 1024:.1f} KB)")
    print("-" * 85)

    # 5. Print Results
    print("\n" + "=" * 85)
    print(" SESSION CONFOUNDER IMPACT SUMMARY (2023 MONZA Q - MAX VERSTAPPEN)")
    print("=" * 85)
    print(f"  Total Processed Frames         : {conf_report.total_frames}")
    print(f"  Valid Telemetry Frames         : {conf_report.valid_frames}")
    print(f"  Frames with Confounder Flags   : {conf_report.frames_with_confounders} ({conf_report.frames_with_confounders / conf_report.total_frames * 100:.1f}%)")
    print(f"  DRS Affected Frames            : {conf_report.drs_affected_frames} ({conf_report.drs_affected_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  Heavy Braking Affected Frames  : {conf_report.braking_affected_frames} ({conf_report.braking_affected_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  Transient Affected Frames      : {conf_report.transient_affected_frames} ({conf_report.transient_affected_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  High Speed Affected Frames     : {conf_report.high_speed_affected_frames} ({conf_report.high_speed_affected_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  Poor Quality Frames            : {conf_report.poor_quality_frames}")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" TYRE EVIDENCE DISTRIBUTION")
    print("=" * 85)
    print(f"  STRONG_TYRE_EVIDENCE           : {conf_report.strong_tyre_evidence_frames} ({conf_report.strong_tyre_evidence_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  MODERATE_TYRE_EVIDENCE         : {conf_report.moderate_tyre_evidence_frames} ({conf_report.moderate_tyre_evidence_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  LOW_TYRE_EVIDENCE              : {conf_report.low_tyre_evidence_frames} ({conf_report.low_tyre_evidence_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  NON_TYRE_EXPLANATION_DOMINANT  : {conf_report.non_tyre_dominant_frames} ({conf_report.non_tyre_dominant_frames / conf_report.total_frames * 100:.1f}%)")
    print(f"  INSUFFICIENT_DATA              : {conf_report.insufficient_data_frames}")
    print(f"  Average Non-Tyre Score         : {conf_report.average_non_tyre_explanation_score:.3f}")
    print(f"  Average Tyre Evidence Quality  : {conf_report.average_tyre_evidence_quality:.3f}")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" SAMPLE EVALUATED CONFOUNDER FRAME (FRAME #25 - FULL THROTTLE DRS STRAIGHT)")
    print("=" * 85)
    sample_f = conf_frames[25]
    print(json.dumps(sample_f.model_dump(), indent=2))
    print("=" * 85)

    return conf_frames, conf_report


if __name__ == "__main__":
    run_confounder_validation()
