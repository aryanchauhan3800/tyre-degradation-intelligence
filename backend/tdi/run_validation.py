"""
TYRETRACE — TDI Engine Validation Runner
Processes 2023 Monza Qualifying telemetry through the full pipeline:
Telemetry -> Residual Engine -> Confounder Engine -> TDI Engine
Generates output replay JSON at data/replay/f1_2023_monza_q_ver_tdi.json
"""

from collections import Counter
import json
from pathlib import Path
import sys

import numpy as np

from backend.confounders.confounder_engine import ConfounderEngine
from backend.replay.engine import ReplayEngine
from backend.residual.residual_engine import ResidualEngine
from backend.tdi.tdi_engine import TDIEngine


def run_tdi_validation(
    telemetry_path: str = "data/replay/f1_2023_monza_q_ver.json",
    output_path: str = "data/replay/f1_2023_monza_q_ver_tdi.json",
):
    print("=" * 85)
    print(" TYRETRACE TYRE DEGRADATION INDEX (TDI) ENGINE — VALIDATION RUNNER")
    print("=" * 85)
    print(f"Input Telemetry : {telemetry_path}")
    print(f"Output Dataset  : {output_path}")

    # 1. Load Telemetry Frames
    replay = ReplayEngine()
    total_tel = replay.load_file(telemetry_path)
    tel_frames = []
    while replay.has_next():
        tel_frames.append(replay.step())
    print(f"Loaded Telemetry: {total_tel} canonical frames")

    # 2. Process Residuals
    res_engine = ResidualEngine(epsilon=1.0, persistence_threshold=1.0)
    res_frames, res_report = res_engine.process_session(tel_frames)
    print(f"Processed Residuals: {len(res_frames)} frames (Valid: {res_report.valid_samples})")

    # 3. Process Confounder Analysis
    conf_engine = ConfounderEngine()
    conf_frames, conf_report = conf_engine.process_session(
        residual_frames=res_frames,
        telemetry_frames=tel_frames,
    )
    print(f"Evaluated Confounders: {len(conf_frames)} frames")

    # 4. Process TDI Engine
    tdi_engine = TDIEngine(trajectory_window=15, min_samples=5)
    
    # Extract tyre age and compound context from initial frame if present
    initial_tel = tel_frames[0]
    tyre_age = initial_tel.tyres.fl.tyre_life_laps
    compound = initial_tel.tyres.fl.compound
    stint = initial_tel.tyres.fl.stint

    # Feed frames into TDIEngine
    tdi_frames: list = []
    for i, cf in enumerate(conf_frames):
        # Pass rolling features from residual engine if present
        rf = res_frames[i] if i < len(res_frames) else None
        # We can pass None or rolling features
        frame = tdi_engine.evaluate_frame(
            confounder_frame=cf,
            window_features=None,
            tyre_age_laps=tyre_age,
            compound=compound,
            stint=stint,
        )
        tdi_frames.append(frame)

    session_report = tdi_engine.generate_session_report(
        tdi_frames, session_id="F1_2023_MONZA_Q_VER"
    )

    # 5. Save Output Dataset
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    serialized = {
        "report": session_report.model_dump(),
        "tdi_frames": [tf.model_dump() for tf in tdi_frames],
    }
    out_p.write_text(json.dumps(serialized, indent=2), encoding="utf-8")
    print(f"Saved Replay Dataset: {out_p} ({out_p.stat().st_size / 1024:.1f} KB)")
    print("-" * 85)

    # 6. Print Statistics
    tdi_vals = [f.tdi for f in tdi_frames]
    conf_vals = [f.confidence for f in tdi_frames]
    states = Counter(f.state for f in tdi_frames)
    trends = Counter(f.trend for f in tdi_frames)

    print("\n" + "=" * 85)
    print(" TDI SESSION SUMMARY (2023 MONZA Q - MAX VERSTAPPEN)")
    print("=" * 85)
    print(f"  Total Frames Processed         : {len(tdi_frames)}")
    print(f"  Total Laps Evaluated           : {session_report.total_laps}")
    print(f"  Average TDI                    : {session_report.average_tdi:.2f}")
    print(f"  Minimum TDI                    : {session_report.minimum_tdi:.2f}")
    print(f"  Maximum TDI                    : {session_report.maximum_tdi:.2f}")
    print(f"  Final TDI                      : {session_report.final_tdi:.2f}")
    print(f"  Session Trend                  : {session_report.session_tdi_trend.value}")
    print(f"  Overall Degradation State      : {session_report.degradation_state.value}")
    print(f"  Overall Confidence             : {session_report.overall_confidence:.3f}")
    print(f"  Tyre Age Range (Laps)          : {session_report.tyre_age_range}")
    print(f"  Average Evidence Quality       : {session_report.average_evidence_quality:.3f}")
    print(f"  Average Non-Tyre Explanation   : {session_report.average_non_tyre_score:.3f}")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" DEGRADATION STATE DISTRIBUTION")
    print("=" * 85)
    for state, count in states.items():
        pct = (count / len(tdi_frames)) * 100
        print(f"  {state.value:<30}: {count:>4} frames ({pct:>5.1f}%)")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" TRAJECTORY TREND DISTRIBUTION")
    print("=" * 85)
    for trend, count in trends.items():
        pct = (count / len(tdi_frames)) * 100
        print(f"  {trend.value:<30}: {count:>4} frames ({pct:>5.1f}%)")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" SAMPLE EVALUATED TDI FRAME (#50)")
    print("=" * 85)
    sample_frame = tdi_frames[50]
    print(json.dumps(sample_frame.model_dump(), indent=2))
    print("=" * 85)

    return tdi_frames, session_report


if __name__ == "__main__":
    run_tdi_validation()
