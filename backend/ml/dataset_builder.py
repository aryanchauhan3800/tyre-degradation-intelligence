"""
TYRETRACE — ML Dataset Builder
Orchestrates end-to-end processing of multi-lap race telemetry:
TelemetryFrames -> Residual Engine -> Confounder Engine -> TDI Engine -> Temporal Window Features.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from backend.confounders.confounder_engine import ConfounderEngine
from backend.confounders.schemas import ConfounderFrame
from backend.ml.features import (
    FEATURE_COLUMNS_MODEL_E,
    WindowFeatureVector,
    build_temporal_windows,
)
from backend.residual.residual_engine import ResidualEngine
from backend.residual.schemas import ResidualFrame
from backend.schemas.telemetry import TelemetryFrame
from backend.tdi.schemas import TDIFrame
from backend.tdi.tdi_engine import TDIEngine
from backend.telemetry.fastf1_adapter import FastF1Adapter, FastF1SessionConfig

logger = logging.getLogger(__name__)


class MLDatasetBuilder:
    """
    Builds supervised temporal feature datasets from multi-lap race sessions.
    """

    def __init__(
        self,
        window_size: int = 15,
        stride: int = 5,
        future_horizon: int = 15,
    ):
        self.window_size = window_size
        self.stride = stride
        self.future_horizon = future_horizon

    def build_from_telemetry(
        self,
        telemetry_frames: List[TelemetryFrame],
        session_id: str = "RACE_SESSION",
    ) -> Tuple[List[WindowFeatureVector], pd.DataFrame]:
        """
        Runs the canonical physics, residual, confounder, and TDI engines sequentially,
        then aggregates into temporal window vectors.
        """
        if len(telemetry_frames) < self.window_size:
            raise ValueError(
                f"Insufficient telemetry frames ({len(telemetry_frames)}) for window_size {self.window_size}"
            )

        logger.info(f"Processing {len(telemetry_frames)} telemetry frames through Residual Engine...")
        res_engine = ResidualEngine(epsilon=1.0, persistence_threshold=1.0)
        res_frames, _ = res_engine.process_session(telemetry_frames)

        logger.info("Processing through Confounder Engine...")
        conf_engine = ConfounderEngine()
        conf_frames, _ = conf_engine.process_session(
            residual_frames=res_frames,
            telemetry_frames=telemetry_frames,
        )

        logger.info("Processing through TDI Engine...")
        tdi_engine = TDIEngine(trajectory_window=self.window_size, min_samples=5)
        tdi_frames: List[TDIFrame] = []
        for i, cf in enumerate(conf_frames):
            tf = telemetry_frames[i]
            tyre_age = tf.tyres.fl.tyre_life_laps
            compound = tf.tyres.fl.compound
            stint = tf.tyres.fl.stint
            frame = tdi_engine.evaluate_frame(
                confounder_frame=cf,
                window_features=None,
                tyre_age_laps=tyre_age,
                compound=compound,
                stint=stint,
            )
            tdi_frames.append(frame)

        logger.info("Extracting temporal window features...")
        window_vectors = build_temporal_windows(
            tel_frames=telemetry_frames,
            res_frames=res_frames,
            conf_frames=conf_frames,
            tdi_frames=tdi_frames,
            window_size=self.window_size,
            stride=self.stride,
            future_horizon=self.future_horizon,
        )

        # Convert to tabular DataFrame for ML
        rows = []
        for w in window_vectors:
            row = {
                "window_id": w.window_id,
                "session_id": w.session_id,
                "driver": w.driver,
                "stint_number": w.stint_number,
                "compound": w.compound,
                "lap": w.lap,
                "timestamp_start": w.timestamp_start,
                "timestamp_end": w.timestamp_end,
                "group_id": w.group_id,
                "target_tdi": w.target_tdi_pseudo_label,
                "target_future_delta": w.target_future_trajectory_delta,
            }
            row.update(w.features)
            rows.append(row)

        df = pd.DataFrame(rows)
        logger.info(f"Constructed {len(df)} temporal feature vectors.")
        return window_vectors, df

    def save_dataset(
        self,
        df: pd.DataFrame,
        window_vectors: List[WindowFeatureVector],
        output_csv_path: str = "data/ml/temporal_features.csv",
        output_json_path: str = "data/ml/temporal_features.json",
    ) -> None:
        """
        Saves tabular CSV and structured JSON dataset.
        """
        csv_p = Path(output_csv_path)
        json_p = Path(output_json_path)
        csv_p.parent.mkdir(parents=True, exist_ok=True)
        json_p.parent.mkdir(parents=True, exist_ok=True)

        df.to_csv(csv_p, index=False)
        serialized = [w.to_dict() for w in window_vectors]
        json_p.write_text(json.dumps(serialized, indent=2), encoding="utf-8")
        logger.info(f"Saved dataset: CSV ({csv_p.stat().st_size / 1024:.1f} KB), JSON ({json_p.stat().st_size / 1024:.1f} KB)")
