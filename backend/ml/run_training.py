"""
TYRETRACE — ML Training & Ablation Pipeline Runner
Orchestrates multi-lap race dataset ingestion, temporal feature extraction,
leakage-safe splitting, model training, ablation studies, and physics-AI fusion evaluation.
"""

import json
import logging
from pathlib import Path
import sys
import numpy as np
import pandas as pd

from backend.ml.baseline_model import BaselineDegradationModel
from backend.ml.dataset_builder import MLDatasetBuilder
from backend.ml.evaluation import calculate_evaluation_metrics, run_ablation_study
from backend.ml.features import FEATURE_COLUMNS_MODEL_E
from backend.ml.splits import split_by_groups, verify_no_leakage
from backend.telemetry.fastf1_adapter import FastF1Adapter, FastF1SessionConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("run_training")


def run_ml_pipeline(
    year: int = 2023,
    event: str = "Monza",
    session_type: str = "R",
    driver: str = "VER",
    lap_limit: int = 35,
    window_size: int = 15,
    stride: int = 5,
):
    print("=" * 85)
    print(" TYRETRACE TEMPORAL AI DEGRADATION MODEL — TRAINING & ABLATION PIPELINE")
    print("=" * 85)
    print(f"Target Session   : {year} {event} [{session_type}] — Driver: {driver}")
    print(f"Lap Horizon      : First {lap_limit} laps (encompassing Stint 1 Medium & Stint 2 Hard)")
    print(f"Window / Stride  : {window_size} frames / {stride} frames")
    print("-" * 85)

    # 1. Ingest Multi-Lap Telemetry via FastF1Adapter
    cfg = FastF1SessionConfig(
        year=year,
        event=event,
        session=session_type,
        driver=driver,
        lap_limit=lap_limit,
        fastest_only=False,
    )
    adapter = FastF1Adapter(config=cfg)
    logger.info("Loading multi-lap race telemetry...")
    tel_frames, meta = adapter.load_session_telemetry(cfg)
    print(f"Loaded Telemetry : {len(tel_frames)} canonical frames across {meta.get('laps_processed', 0)} laps")
    print(f"Tyre Compounds   : {meta.get('compounds', [])}")
    print(f"TyreLife Range   : {meta.get('tyre_life_range')}")
    print("-" * 85)

    # 2. Build Temporal Features through Physics, Confounder, and TDI Engines
    builder = MLDatasetBuilder(window_size=window_size, stride=stride)
    window_vectors, df = builder.build_from_telemetry(tel_frames, session_id=f"{year}_{event}_{session_type}_{driver}")
    builder.save_dataset(
        df,
        window_vectors,
        output_csv_path="data/ml/temporal_features.csv",
        output_json_path="data/ml/temporal_features.json",
    )
    print(f"Generated Windows: {len(df)} feature vectors (Columns: {len(df.columns)})")
    print("-" * 85)

    # 3. Leakage-Safe Group Partitioning (Split by Stints)
    logger.info("Executing leakage-safe group split by stint...")
    split = split_by_groups(df, group_col="group_id", test_ratio=0.35, val_ratio=0.0)
    train_df = split.train_df
    test_df = split.test_df

    # Verify zero leakage
    leak_free, violations = verify_no_leakage(train_df, test_df, group_col="group_id")
    if not leak_free:
        raise RuntimeError(f"Leakage validation failed: {violations}")
    print(f"Train Set        : {len(train_df)} samples (Groups: {split.train_groups})")
    print(f"Test Set         : {len(test_df)} samples (Groups: {split.test_groups})")
    print(f"Leakage Audit    : PASSED (Zero group/temporal overlap)")
    print("-" * 85)

    # 4. Train Interpretable Baseline Model (Model E: Physics-Informed Full Set)
    active_features = [c for c in FEATURE_COLUMNS_MODEL_E if c in train_df.columns]
    model = BaselineDegradationModel(
        model_type="random_forest",
        n_estimators=100,
        max_depth=6,
        random_state=42,
        fusion_alpha=0.60,
    )
    model.fit(train_df, feature_cols=active_features, target_col="target_tdi")
    model.save_model("data/ml/baseline_model.joblib")

    # 5. Predict and Evaluate on Test Set
    preds = model.predict(test_df)
    y_test = test_df["target_tdi"].values
    y_pred_ai = np.array([p.predicted_degradation for p in preds])
    y_pred_fused = np.array([p.final_fused_tdi for p in preds])
    y_physics = np.array([p.physics_tdi for p in preds])

    metrics_ai = calculate_evaluation_metrics(
        y_true=y_test,
        y_pred=y_pred_ai,
        tyre_ages=test_df["tyre_life"].values,
        confounder_scores=test_df["non_tyre_explanation_score"].values,
    )

    metrics_fusion = calculate_evaluation_metrics(
        y_true=y_test,
        y_pred=y_pred_fused,
        tyre_ages=test_df["tyre_life"].values,
        confounder_scores=test_df["non_tyre_explanation_score"].values,
    )

    # 6. Feature Importance
    top_importances = list(model.feature_importances_.items())[:8]

    # 7. Ablation Study
    print("\n" + "=" * 85)
    print(" 5-STAGE FEATURE ABLATION STUDY RESULTS")
    print("=" * 85)
    ablation_results = run_ablation_study(train_df, test_df, target_col="target_tdi")
    for model_name, res in ablation_results.items():
        print(f"  {model_name:<30} | Feats: {res['feature_count']:>2} | MAE: {res['mae']:>5.2f} | RMSE: {res['rmse']:>5.2f} | R²: {res['r2']:>6.3f} | Monotonicity: {res['age_monotonicity']:>5.2f}")
    print("-" * 85)

    # 8. Summary Output
    print("\n" + "=" * 85)
    print(" TEST SET EVALUATION: AI VS PHYSICS VS FUSION")
    print("=" * 85)
    print(f"  AI Alone (Model E)       | MAE: {metrics_ai.mae:.2f} | RMSE: {metrics_ai.rmse:.2f} | R²: {metrics_ai.r2:.3f}")
    print(f"  Fused (60% Phys + 40% AI)| MAE: {metrics_fusion.mae:.2f} | RMSE: {metrics_fusion.rmse:.2f} | R²: {metrics_fusion.r2:.3f}")
    print(f"  Mean Test Reliability    | {np.mean([p.model_reliability for p in preds]):.3f}")
    print("-" * 85)

    print("\n" + "=" * 85)
    print(" TOP 8 FEATURE IMPORTANCES (MODEL E)")
    print("=" * 85)
    for feat, imp in top_importances:
        print(f"  {feat:<30}: {imp:.4f}")
    print("-" * 85)

    return {
        "dataset_samples": len(df),
        "train_samples": len(train_df),
        "test_samples": len(test_df),
        "metrics_ai": metrics_ai.to_dict(),
        "metrics_fusion": metrics_fusion.to_dict(),
        "ablation_results": ablation_results,
        "feature_importances": model.feature_importances_,
    }


if __name__ == "__main__":
    run_ml_pipeline()
