"""
TYRETRACE — Blender Digital Twin Bridge Layer
Transforms unified pipeline frame outputs into compact, visualization-ready Blender payloads.
"""

from typing import Any, Dict, Optional
from backend.blender.schemas import (
    BlenderCornerSlot,
    BlenderFramePayload,
    BlenderTyresState,
    BlenderVehicleState,
)


class BlenderBridge:
    """
    Bridge component preparing 3D rendering synchronization payloads.
    Decoupled from Blender execution; does NOT require Blender installation to run or test.
    """

    def __init__(self, data_mode: str = "REPLAY"):
        self.data_mode = data_mode
        self._sequence: int = 0
        self.selected_component: Optional[str] = None

    def format_frame(
        self,
        telemetry: Dict[str, Any],
        tdi_state: Dict[str, Any],
        selected_component: Optional[str] = None,
    ) -> BlenderFramePayload:
        """
        Translates raw pipeline outputs into the standardized Blender digital twin contract.
        """
        self._sequence += 1

        veh_data = telemetry.get("vehicle", {})
        speed_mps = float(veh_data.get("speed_mps", 0.0))
        speed_kph = float(veh_data.get("speed_kph", speed_mps * 3.6))
        throttle = float(veh_data.get("throttle_pct", 0.0))
        brake = float(veh_data.get("brake_pct", 0.0))
        gear = int(veh_data.get("gear", 0))
        drs_raw = veh_data.get("drs")
        drs_active = bool(drs_raw in (1, 8, 10, 12, 14)) if drs_raw is not None else False

        vehicle_state = BlenderVehicleState(
            speed_kph=round(speed_kph, 1),
            speed_mps=round(speed_mps, 2),
            throttle_pct=round(throttle, 1),
            brake_pct=round(brake, 1),
            gear=gear,
            drs_active=drs_active,
        )

        global_tdi = float(tdi_state.get("final_tdi", tdi_state.get("tdi", 0.0)))

        # In DEMO_SIMULATION mode, four-wheel corner degradation is allowed and simulated.
        # In REPLAY mode, FastF1 has no corner wear -> keep explicitly unavailable
        if self.data_mode == "DEMO_SIMULATION":
            fl_sim = round(min(100.0, max(0.0, float(tdi_state.get("fl_tdi", global_tdi * 1.15)))), 1)
            fr_sim = round(min(100.0, max(0.0, float(tdi_state.get("fr_tdi", global_tdi * 0.95)))), 1)
            rl_sim = round(min(100.0, max(0.0, float(tdi_state.get("rl_tdi", global_tdi * 0.85)))), 1)
            rr_sim = round(min(100.0, max(0.0, float(tdi_state.get("rr_tdi", global_tdi * 0.80)))), 1)
            tyres_state = BlenderTyresState(
                FL=BlenderCornerSlot(available=True, tdi=fl_sim, reason="Simulated 4-wheel telemetry in DEMO mode"),
                FR=BlenderCornerSlot(available=True, tdi=fr_sim, reason="Simulated 4-wheel telemetry in DEMO mode"),
                RL=BlenderCornerSlot(available=True, tdi=rl_sim, reason="Simulated 4-wheel telemetry in DEMO mode"),
                RR=BlenderCornerSlot(available=True, tdi=rr_sim, reason="Simulated 4-wheel telemetry in DEMO mode"),
            )
        else:
            tyres_state = BlenderTyresState(
                FL=BlenderCornerSlot(available=False, tdi=None),
                FR=BlenderCornerSlot(available=False, tdi=None),
                RL=BlenderCornerSlot(available=False, tdi=None),
                RR=BlenderCornerSlot(available=False, tdi=None),
            )

        state_str = str(tdi_state.get("state", "HEALTHY_LOW_EVIDENCE"))
        iso_ts = str(telemetry.get("timestamp_iso", f"T+{telemetry.get('timestamp', 0.0):.3f}s"))
        lap = int(telemetry.get("lap", 1))
        active_comp = selected_component or self.selected_component

        return BlenderFramePayload(
            sequence=self._sequence,
            timestamp_iso=iso_ts,
            lap=lap,
            vehicle=vehicle_state,
            tyres=tyres_state,
            global_tdi=round(global_tdi, 2),
            degradation_state=state_str,
            selected_component=active_comp,
            data_mode=self.data_mode,
        )

    def reset(self) -> None:
        """Resets sequence counter."""
        self._sequence = 0

