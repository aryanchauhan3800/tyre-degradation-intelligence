"""
TYRETRACE — Real-Time Unified Intelligence Pipeline
The single authoritative orchestration layer executing the end-to-end chain:
TelemetryFrame -> Physics Twin -> Residual Engine -> Confounder Engine -> TDI Engine -> AI Model -> Fusion.
"""

from collections import deque
from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from backend.blender.bridge import BlenderBridge
from backend.blender.schemas import BlenderFramePayload
from backend.confounders.confounder_engine import ConfounderEngine
from backend.confounders.schemas import ConfounderFrame
from backend.ml.baseline_model import BaselineDegradationModel
from backend.ml.features import extract_window_features
from backend.residual.residual_engine import ResidualEngine
from backend.residual.schemas import ResidualFrame
from backend.schemas.telemetry import TelemetryFrame
from backend.tdi.schemas import TDIFrame
from backend.tdi.tdi_engine import TDIEngine
from backend.twin_engine.interface import TwinEngine
from backend.twin_engine.parameters import PhysicsParameters

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """
    Unified evaluation payload produced for every ingested telemetry frame.
    """
    telemetry: TelemetryFrame
    physics: Dict[str, Any]
    residual: ResidualFrame
    confounders: ConfounderFrame
    physics_tdi: float
    ai_tdi: float
    final_tdi: float
    tdi_frame: TDIFrame
    model_reliability: float
    blender_payload: BlenderFramePayload


