"""
TYRETRACE — Phase 10 Performance & Evaluation Benchmark
Runs end-to-end performance benchmarking and scientific model agreement evaluation.
Measures:
- Per-frame pipeline processing latency (mean, median, p95, p99, peak)
- Deterministic replay throughput (FPS)
- WebSocket JSON serialization latency
- AI, Physics, and Fusion evaluation on Stint 2 test dataset
"""

import json
import time
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from scipy.stats import spearmanr
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from backend.api.pipeline import UnifiedIntelligencePipeline
from backend.api.state import RuntimeState
from backend.replay.engine import ReplayEngine
from backend.schemas.telemetry import TelemetryFrame


def run_benchmark(
    replay_file: str = "data/replay/f1_2023_monza_q_ver.json",
    model_path: str = "data/ml/baseline_model.joblib",
    features_path: str = "data/ml/temporal_features.csv",
):
    print("=" * 60)
    print("TYRETRACE — PHASE 10 BENCHMARK & EVALUATION")
    print("=" * 60)

    # 1. Pipeline Replay Benchmarking
    print("\n--- 1. End-to-End Pipeline Performance Benchmark ---")
    replay = ReplayEngine(strict=False)
    total_frames = replay.load_file(replay_file)
    print(f"Loaded replay dataset: {replay_file} ({total_frames} frames)")

    pipeline = UnifiedIntelligencePipeline(model_path=model_path)
    state = RuntimeState()

    latencies_ms = []
    ws_serialization_ms = []
    tdi_scores = []
    physics_tdi_scores = []
    ai_tdi_scores = []
    residuals = []
    q_tyre_scores = []
    s_conf_scores = []

    t_start = time.perf_counter()
    for seq_idx, frame in enumerate(replay._parsed_frames, start=1):
        t0 = time.perf_counter()
        result = pipeline.process_frame(frame)
        t1 = time.perf_counter()
        latencies_ms.append((t1 - t0) * 1000.0)

        # Measure serialization latency
        t_ws0 = time.perf_counter()
        payload = {
            "type": "telemetry_update",
            "sequence": seq_idx,
            "timestamp": frame.timestamp_iso or f"{frame.timestamp:.3f}",
            "telemetry": frame.model_dump(),
            "physics": result.physics,
            "residual": result.residual.model_dump(),
            "confounders": result.confounders.model_dump(),
            "tdi": {
                "physics_tdi": result.physics_tdi,
                "ai_tdi": result.ai_tdi,
                "final_tdi": result.final_tdi,
                "state": result.tdi_frame.state.value,
                "trend": result.tdi_frame.trend.value,
                "confidence": result.tdi_frame.confidence,
                "model_reliability": result.model_reliability,
            },
            "blender": result.blender_payload.model_dump(),
        }
        json.dumps(payload)
        t_ws1 = time.perf_counter()
        ws_serialization_ms.append((t_ws1 - t_ws0) * 1000.0)

        state.update_from_pipeline_result(result)

        # Collect metrics
        tdi_scores.append(result.final_tdi)
        physics_tdi_scores.append(result.physics_tdi)
        ai_tdi_scores.append(result.ai_tdi)
        residuals.append(result.residual.acceleration_residual_mps2)
        q_tyre_scores.append(result.confounders.tyre_evidence_quality)
        s_conf_scores.append(result.confounders.non_tyre_explanation_score)

    t_total = time.perf_counter() - t_start

    fps = total_frames / t_total
    mean_lat = np.mean(latencies_ms)
    median_lat = np.median(latencies_ms)
    p95_lat = np.percentile(latencies_ms, 95)
    p99_lat = np.percentile(latencies_ms, 99)
    peak_lat = np.max(latencies_ms)
    mean_ws = np.mean(ws_serialization_ms)

    print(f"Total frames processed: {total_frames}")
    print(f"Total wall-clock time:  {t_total:.3f} s")
    print(f"Replay throughput:      {fps:.1f} frames/sec ({fps/20.0:.1f}x real-time 20 Hz)")
    print(f"Mean latency/frame:     {mean_lat:.2f} ms")
    print(f"Median latency:         {median_lat:.2f} ms")
    print(f"p95 latency:            {p95_lat:.2f} ms")
    print(f"p99 latency:            {p99_lat:.2f} ms")
    print(f"Peak latency:           {peak_lat:.2f} ms")
    print(f"Mean WS serialization:  {mean_ws:.3f} ms")

    valid_res = [r for r in residuals if r is not None]
    print("\n--- 2. Replay Signal Distribution ---")
    print(f"TDI range:             [{min(tdi_scores):.1f}, {max(tdi_scores):.1f}]")
    print(f"Average final TDI:     {np.mean(tdi_scores):.1f}")
    print(f"Residual r_ax range:   [{min(valid_res):.2f}, {max(valid_res):.2f}] m/s²")
    print(f"Average residual:      {np.mean(valid_res):.2f} m/s²")
    print(f"Average Q_tyre:        {np.mean(q_tyre_scores):.2f}")
    print(f"Average S_conf:        {np.mean(s_conf_scores):.2f}")

    # 2. Scientific Evaluation of Physics, AI, and Fusion on Stint 2
    print("\n--- 3. Scientific Model Agreement Evaluation (Stint 2 Test Set) ---")
    if Path(features_path).exists() and Path(model_path).exists():
        from backend.ml.baseline_model import BaselineDegradationModel
        from backend.ml.splits import split_by_groups

        df = pd.read_csv(features_path)
        split = split_by_groups(df, group_col="group_id", test_ratio=0.35, val_ratio=0.0)
        test_df = split.test_df
        print(f"Loaded test dataset: {split.test_groups} with {len(test_df)} samples")

        model = BaselineDegradationModel.load_model(model_path)
        preds = model.predict(test_df)

        y_ref = test_df["target_tdi"].values
        tyre_age = test_df["tyre_life"].values if "tyre_life" in test_df else test_df["tyre_age_laps"].values
        y_ai = np.array([p.predicted_degradation for p in preds])
        y_fused = np.array([p.final_fused_tdi for p in preds])
        y_phys = np.array([p.physics_tdi for p in preds])

        def eval_metrics(y_true, y_pred, name):
            mae = mean_absolute_error(y_true, y_pred)
            rmse = np.sqrt(mean_squared_error(y_true, y_pred))
            r2 = r2_score(y_true, y_pred)
            corr, _ = spearmanr(tyre_age, y_pred)
            print(f"[{name}]")
            print(f"  MAE:               {mae:.3f} points")
            print(f"  RMSE:              {rmse:.3f} points")
            print(f"  R^2 Agreement:     {r2:.4f}")
            print(f"  Age Monotonicity:  {corr:.4f}")
            return {"mae": mae, "rmse": rmse, "r2": r2, "monotonicity": corr}

        res_phys = eval_metrics(y_ref, y_phys, "Physics Baseline vs Reference")
        res_ai = eval_metrics(y_ref, y_ai, "AI Prediction vs Reference")
        res_fused = eval_metrics(y_ref, y_fused, "Physics + AI Fusion vs Reference")

        return {
            "performance": {
                "total_frames": total_frames,
                "fps": fps,
                "mean_latency_ms": mean_lat,
                "median_latency_ms": median_lat,
                "p95_latency_ms": p95_lat,
                "p99_latency_ms": p99_lat,
                "peak_latency_ms": peak_lat,
                "ws_serialization_ms": mean_ws,
            },
            "signals": {
                "tdi_min": min(tdi_scores),
                "tdi_max": max(tdi_scores),
                "tdi_mean": float(np.mean(tdi_scores)),
                "residual_mean": float(np.mean(valid_res)),
                "q_tyre_mean": float(np.mean(q_tyre_scores)),
                "s_conf_mean": float(np.mean(s_conf_scores)),
            },
            "evaluation": {
                "physics": res_phys,
                "ai": res_ai,
                "fusion": res_fused,
            },
        }

    return None


if __name__ == "__main__":
    run_benchmark()
