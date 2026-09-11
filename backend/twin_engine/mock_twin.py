"""
TYRETRACE — Mock Twin Engine (Fallback Engine)
Provides a lightweight placeholder / mock digital twin implementation strictly for
offline testing, synthetic benchmarking, or fallback demonstrations.

IMPORTANT:
Output from this class is strictly labelled:
    DEMO / SYNTHETIC / MODELLED
The production first-principles PhysicsTwin (in interface.py) is kept completely separate.
"""

from typing import Any, Dict

from backend.schemas.telemetry import TelemetryFrame
from backend.schemas.twin import TwinEngineOutput
from backend.twin_engine.interface import BaseTwinEngine


class MockTwinEngine(BaseTwinEngine):
    """
    Fallback mock engine returning nominal placeholder estimates.
    Every output is explicitly flagged as DEMO / SYNTHETIC / MODELLED.
    """

    def __init__(self):
        self._initialized: bool = False
        self._frame_count: int = 0
        self.initialize()

    def initialize(self) -> None:
        self._initialized = True
        self._frame_count = 0

    def reset(self) -> None:
        self.initialize()

    def health(self) -> Dict[str, Any]:
        return {
            "status": "OPERATIONAL",
            "type": "MockTwinEngine",
            "mode": "DEMO / SYNTHETIC / MODELLED",
            "processed_frames": self._frame_count,
        }

    def step(self, telemetry_frame: TelemetryFrame) -> TwinEngineOutput:
        self._frame_count += 1
        veh = telemetry_frame.vehicle
        speed = veh.speed_mps
        throttle = veh.throttle_pct
        brake = veh.brake_pct

        # Synthetic placeholder forces
        f_drag = 0.5 * 1.225 * 0.85 * 1.5 * (speed ** 2)
        f_rolling = 0.015 * 798.0 * 9.80665
        f_traction = (throttle / 100.0) * 12000.0
        f_brake = (brake / 100.0) * 20000.0
        ax_expected = (f_traction - f_drag - f_rolling - f_brake) / 798.0
        fz_total = 798.0 * 9.80665

        return TwinEngineOutput(
            timestamp=telemetry_frame.timestamp,
            session_id=telemetry_frame.session_id,
            lap=telemetry_frame.lap,
            expected_acceleration_mps2=round(ax_expected, 3),
            expected_drag_n=round(f_drag, 2),
            expected_rolling_resistance_n=round(f_rolling, 2),
            expected_brake_force_n=round(f_brake, 2),
            expected_traction_force_n=round(f_traction, 2),
            expected_vertical_load_n=round(fz_total, 2),
            expected_fz_front_n=round(fz_total * 0.45, 2),
            expected_fz_rear_n=round(fz_total * 0.55, 2),
            expected_load_transfer_n=0.0,
            actual_speed_mps=round(speed, 3),
            derived_acceleration_mps2=None,
            thermal_status="UNAVAILABLE",
            thermal_prediction_k_per_s=None,
            model_confidence=0.50,
            measured_inputs={"speed_mps": speed, "throttle_pct": throttle, "brake_pct": brake},
            derived_inputs={},
            modelled_inputs={"mode": "DEMO / SYNTHETIC / MODELLED (MockTwinEngine Fallback)"},
            unavailable_inputs=["All physical tyre and chassis signals"],
            assumptions=["DEMO / SYNTHETIC / MODELLED — Not calculated from first-principles twin"],
        )