class UnifiedIntelligencePipeline:
    """
    Unified end-to-end processing pipeline ensuring exact determinism and single-point orchestration.
    """

    def __init__(
        self,
        physics_twin: Optional[TwinEngine] = None,
        model_path: str = "data/ml/baseline_model.joblib",
        fusion_alpha: float = 0.60,
        window_size: int = 15,
        data_mode: str = "REPLAY",
    ):
        self.fusion_alpha = fusion_alpha
        self.window_size = window_size
        self.data_mode = data_mode

        # 1. Physics Twin
        params = PhysicsParameters()
        self.physics_twin = physics_twin or TwinEngine(parameters=params)

        # 2. Residual Engine
        self.residual_engine = ResidualEngine(
            twin_engine=self.physics_twin,
            epsilon=1.0,
            persistence_threshold=1.0,
        )

        # 3. Confounder Engine
        self.confounder_engine = ConfounderEngine()

        # 4. TDI Engine
        self.tdi_engine = TDIEngine(trajectory_window=window_size, min_samples=5)

        # 5. ML Baseline Model
        self.ai_model: Optional[BaselineDegradationModel] = None
        if Path(model_path).exists():
            try:
                self.ai_model = BaselineDegradationModel.load_model(model_path)
                logger.info(f"Loaded trained ML baseline model from {model_path}")
            except Exception as e:
                logger.warning(f"Failed to load ML model from {model_path}: {e}")

        # 6. Blender Bridge
        self.blender_bridge = BlenderBridge(data_mode=data_mode)
        self.selected_component: Optional[str] = None

        # Rolling buffers for temporal window feature extraction
        self._tel_buffer: deque[TelemetryFrame] = deque(maxlen=window_size)
        self._res_buffer: deque[ResidualFrame] = deque(maxlen=window_size)
        self._conf_buffer: deque[ConfounderFrame] = deque(maxlen=window_size)
        self._tdi_buffer: deque[TDIFrame] = deque(maxlen=window_size)

    def reset(self) -> None:
        """Resets all pipeline component buffers and history."""
        self.physics_twin.reset()
        self.residual_engine.reset()
        self.confounder_engine.reset()
        self.tdi_engine.reset()
        self.blender_bridge.reset()
        self._tel_buffer.clear()
        self._res_buffer.clear()
        self._conf_buffer.clear()
        self._tdi_buffer.clear()

    def process_frame(self, frame: TelemetryFrame) -> PipelineResult:
        """
        Executes the complete processing chain on a single incoming TelemetryFrame.
        """
        # 1. Physics Twin
        twin_output = self.physics_twin.step(frame)
        net_f = (
            twin_output.expected_traction_force_n
            - twin_output.expected_drag_n
            - twin_output.expected_rolling_resistance_n
            - twin_output.expected_brake_force_n
        )
        phys_dict = {
            "expected_acceleration_mps2": round(twin_output.expected_acceleration_mps2, 3),
            "forces": {
                "drag_n": round(twin_output.expected_drag_n, 1),
                "rolling_resistance_n": round(twin_output.expected_rolling_resistance_n, 1),
                "brake_force_n": round(twin_output.expected_brake_force_n, 1),
                "traction_n": round(twin_output.expected_traction_force_n, 1),
                "net_force_n": round(net_f, 1),
            },
            "vertical_load_n": round(twin_output.expected_vertical_load_n, 1),
            "load_transfer_n": round(twin_output.expected_load_transfer_n, 1),
            "parameter_provenance": {
                **{k: "MEASURED" for k in twin_output.measured_inputs},
                **{k: "DERIVED" for k in twin_output.derived_inputs},
                **{k: "MODELLED" for k in twin_output.modelled_inputs},
                **{k: "UNAVAILABLE" for k in twin_output.unavailable_inputs},
            },
        }

        # 2. Residual Engine
        res_frame = self.residual_engine.process_frame(frame, expected_twin_output=twin_output)

        # 3. Confounder Engine
        conf_frame = self.confounder_engine.evaluate_frame(
            residual_frame=res_frame,
            telemetry_frame=frame,
        )

        # 4. TDI Engine (Physics-Informed Deterministic TDI)
        tyre_age = frame.tyres.fl.tyre_life_laps
        compound = frame.tyres.fl.compound
        stint = frame.tyres.fl.stint
        tdi_frame = self.tdi_engine.evaluate_frame(
            confounder_frame=conf_frame,
            window_features=None,
            tyre_age_laps=tyre_age,
            compound=compound,
            stint=stint,
        )
        physics_tdi = float(tdi_frame.tdi)

        # Append to temporal buffers for AI inference
        self._tel_buffer.append(frame)
        self._res_buffer.append(res_frame)
        self._conf_buffer.append(conf_frame)
        self._tdi_buffer.append(tdi_frame)

        # 5. AI Model Evaluation
        ai_tdi = physics_tdi  # Default fallback if model unavailable
        model_reliability = float(tdi_frame.confidence)

        if self.ai_model is not None and len(self._tel_buffer) >= min(5, self.window_size):
            try:
                window_vec = extract_window_features(
                    tel_window=list(self._tel_buffer),
                    res_window=list(self._res_buffer),
                    conf_window=list(self._conf_buffer),
                    tdi_window=list(self._tdi_buffer),
                    window_id="W_REALTIME",
                )
                df_window = pd.DataFrame([window_vec.features])
                ai_preds = self.ai_model.predict(df_window)
                if ai_preds:
                    ai_tdi = float(ai_preds[0].predicted_degradation)
                    model_reliability = float(ai_preds[0].model_reliability)
            except Exception as e:
                logger.debug(f"AI inference fallback: {e}")
                ai_tdi = physics_tdi

        # 6. Physics + AI Fusion
        final_tdi = round(
            float(np.clip((self.fusion_alpha * physics_tdi) + ((1.0 - self.fusion_alpha) * ai_tdi), 0.0, 100.0)),
            2,
        )

        # 7. Blender Payload Generation
        blender_payload = self.blender_bridge.format_frame(
            telemetry=frame.model_dump(),
            tdi_state={
                "tdi": physics_tdi,
                "final_tdi": final_tdi,
                "state": tdi_frame.state.value,
            },
            selected_component=self.selected_component,
        )

        return PipelineResult(
            telemetry=frame,
            physics=phys_dict,
            residual=res_frame,
            confounders=conf_frame,
            physics_tdi=round(physics_tdi, 2),
            ai_tdi=round(ai_tdi, 2),
            final_tdi=final_tdi,
            tdi_frame=tdi_frame,
            model_reliability=round(model_reliability, 3),
            blender_payload=blender_payload,
        )

    def set_selected_component(self, component: Optional[str]) -> None:
        """Sets active focused component in Blender bridge."""
        self.selected_component = component
        self.blender_bridge.selected_component = component

    def set_data_mode(self, mode: str) -> None:
        """Updates pipeline data mode (REPLAY or DEMO_SIMULATION)."""
        self.data_mode = mode
        self.blender_bridge.data_mode = mode

    def set_mode(self, mode: str) -> None:
        """Sets digital twin operational mode (REAL_TELEMETRY or TEST_MODE)."""
        self.blender_bridge.mode = mode

