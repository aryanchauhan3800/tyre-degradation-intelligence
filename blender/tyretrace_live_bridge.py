"""
TYRETRACE — Live Blender Digital Twin Bridge (Phase 11)
Connects the existing Formula 2 / Formula 1 Blender race car digital twin
to the TYRETRACE real-time WebSocket telemetry gateway.

Compatibility: Blender 4.x / 5.x / 6.x
Thread safety: Background networking thread -> Thread-safe Queue -> bpy.app.timers (Main Thread)
Zero geometry alterations: Transforms & non-destructive material state restoration only.
"""

from __future__ import annotations

import json
import logging
import math
import os
import queue
import site
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# Ensure user site-packages are available inside Blender's embedded Python
try:
    user_site = site.getusersitepackages()
    if user_site and user_site not in sys.path:
        sys.path.append(user_site)
except Exception:
    pass
if hasattr(site, "USER_SITE") and site.USER_SITE and site.USER_SITE not in sys.path:
    sys.path.append(site.USER_SITE)

# Check for Blender environment
try:
    import bpy
    from mathutils import Euler, Matrix, Vector
    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TyreTraceBlender")


# ==============================================================================
# 1. PARSED FRAME CONTRACT
# ==============================================================================

@dataclass
class TyreTraceFrame:
    """Standardized representation of an ingested telemetry & TDI payload."""
    sequence: int = 0
    timestamp_sec: float = 0.0
    timestamp_iso: str = ""
    lap: int = 1
    data_mode: str = "REPLAY"  # "REPLAY" or "DEMO_SIMULATION"
    
    # Chassis Telemetry
    speed_kph: float = 0.0
    speed_mps: float = 0.0
    throttle_pct: float = 0.0
    brake_pct: float = 0.0
    gear: int = 0
    drs_active: bool = False
    
    # Intelligence & TDI
    global_tdi: Optional[float] = None
    physics_tdi: Optional[float] = None
    ai_tdi: Optional[float] = None
    degradation_state: str = "HEALTHY_LOW_EVIDENCE"
    confidence: float = 0.0
    trend: str = "STABLE"
    
    # Confounders & Residual
    residual_rax: Optional[float] = None
    evidence_quality: float = 0.0
    confounder_score: float = 0.0
    
    # 4-Wheel Intelligence (FL, FR, RL, RR)
    # In REAL_REPLAY, corner TDI is strictly None / unavailable
    corner_tdi: Dict[str, Optional[float]] = field(
        default_factory=lambda: {"FL": None, "FR": None, "RL": None, "RR": None}
    )
    corner_available: Dict[str, bool] = field(
        default_factory=lambda: {"FL": False, "FR": False, "RL": False, "RR": False}
    )
    
    # Selected Component for inspection
    selected_component: Optional[str] = None

    # Track Position & Orientation (Phase 3 Real F1 Telemetry)
    position: Optional[Tuple[float, float, float]] = None
    heading: Optional[float] = None
    heading_deg: Optional[float] = None
    track_distance_m: Optional[float] = None
    lap_fraction: Optional[float] = None
    track_error_m: float = 0.0
    rpm: Optional[float] = None
    steer_angle_deg: Optional[float] = None
    mode: str = "REAL_TELEMETRY"  # "REAL_TELEMETRY" or "TEST_MODE"


class PayloadParser:
    """Pure-Python parser extracting verified fields from WebSocket messages."""

    @staticmethod
    def parse(raw_data: Any) -> Optional[TyreTraceFrame]:
        if isinstance(raw_data, str):
            try:
                data = json.loads(raw_data)
            except Exception as e:
                logger.debug(f"JSON decode failed: {e}")
                return None
        elif isinstance(raw_data, dict):
            data = raw_data
        else:
            return None

        # Accept standard telemetry_update or direct blender payload
        blender = data.get("blender") if isinstance(data.get("blender"), dict) else {}
        veh_blender = blender.get("vehicle") if isinstance(blender.get("vehicle"), dict) else {}
        tyres_blender = blender.get("tyres") if isinstance(blender.get("tyres"), dict) else {}
        
        telemetry = data.get("telemetry") if isinstance(data.get("telemetry"), dict) else {}
        veh_tel = telemetry.get("vehicle") if isinstance(telemetry.get("vehicle"), dict) else {}
        tdi_data = data.get("tdi") if isinstance(data.get("tdi"), dict) else {}
        conf_data = data.get("confounders") if isinstance(data.get("confounders"), dict) else {}
        res_data = data.get("residual") if isinstance(data.get("residual"), dict) else {}

        # 1. Mode
        mode = blender.get("data_mode") or data.get("data_mode") or "REPLAY"
        mode_upper = str(mode).upper()
        op_mode = str(blender.get("mode") or data.get("mode") or "REAL_TELEMETRY")

        # 2. Chassis Telemetry
        speed_kph = float(veh_blender.get("speed_kph") or veh_tel.get("speed_kph") or 0.0)
        speed_mps = float(veh_blender.get("speed_mps") or veh_tel.get("speed_mps") or (speed_kph / 3.6))
        throttle = float(veh_blender.get("throttle_pct") or veh_tel.get("throttle_pct") or 0.0)
        brake = float(veh_blender.get("brake_pct") or veh_tel.get("brake_pct") or 0.0)
        gear = int(veh_blender.get("gear") or veh_tel.get("gear") or 0)
        
        drs_raw = veh_tel.get("drs")
        drs_blender = veh_blender.get("drs_active")
        if drs_blender is not None:
            drs_active = bool(drs_blender)
        elif drs_raw is not None:
            drs_active = bool(drs_raw in (1, 8, 10, 12, 14))
        else:
            drs_active = False

        rpm_val = veh_blender.get("rpm") or veh_tel.get("rpm")
        rpm = float(rpm_val) if rpm_val is not None else None

        steer_val = veh_blender.get("steer_angle_deg") or veh_tel.get("steer_angle_deg")
        steer_angle_deg = float(steer_val) if steer_val is not None else None

        # 3. Track Position & Orientation (Phase 3)
        pos_raw = veh_blender.get("position")
        if isinstance(pos_raw, (list, tuple)) and len(pos_raw) == 3:
            position: Optional[Tuple[float, float, float]] = (float(pos_raw[0]), float(pos_raw[1]), float(pos_raw[2]))
        else:
            position = None

        heading_val = veh_blender.get("heading")
        heading = float(heading_val) if heading_val is not None else None

        heading_deg_val = veh_blender.get("heading_deg")
        heading_deg = float(heading_deg_val) if heading_deg_val is not None else (math.degrees(heading) if heading is not None else None)

        track_dist_val = veh_blender.get("track_distance_m")
        track_distance_m = float(track_dist_val) if track_dist_val is not None else None

        lap_frac_val = veh_blender.get("lap_fraction")
        lap_fraction = float(lap_frac_val) if lap_frac_val is not None else None

        track_error_val = veh_blender.get("track_error_m", 0.0)
        track_error_m = float(track_error_val) if track_error_val is not None else 0.0

        # 4. TDI Metrics
        global_tdi_raw = blender.get("global_tdi") or tdi_data.get("final_tdi")
        global_tdi = float(global_tdi_raw) if global_tdi_raw is not None else None
        
        phys_tdi_raw = tdi_data.get("physics_tdi")
        physics_tdi = float(phys_tdi_raw) if phys_tdi_raw is not None else None
        
        ai_tdi_raw = tdi_data.get("ai_tdi")
        ai_tdi = float(ai_tdi_raw) if ai_tdi_raw is not None else None

        state_str = str(blender.get("degradation_state") or tdi_data.get("state") or "HEALTHY_LOW_EVIDENCE")
        confidence = float(tdi_data.get("confidence") or 0.0)
        trend = str(tdi_data.get("trend") or "STABLE")

        # 5. Confounders & Residual
        r_ax_raw = res_data.get("r_ax") or res_data.get("raw_residual_mps2")
        residual_rax = float(r_ax_raw) if r_ax_raw is not None else None
        
        conf_scores = conf_data.get("scores", {})
        evidence_quality = float(conf_scores.get("tyre_evidence_quality", 0.0))
        confounder_score = float(conf_scores.get("non_tyre_explanation_score", 0.0))

        # 6. Four-Wheel Degradation
        corner_tdi: Dict[str, Optional[float]] = {}
        corner_available: Dict[str, bool] = {}

        for c in ("FL", "FR", "RL", "RR"):
            c_slot = tyres_blender.get(c, {})
            avail = bool(c_slot.get("available", False))
            tdi_val = c_slot.get("tdi")
            
            # Strict mode enforcement: In REPLAY mode, corner wear is strictly unavailable
            if mode_upper != "DEMO_SIMULATION":
                corner_available[c] = False
                corner_tdi[c] = None
            else:
                corner_available[c] = avail
                corner_tdi[c] = float(tdi_val) if (avail and tdi_val is not None) else None

        # 7. Selected Component
        selected_component = blender.get("selected_component") or data.get("selected_component")

        # Timestamp handling (support both float seconds and ISO strings)
        ts_val = data.get("timestamp")
        timestamp_sec = 0.0
        timestamp_iso = str(blender.get("timestamp_iso") or telemetry.get("timestamp_iso") or "")
        if isinstance(ts_val, (int, float)):
            timestamp_sec = float(ts_val)
        elif isinstance(ts_val, str):
            if not timestamp_iso:
                timestamp_iso = ts_val
            tel_ts = telemetry.get("timestamp")
            if isinstance(tel_ts, (int, float)):
                timestamp_sec = float(tel_ts)

        return TyreTraceFrame(
            sequence=int(data.get("sequence", blender.get("sequence", 0))),
            timestamp_sec=timestamp_sec,
            timestamp_iso=timestamp_iso,
            lap=int(blender.get("lap", 1)),
            data_mode=mode_upper,
            speed_kph=round(speed_kph, 1),
            speed_mps=round(speed_mps, 2),
            throttle_pct=round(throttle, 1),
            brake_pct=round(brake, 1),
            gear=gear,
            drs_active=drs_active,
            global_tdi=round(global_tdi, 2) if global_tdi is not None else None,
            physics_tdi=round(physics_tdi, 2) if physics_tdi is not None else None,
            ai_tdi=round(ai_tdi, 2) if ai_tdi is not None else None,
            degradation_state=state_str,
            confidence=round(confidence, 2),
            trend=trend,
            residual_rax=round(residual_rax, 3) if residual_rax is not None else None,
            evidence_quality=round(evidence_quality, 2),
            confounder_score=round(confounder_score, 2),
            corner_tdi=corner_tdi,
            corner_available=corner_available,
            selected_component=selected_component,
            position=position,
            heading=heading,
            heading_deg=heading_deg,
            track_distance_m=track_distance_m,
            lap_fraction=lap_fraction,
            track_error_m=track_error_m,
            rpm=rpm,
            steer_angle_deg=steer_angle_deg,
            mode=op_mode,
        )


# ==============================================================================
# 2. BACKGROUND NETWORK CLIENT
# ==============================================================================

class TyreTraceNetworkClient:
    """
    Background worker thread maintaining a persistent WebSocket connection to FastAPI.
    Deposits parsed frames into a thread-safe Queue consumed by Blender's main timer.
    """

    def __init__(self, url: str = "ws://localhost:8000/ws/telemetry", max_queue: int = 5):
        self.url = url
        self.max_queue = max_queue
        self.frame_queue: queue.Queue[TyreTraceFrame] = queue.Queue(maxsize=max_queue)
        
        self.is_connected = False
        self.is_connecting = False
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.last_frame: Optional[TyreTraceFrame] = None
        self.last_receive_time = 0.0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="TyreTraceNetWorker", daemon=True)
        self._thread.start()
        logger.info(f"Started TyreTrace network client targeting {self.url}")

    def stop(self) -> None:
        self._stop_event.set()
        self.is_connected = False
        self.is_connecting = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        logger.info("TyreTrace network client stopped.")

    def _run_loop(self) -> None:
        """Main network execution thread with auto-reconnect backoff."""
        # Attempt importing websockets
        try:
            import asyncio
            import websockets
            has_websockets = True
        except ImportError:
            has_websockets = False

        if has_websockets:
            self._run_asyncio_websockets()
        else:
            logger.warning("websockets package not available; using HTTP polling fallback.")
            self._run_http_fallback()

    def _run_asyncio_websockets(self) -> None:
        import asyncio
        import websockets

        async def _client_coroutine():
            reconnect_delay = 1.0
            while not self._stop_event.is_set():
                self.is_connecting = True
                self.is_connected = False
                try:
                    logger.info(f"Connecting to WebSocket: {self.url}...")
                    async with websockets.connect(self.url, ping_interval=10, ping_timeout=5) as ws:
                        self.is_connected = True
                        self.is_connecting = False
                        reconnect_delay = 1.0
                        logger.info("Connected to TYRETRACE WebSocket.")

                        while not self._stop_event.is_set():
                            try:
                                msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                                try:
                                    frame = PayloadParser.parse(msg)
                                except Exception as parse_err:
                                    logger.warning(f"Payload parsing error: {parse_err}")
                                    frame = None
                                if frame:
                                    self.last_frame = frame
                                    self.last_receive_time = time.time()
                                    if self.frame_queue.full():
                                        try:
                                            self.frame_queue.get_nowait()
                                        except queue.Empty:
                                            pass
                                    self.frame_queue.put_nowait(frame)
                            except asyncio.TimeoutError:
                                # Normal timeout, send ping
                                await ws.send("ping")
                            except websockets.ConnectionClosed:
                                break
                except Exception as e:
                    self.is_connected = False
                    self.is_connecting = False
                    if not self._stop_event.is_set():
                        logger.warning(f"Connection attempt failed: {e}. Reconnecting in {reconnect_delay:.1f}s...")
                        await asyncio.sleep(reconnect_delay)
                        reconnect_delay = min(reconnect_delay * 1.5, 5.0)

        try:
            asyncio.run(_client_coroutine())
        except Exception as e:
            logger.debug(f"Asyncio loop terminated: {e}")

    def _run_http_fallback(self) -> None:
        """Fallback polling mechanism if websockets library is absent."""
        import urllib.request

        base_url = self.url.replace("ws://", "http://").replace("/ws/telemetry", "")
        tel_url = f"{base_url}/api/telemetry"
        tdi_url = f"{base_url}/api/tdi"
        replay_url = f"{base_url}/api/replay/status"

        while not self._stop_event.is_set():
            try:
                self.is_connecting = True
                # Fetch telemetry
                req = urllib.request.Request(tel_url, headers={"User-Agent": "TyreTraceBlender/1.0"})
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    tel_data = json.loads(resp.read().decode())

                # Fetch TDI
                req_tdi = urllib.request.Request(tdi_url, headers={"User-Agent": "TyreTraceBlender/1.0"})
                with urllib.request.urlopen(req_tdi, timeout=1.0) as resp:
                    tdi_data = json.loads(resp.read().decode())

                frame = PayloadParser.parse({
                    "telemetry": tel_data,
                    "tdi": tdi_data,
                    "data_mode": "REPLAY",
                })
                if frame:
                    self.last_frame = frame
                    self.last_receive_time = time.time()
                    if self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    self.frame_queue.put_nowait(frame)

                self.is_connected = True
                self.is_connecting = False
                time.sleep(0.05)  # 20 Hz
            except Exception:
                self.is_connected = False
                self.is_connecting = False
                time.sleep(2.0)


# ==============================================================================
# 3. BLENDER SCENE & DIGITAL TWIN MANAGER
# ==============================================================================

class TyreTraceSceneManager:
    """
    Interacts directly with the Blender scene on the main thread via bpy.app.timers.
    Manipulates transforms, wheel rotation, camera transitions, material highlights,
    and HUD overlays without modifying base geometry.
    """

    WHEEL_RADIUS_M = 0.5975  # Verified bounding radius of Formula 2 Car wheels in .blend
    WHEEL_OBJECTS = {
        "FL": "Wheel_FL",
        "FR": "Wheel_FR",
        "RL": "Wheel_RL",
        "RR": "Wheel_RR",
    }

    # Material name patterns present in the .blend model
    CORNER_MATERIAL_MAP = {
        "FL": ["Tyre_FL_Center", "Tyre_FL_Inner", "Tyre_FL_Outer"],
        "FR": ["Tyre_FR_Center", "Tyre_FR_Inner", "Tyre_FR_Outer"],
        "RL": ["Tyre_RL_Center", "Tyre_RL_Inner", "Tyre_RL_Outer"],
        "RR": ["Tyre_RR_Center", "Tyre_RR_Inner", "Tyre_RR_Outer"],
    }

    TDI_SMOOTHING_FACTOR: float = 0.20  # Visual smoothing factor to prevent flicker

    def __init__(self):
        self.last_update_time: float = time.time()
        self.active_selection: Optional[str] = None
        self._saved_material_states: Dict[str, Dict[str, Any]] = {}
        self._wheel_base_quats: Dict[str, Any] = {}
        self._wheel_spin_angle: float = 0.0
        self.camera_mode: str = "CHASE"  # "CHASE", "SECTOR", "OVERVIEW"
        self._hud_text_obj_name = "TYRETRACE_HUD"
        self._display_tdi: Dict[str, float] = {"FL": 0.0, "FR": 0.0, "RL": 0.0, "RR": 0.0}
        self.scene_type: str = "PHASE11_F2"
        self._detect_scene_type()
        self._cache_original_materials()

    def _detect_scene_type(self) -> None:
        """Detects whether running on F1 2022 Studio model or Phase 11 F2 model."""
        if not IN_BLENDER:
            self.scene_type = "PHASE11_F2"
            return

        if bpy.data.objects.get("tire_front") or bpy.data.objects.get("rim_front"):
            self.scene_type = "F1_2022_STUDIO"
            logger.info("Detected F1 2022 Textured Studio scene (tire_front / tire_rear).")

            # Split shared material between front and rear so they can visualize independent TDI
            tf = bpy.data.objects.get("tire_front")
            tr = bpy.data.objects.get("tire_rear")
            if tf and tr and tf.material_slots and tr.material_slots:
                mat_f = tf.material_slots[0].material
                mat_r = tr.material_slots[0].material
                if mat_f and mat_r and mat_f == mat_r:
                    rear_mat = mat_f.copy()
                    rear_mat.name = f"{mat_f.name}_Rear"
                    mat_f.name = f"{mat_f.name}_Front"
                    tr.material_slots[0].material = rear_mat
                    logger.info(f"Separated shared tyre material into '{mat_f.name}' and '{rear_mat.name}'.")

            # Ensure all wheel assemblies start aligned cleanly on their axles
            for obj_name in ("tire_front", "rim_front", "tire_rear", "rim_rear"):
                obj = bpy.data.objects.get(obj_name)
                if obj:
                    obj.rotation_mode = 'XYZ'
                    obj.rotation_euler.x = 1.5707963705062866
                    obj.rotation_euler.y = 0.0
                    obj.rotation_euler.z = 0.0

            tvf = bpy.data.objects.get("tire_ventil_front")
            if tvf:
                tvf.rotation_euler = (0.2915464, 0.0, 0.0)
            tvr = bpy.data.objects.get("tire_ventil_rear")
            if tvr:
                tvr.rotation_euler = (0.3186455, 0.0, 0.0)
        else:
            self.scene_type = "PHASE11_F2"
            logger.info("Detected Phase 11 scene (Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR).")

    def _get_corner_materials(self, corner: str) -> List[str]:
        """Resolves active material names for a tyre corner across all supported models."""
        if not IN_BLENDER:
            return self.CORNER_MATERIAL_MAP.get(corner, [])

        if self.scene_type == "F1_2022_STUDIO":
            tf = bpy.data.objects.get("tire_front")
            tr = bpy.data.objects.get("tire_rear")
            if corner in ("FL", "FR"):
                mats = [s.material.name for s in tf.material_slots if s.material] if tf else []
                return mats or ["Tyre Thread _Front", "Tyre Thread "]
            else:
                mats = [s.material.name for s in tr.material_slots if s.material] if tr else []
                return mats or ["Tyre Thread _Rear", "Tyre Thread "]

        return self.CORNER_MATERIAL_MAP.get(corner, [])

    def _cache_original_materials(self) -> None:
        """Stores baseline material properties so they can be restored cleanly."""
        if not IN_BLENDER:
            return
        all_mat_names = set()
        for corner in ("FL", "FR", "RL", "RR"):
            all_mat_names.update(self._get_corner_materials(corner))

        for m_name in all_mat_names:
            mat = bpy.data.materials.get(m_name)
            if mat and mat.node_tree:
                principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                state: Dict[str, Any] = {}
                if principled:
                    bc_input = principled.inputs.get("Base Color")
                    em_input = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
                    em_strength = principled.inputs.get("Emission Strength")
                    state["base_color"] = tuple(bc_input.default_value[:]) if (bc_input and hasattr(bc_input.default_value, "__iter__")) else (0.0, 0.0, 0.0, 1.0)
                    state["emission_color"] = tuple(em_input.default_value[:]) if (em_input and hasattr(em_input.default_value, "__iter__")) else (0.0, 0.0, 0.0, 1.0)
                    state["emission_strength"] = float(em_strength.default_value) if em_strength else 0.0
                
                rgb_node = mat.node_tree.nodes.get("RGB")
                if rgb_node and hasattr(rgb_node, "outputs") and len(rgb_node.outputs) > 0:
                    state["rgb_color"] = tuple(rgb_node.outputs[0].default_value[:])

                self._saved_material_states[m_name] = state

    @staticmethod
    def _lerp(a: float, b: float, t: float) -> float:
        return a + (b - a) * t

    @classmethod
    def _lerp_color(
        cls,
        c1: Tuple[float, float, float, float],
        c2: Tuple[float, float, float, float],
        t: float,
    ) -> Tuple[float, float, float, float]:
        return (
            cls._lerp(c1[0], c2[0], t),
            cls._lerp(c1[1], c2[1], t),
            cls._lerp(c1[2], c2[2], t),
            cls._lerp(c1[3], c2[3], t),
        )

    @classmethod
    def calculate_thermal_gradient(
        cls, tdi: float
    ) -> Tuple[Tuple[float, float, float, float], Tuple[float, float, float, float], float]:
        """
        Computes vivid, continuous thermal degradation gradient:
          TDI 0–15%:   Cold / fresh tyre — Deep vibrant BLUE
          TDI 15–35%:  Optimal operating window — Vibrant GREEN
          TDI 35–55%:  Moderate wear / warming — Bright thermal YELLOW
          TDI 55–75%:  High degradation / overheating — Hot ORANGE
          TDI 75–100%: Critical wear / blistering — Glowing fiery RED
        """
        v = max(0.0, min(100.0, float(tdi)))
        keypoints = [
            # 0.0%: Deep cool blue (Cold tyre)
            (0.0,   (0.02, 0.12, 0.55, 1.0), (0.05, 0.35, 1.00, 1.0), 0.4),
            # 15.0%: Electric cold blue
            (15.0,  (0.03, 0.20, 0.65, 1.0), (0.08, 0.50, 1.00, 1.0), 1.0),
            # 35.0%: Optimal racing window green
            (35.0,  (0.04, 0.40, 0.12, 1.0), (0.12, 0.90, 0.20, 1.0), 1.8),
            # 55.0%: Thermal warning bright YELLOW
            (55.0,  (0.65, 0.55, 0.02, 1.0), (1.00, 0.88, 0.02, 1.0), 2.8),
            # 75.0%: High wear hot ORANGE
            (75.0,  (0.80, 0.25, 0.01, 1.0), (1.00, 0.40, 0.01, 1.0), 3.8),
            # 100.0%: Critical thermal glowing fiery RED
            (100.0, (0.90, 0.02, 0.01, 1.0), (1.00, 0.02, 0.02, 1.0), 5.5),
        ]

        for i in range(len(keypoints) - 1):
            t0, bc0, ec0, es0 = keypoints[i]
            t1, bc1, ec1, es1 = keypoints[i + 1]
            if t0 <= v <= t1:
                span = t1 - t0
                factor = (v - t0) / span if span > 0 else 0.0
                bc = cls._lerp_color(bc0, bc1, factor)
                ec = cls._lerp_color(ec0, ec1, factor)
                es = cls._lerp(es0, es1, factor)
                return bc, ec, es

        return keypoints[-1][1], keypoints[-1][2], keypoints[-1][3]

    def _get_wheel_obj(self, corner: str) -> Optional[Any]:
        """Resolves wheel object across Phase 11 (Wheel_FL) and Phase 2 (FRONT_LEFT) scenes."""
        if not IN_BLENDER:
            return None
        # Try Phase 11 naming first
        name = self.WHEEL_OBJECTS.get(corner)
        obj = bpy.data.objects.get(name) if name else None
        if obj:
            return obj
        # Try Phase 2 canonical naming
        p2_map = {"FL": "FRONT_LEFT", "FR": "FRONT_RIGHT", "RL": "REAR_LEFT", "RR": "REAR_RIGHT"}
        p2_name = p2_map.get(corner)
        return bpy.data.objects.get(p2_name) if p2_name else None

    def apply_frame(self, frame: TyreTraceFrame) -> None:
        """Executed strictly on Blender main thread via bpy.app.timers."""
        if not IN_BLENDER:
            return

        now = time.time()
        dt = max(0.001, min(0.5, now - self.last_update_time))
        self.last_update_time = now

        # 1. Four-Wheel Rotation Dynamics (continuous speed-coupled rotation)
        self._update_wheel_rotation(frame.speed_mps, dt)

        # 2. Tyre Thermal / Degradation Visualization (smooth heat gradient)
        self._update_tdi_visualization(frame)

        # 3. Optional Selection & Chassis Highlights (safe non-blocking)
        if frame.selected_component:
            self._update_tyre_selection(frame.selected_component)
        if bpy.data.materials.get("Brakelamp"):
            self._update_brake_light(frame)
        self._update_camera(frame.selected_component, frame.track_distance_m)

    def _update_car_transform(self, frame: TyreTraceFrame) -> None:
        """Moves CAR_ROOT based on mapped telemetry position and heading."""
        if not IN_BLENDER:
            return
        root = bpy.data.objects.get("CAR_ROOT")
        if not root:
            return
        if frame.position:
            root.location = (frame.position[0], frame.position[1], frame.position[2])
        if frame.heading is not None:
            root.rotation_euler = (0.0, 0.0, frame.heading)

    def _update_brake_light(self, frame: TyreTraceFrame) -> None:
        """Controls Brakelamp material emission based on real brake telemetry."""
        if not IN_BLENDER:
            return
        mat = bpy.data.materials.get("Brakelamp")
        if not mat or not mat.node_tree:
            return
        principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not principled:
            return
        em_color = principled.inputs.get("Emission Color")
        em_strength = principled.inputs.get("Emission Strength")
        if not em_color or not em_strength:
            return

        if frame.brake_pct > 1.0:
            em_color.default_value = (1.0, 0.0, 0.0, 1.0)
            em_strength.default_value = 8.0
        else:
            em_color.default_value = (0.1, 0.0, 0.0, 1.0)
            em_strength.default_value = 0.2

    def _update_wheel_rotation(self, speed_mps: float, dt: float) -> None:
        """
        Rotates wheels based on vehicle speed.
        Supports F1 2022 studio model, QUATERNION mode, and EULER Z mode.
        """
        if abs(speed_mps) < 0.01:
            return

        omega = speed_mps / self.WHEEL_RADIUS_M
        dtheta = omega * dt
        self._wheel_spin_angle += dtheta

        if self.scene_type == "F1_2022_STUDIO":
            # In F1 2022 studio car (facing -X with mirrored Y and baseline rot_x = 90 deg),
            # the wheel axle is the local Y axis in XYZ Euler mode.
            # Decreasing rotation_euler.y rolls both left and mirrored right wheels
            # forward on their true axles like a real car, without any toe-in/camber distortion.
            for obj_name in ("tire_front", "rim_front", "tire_rear", "rim_rear"):
                obj = bpy.data.objects.get(obj_name)
                if obj:
                    obj.rotation_euler.y -= dtheta
                    obj.rotation_euler.z = 0.0
        else:
            try:
                from mathutils import Quaternion
            except ImportError:
                Quaternion = None

            for corner in ("FL", "FR", "RL", "RR"):
                obj = self._get_wheel_obj(corner)
                if not obj:
                    continue

                if obj.rotation_mode == 'QUATERNION' and Quaternion:
                    if corner not in self._wheel_base_quats:
                        self._wheel_base_quats[corner] = obj.rotation_quaternion.copy()
                    base = self._wheel_base_quats[corner]
                    spin_quat = Quaternion((0.0, 0.0, 1.0), self._wheel_spin_angle)
                    obj.rotation_quaternion = base @ spin_quat
                else:
                    if corner in ("FL", "RL"):
                        obj.rotation_euler.z -= dtheta
                    else:
                        obj.rotation_euler.z += dtheta

    def _update_tyre_selection(self, selected_component: Optional[str]) -> None:
        """
        Highlights the selected wheel without permanent material destruction.
        Selected: Cyan engineering emission highlight.
        Deselected: Reverts cleanly to baseline cached material state.
        """
        norm_selected = self._normalize_component_name(selected_component)
        if norm_selected == self.active_selection:
            return

        # Restore previous selection materials
        if self.active_selection:
            self._restore_corner_materials(self.active_selection)

        # Apply new selection highlight
        if norm_selected:
            self._highlight_corner(norm_selected)
            obj = self._get_wheel_obj(norm_selected)
            if obj and bpy.context.view_layer:
                try:
                    bpy.ops.object.select_all(action='DESELECT')
                    obj.select_set(True)
                    bpy.context.view_layer.objects.active = obj
                except Exception:
                    pass

        self.active_selection = norm_selected

    def _update_tdi_visualization(self, frame: TyreTraceFrame) -> None:
        """
        Live Tyre Thermal / Degradation Visualizer:
        - Smooth heat gradient:
            TDI 0–15:   Cool / dark blue
            TDI 15–35:  Green
            TDI 35–55:  Yellow
            TDI 55–75:  Orange
            TDI 75–100: Red / hot
        - Interpolates Base Color, Emission Color, and Emission Strength.
        - Data handling:
            * Per-wheel TDI if available (e.g. in DEMO_SIMULATION)
            * Global TDI consistently on all 4 tyres if per-wheel is unavailable/null (REPLAY)
            * Restores neutral baseline if TDI is null/missing
            * Exponential smoothing to avoid flickering
        """
        global_tdi = frame.global_tdi

        for corner in ("FL", "FR", "RL", "RR"):
            # Selected tyre keeps cyan engineering highlight
            if corner == self.active_selection:
                continue

            # Determine target TDI for this corner:
            # 1. Use per-wheel value if available from backend
            # 2. Fall back to global TDI consistently on all tyres if per-wheel is unavailable
            c_tdi = frame.corner_tdi.get(corner)
            c_avail = frame.corner_available.get(corner, False)

            if c_avail and c_tdi is not None:
                target_tdi = c_tdi
            elif global_tdi is not None:
                target_tdi = global_tdi
            else:
                target_tdi = None

            # If telemetry/TDI is unavailable, restore to neutral baseline
            if target_tdi is None:
                self._restore_corner_materials(corner)
                continue

            # Smooth transitions: display_tdi += (target_tdi - display_tdi) * smoothing_factor
            current_display = self._display_tdi.get(corner, target_tdi)
            smoothed_tdi = current_display + (target_tdi - current_display) * self.TDI_SMOOTHING_FACTOR
            self._display_tdi[corner] = smoothed_tdi

            # Compute smooth thermal shader parameters
            base_col, em_col, em_str = self.calculate_thermal_gradient(smoothed_tdi)

            # Apply thermal effect across all tread bands for this corner
            self._apply_thermal_to_corner(corner, base_col, em_col, em_str)

    def _update_camera(self, selected_component: Optional[str], track_dist_m: Optional[float] = None) -> None:
        """
        Switches camera to focused close-up when a tyre is selected,
        or follows the car via CAMERA_CHASE / trackside cameras.
        """
        if not IN_BLENDER:
            return
        scene = bpy.context.scene
        if not scene:
            return

        norm = self._normalize_component_name(selected_component)
        cam_fl_close = bpy.data.objects.get("CAM_Wheel_FL_Close")
        if norm == "FL" and cam_fl_close:
            scene.camera = cam_fl_close
            return

        if self.camera_mode == "SECTOR" and track_dist_m is not None:
            # Sector-based camera switching around Monza circuit
            d = track_dist_m % 5793.0
            if d < 800.0:
                cam = bpy.data.objects.get("CAMERA_START_FINISH")
            elif d < 1400.0:
                cam = bpy.data.objects.get("CAMERA_TURN_1")
            elif d < 2500.0:
                cam = bpy.data.objects.get("CAMERA_LESMO")
            elif d < 4200.0:
                cam = bpy.data.objects.get("CAMERA_ASCARI")
            else:
                cam = bpy.data.objects.get("CAMERA_PARABOLICA")
            if cam:
                scene.camera = cam
                return

        cam_chase = bpy.data.objects.get("CAMERA_CHASE")
        cam_overview = bpy.data.objects.get("Camera")
        if self.camera_mode == "CHASE" and cam_chase:
            scene.camera = cam_chase
        elif cam_overview:
            scene.camera = cam_overview

    def _update_hud_overlay(self, frame: TyreTraceFrame) -> None:
        """Renders rich engineering text HUD directly in the 3D scene."""
        if not IN_BLENDER:
            return
        text_obj = bpy.data.objects.get(self._hud_text_obj_name)
        tdi_str = f"{frame.global_tdi:.1f}%" if frame.global_tdi is not None else "UNAVAILABLE"
        conf_str = f"{int(frame.confidence * 100)}%" if frame.confidence > 0 else "LOW"
        dist_str = f"{frame.track_distance_m:.0f}m" if frame.track_distance_m is not None else "N/A"
        rpm_str = f"{int(frame.rpm)}" if frame.rpm else "N/A"
        steer_str = f"{frame.steer_angle_deg:.1f}°" if frame.steer_angle_deg is not None else "0.0°"
        brake_str = f"{frame.brake_pct:.0f}%" + (" [BRAKE]" if frame.brake_pct > 1.0 else "")

        hud_content = (
            f"TYRETRACE | {frame.mode} ({frame.data_mode})\n"
            f"TDI: {tdi_str} ({frame.degradation_state}) | CONF: {conf_str}\n"
            f"SPD: {frame.speed_kph:.0f} km/h | GEAR: {frame.gear} | RPM: {rpm_str}\n"
            f"THR: {frame.throttle_pct:.0f}% | BRK: {brake_str} | DRS: {'ON' if frame.drs_active else 'OFF'}\n"
            f"TRACK: {dist_str} / 5793m | STEER: {steer_str} | ERR: {frame.track_error_m:.1f}m\n"
            f"LAP: {frame.lap} | SEQ: #{frame.sequence}"
        )

        if text_obj and text_obj.type == 'FONT':
            text_obj.data.body = hud_content
        else:
            try:
                font_curve = bpy.data.curves.new(type="FONT", name="TyreTraceFont")
                font_curve.body = hud_content
                font_curve.size = 0.22
                new_obj = bpy.data.objects.new(self._hud_text_obj_name, font_curve)
                car_root = bpy.data.objects.get("CAR_ROOT")
                if car_root:
                    new_obj.parent = car_root
                    new_obj.location = Vector((2.5, 0.0, 2.2))
                    new_obj.rotation_euler = Euler((math.radians(90), 0, math.radians(90)), 'XYZ')
                else:
                    new_obj.location = Vector((2.5, 0.0, 2.2))
                    new_obj.rotation_euler = Euler((math.radians(90), 0, math.radians(90)), 'XYZ')
                bpy.context.collection.objects.link(new_obj)
            except Exception:
                pass

    def _normalize_component_name(self, name: Optional[str]) -> Optional[str]:
        if not name:
            return None
        clean = name.strip().upper()
        if clean in ("FL", "FR", "RL", "RR"):
            return clean
        for corner in ("FL", "FR", "RL", "RR"):
            if corner in clean:
                return corner
        return None

    def _highlight_corner(self, corner: str) -> None:
        # Subtle cyan engineering glow
        cyan_color = (0.0, 0.94, 1.0, 1.0)
        self._set_corner_materials_emission(corner, cyan_color, strength=2.5)

    def _restore_corner_materials(self, corner: str) -> None:
        """Restores corner materials back to cached baseline state."""
        if not IN_BLENDER:
            return
        for m_name in self._get_corner_materials(corner):
            mat = bpy.data.materials.get(m_name)
            saved = self._saved_material_states.get(m_name)
            if mat and mat.node_tree and saved:
                principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if principled:
                    bc_input = principled.inputs.get("Base Color")
                    em_input = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
                    em_strength = principled.inputs.get("Emission Strength")
                    if bc_input and not bc_input.is_linked and "base_color" in saved:
                        bc_input.default_value = saved["base_color"]
                    if em_input and not em_input.is_linked and "emission_color" in saved:
                        em_input.default_value = saved["emission_color"]
                    if em_strength and not em_strength.is_linked and "emission_strength" in saved:
                        em_strength.default_value = saved["emission_strength"]

                rgb_node = mat.node_tree.nodes.get("RGB")
                if rgb_node and hasattr(rgb_node, "outputs") and len(rgb_node.outputs) > 0 and "rgb_color" in saved:
                    rgb_node.outputs[0].default_value = saved["rgb_color"]

    def _apply_thermal_to_corner(
        self,
        corner: str,
        base_color: Tuple[float, float, float, float],
        emission_color: Tuple[float, float, float, float],
        emission_strength: float,
    ) -> None:
        """Applies thermal degradation Base Color, Emission Color, and Emission Strength."""
        if not IN_BLENDER:
            return
        for m_name in self._get_corner_materials(corner):
            mat = bpy.data.materials.get(m_name)
            if mat and mat.node_tree:
                principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if principled:
                    bc_input = principled.inputs.get("Base Color")
                    em_input = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
                    em_strength = principled.inputs.get("Emission Strength")
                    if bc_input and not bc_input.is_linked:
                        bc_input.default_value = base_color
                    if em_input and not em_input.is_linked:
                        em_input.default_value = emission_color
                    if em_strength and not em_strength.is_linked:
                        em_strength.default_value = emission_strength

                # In studio car model, the tyre base rubber color is driven by an RGB node into Mix.001
                rgb_node = mat.node_tree.nodes.get("RGB")
                if rgb_node and hasattr(rgb_node, "outputs") and len(rgb_node.outputs) > 0:
                    rgb_node.outputs[0].default_value = (base_color[0], base_color[1], base_color[2], 1.0)

    def _set_corner_materials_emission(self, corner: str, color: Tuple[float, float, float, float], strength: float) -> None:
        for m_name in self._get_corner_materials(corner):
            mat = bpy.data.materials.get(m_name)
            if mat and mat.node_tree:
                principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if principled:
                    em_input = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
                    em_strength = principled.inputs.get("Emission Strength")
                    if em_input and not em_input.is_linked:
                        em_input.default_value = color
                    if em_strength and not em_strength.is_linked:
                        em_strength.default_value = strength

    def reset_all(self) -> None:
        """Restores all tyre materials, display smoothing state, and resets camera."""
        if not IN_BLENDER:
            return
        self._display_tdi = {"FL": 0.0, "FR": 0.0, "RL": 0.0, "RR": 0.0}
        for corner in ("FL", "FR", "RL", "RR"):
            self._restore_corner_materials(corner)
        if self.scene_type == "F1_2022_STUDIO":
            for obj_name in ("tire_front", "rim_front", "tire_rear", "rim_rear"):
                obj = bpy.data.objects.get(obj_name)
                if obj:
                    obj.rotation_mode = 'XYZ'
                    obj.rotation_euler.x = 1.5707963705062866
                    obj.rotation_euler.y = 0.0
                    obj.rotation_euler.z = 0.0
        cam = bpy.data.objects.get("Camera")
        if cam and bpy.context.scene:
            bpy.context.scene.camera = cam


# ==============================================================================
# 4. GLOBAL BRIDGE ENGINE (SINGLETON & TIMER)
# ==============================================================================

class TyreTraceBridgeEngine:
    """Manages bridge lifecycle, timer callbacks, and state across Blender sessions."""

    def __init__(self):
        self.net_client = TyreTraceNetworkClient()
        self.scene_mgr = TyreTraceSceneManager()
        self.is_running = False
        self._timer_handle = None

    @property
    def scene_type(self) -> str:
        return self.scene_mgr.scene_type

    def start(self, url: str = "ws://localhost:8000/ws/telemetry") -> None:
        if self.is_running:
            return
        self.net_client.url = url
        self.net_client.start()
        self.is_running = True

        if IN_BLENDER and bpy.app.timers:
            if self._timer_handle is None or not bpy.app.timers.is_registered(self._timer_callback):
                bpy.app.timers.register(self._timer_callback, persistent=True)
                self._timer_handle = self._timer_callback
        logger.info("TyreTrace Blender bridge engine active.")

    def stop(self) -> None:
        if not self.is_running:
            return
        self.is_running = False
        self.net_client.stop()
        if IN_BLENDER and bpy.app.timers:
            if self._timer_handle and bpy.app.timers.is_registered(self._timer_callback):
                try:
                    bpy.app.timers.unregister(self._timer_callback)
                except Exception:
                    pass
                self._timer_handle = None
        self.scene_mgr.reset_all()
        logger.info("TyreTrace Blender bridge engine stopped.")

    def _timer_callback(self) -> Optional[float]:
        """Runs on Blender main thread every 25ms (~40 Hz)."""
        if not self.is_running:
            return None  # Unregister timer

        # Drain queue to latest frame
        latest_frame: Optional[TyreTraceFrame] = None
        while not self.net_client.frame_queue.empty():
            try:
                latest_frame = self.net_client.frame_queue.get_nowait()
            except queue.Empty:
                break

        if latest_frame:
            try:
                self.scene_mgr.apply_frame(latest_frame)
            except Exception as e:
                logger.debug(f"Scene update error: {e}")

        return 0.025  # 25 ms interval


# Global Bridge Instance
_BRIDGE_INSTANCE = TyreTraceBridgeEngine()


# ==============================================================================
# 5. BLENDER UI PANEL & OPERATORS
# ==============================================================================

if IN_BLENDER:

    class TYRETRACE_OT_Connect(bpy.types.Operator):
        """Connects Blender Digital Twin to TYRETRACE Telemetry Gateway"""
        bl_idname = "tyretrace.connect"
        bl_label = "Connect"
        bl_description = "Establish live WebSocket telemetry link to localhost:8000"

        def execute(self, context):
            url = context.scene.tyretrace_ws_url
            _BRIDGE_INSTANCE.start(url=url)
            self.report({'INFO'}, f"Connecting to TYRETRACE: {url}")
            return {'FINISHED'}

    class TYRETRACE_OT_Disconnect(bpy.types.Operator):
        """Disconnects Blender Digital Twin from Telemetry Gateway"""
        bl_idname = "tyretrace.disconnect"
        bl_label = "Disconnect"
        bl_description = "Sever connection to telemetry stream"

        def execute(self, context):
            _BRIDGE_INSTANCE.stop()
            self.report({'INFO'}, "Disconnected from TYRETRACE")
            return {'FINISHED'}

    class TYRETRACE_OT_SelectWheel(bpy.types.Operator):
        """Focuses and highlights a specific tyre corner"""
        bl_idname = "tyretrace.select_wheel"
        bl_label = "Select Tyre"
        bl_description = "Selects and highlights a wheel corner"
        
        corner: bpy.props.StringProperty(name="Corner", default="FL")

        def execute(self, context):
            _BRIDGE_INSTANCE.scene_mgr._update_tyre_selection(f"Wheel_{self.corner}")
            _BRIDGE_INSTANCE.scene_mgr._update_camera(f"Wheel_{self.corner}")
            self.report({'INFO'}, f"Selected {self.corner}")
            return {'FINISHED'}

    class TYRETRACE_OT_ResetCam(bpy.types.Operator):
        """Resets camera to global car overview"""
        bl_idname = "tyretrace.reset_view"
        bl_label = "Reset View"
        bl_description = "Return camera to full vehicle view"

        def execute(self, context):
            _BRIDGE_INSTANCE.scene_mgr.reset_all()
            self.report({'INFO'}, "Camera reset to overview")
            return {'FINISHED'}

    class TYRETRACE_PT_SidebarPanel(bpy.types.Panel):
        """TYRETRACE Motorsport Intelligence Command Panel in 3D Viewport"""
        bl_label = "TYRETRACE Digital Twin"
        bl_idname = "TYRETRACE_PT_SidebarPanel"
        bl_space_type = 'VIEW_3D'
        bl_region_type = 'UI'
        bl_category = 'TYRETRACE'

        def draw(self, context):
            layout = self.layout
            net = _BRIDGE_INSTANCE.net_client
            frame = net.last_frame

            # 1. Connection Header
            box_conn = layout.box()
            row_conn = box_conn.row(align=True)
            if net.is_connected:
                row_conn.label(text="● CONNECTED", icon='CHECKMARK')
            elif net.is_connecting:
                row_conn.label(text="◌ CONNECTING...", icon='FILE_REFRESH')
            else:
                row_conn.label(text="○ DISCONNECTED", icon='CANCEL')

            row_url = box_conn.row(align=True)
            row_url.prop(context.scene, "tyretrace_ws_url", text="")

            row_btns = box_conn.row(align=True)
            if not _BRIDGE_INSTANCE.is_running or not net.is_connected:
                row_btns.operator("tyretrace.connect", text="Connect", icon='PLAY')
            else:
                row_btns.operator("tyretrace.disconnect", text="Disconnect", icon='PAUSE')
            row_btns.operator("tyretrace.reset_view", text="Reset Cam", icon='SHADING_BBOX')

            if not frame:
                layout.label(text="Awaiting telemetry stream...", icon='INFO')
                return

            # 2. Live Telemetry HUD
            box_tel = layout.box()
            box_tel.label(text="CHASSIS TELEMETRY", icon='AUTO')
            col_tel = box_tel.column(align=True)
            col_tel.label(text=f"Speed: {frame.speed_kph:.1f} km/h  ({frame.speed_mps:.1f} m/s)")
            col_tel.label(text=f"Throttle: {frame.throttle_pct:.0f}% | Brake: {frame.brake_pct:.0f}%")
            col_tel.label(text=f"Gear: {frame.gear} | DRS: {'ACTIVE' if frame.drs_active else 'OFF'}")

            # 3. Global TDI Intelligence
            box_tdi = layout.box()
            box_tdi.label(text="TYRE DEGRADATION INTELLIGENCE", icon='MOD_FLUID')
            col_tdi = box_tdi.column(align=True)
            tdi_val_str = f"{frame.global_tdi:.1f}%" if frame.global_tdi is not None else "UNAVAILABLE"
            col_tdi.label(text=f"Global TDI: {tdi_val_str}  [{frame.degradation_state}]")
            col_tdi.label(text=f"Confidence: {int(frame.confidence * 100)}% | Trend: {frame.trend}")
            col_tdi.label(text=f"Mode: {frame.data_mode}")

            # 4. Four-Wheel Breakdown
            box_wheels = layout.box()
            box_wheels.label(text="CORNER INTELLIGENCE", icon='OUTLINER_OB_MESH')
            grid = box_wheels.grid_flow(columns=2, align=True)

            for corner in ("FL", "FR", "RL", "RR"):
                c_box = grid.box()
                c_tdi = frame.corner_tdi.get(corner)
                c_avail = frame.corner_available.get(corner, False)
                status_str = f"{c_tdi:.1f}%" if (c_avail and c_tdi is not None) else "UNAVAILABLE"
                
                c_row = c_box.row(align=True)
                op = c_row.operator("tyretrace.select_wheel", text=f"{corner}: {status_str}")
                op.corner = corner

    classes = (
        TYRETRACE_OT_Connect,
        TYRETRACE_OT_Disconnect,
        TYRETRACE_OT_SelectWheel,
        TYRETRACE_OT_ResetCam,
        TYRETRACE_PT_SidebarPanel,
    )

    def register():
        bpy.types.Scene.tyretrace_ws_url = bpy.props.StringProperty(
            name="WebSocket URL",
            description="TYRETRACE live telemetry WebSocket endpoint",
            default="ws://localhost:8000/ws/telemetry",
        )
        for cls in classes:
            bpy.utils.register_class(cls)
        # Auto-start bridge if requested via CLI flag or default
        if os.environ.get("TYRETRACE_AUTOSTART") == "1":
            _BRIDGE_INSTANCE.start()
        logger.info("Registered TYRETRACE Blender Bridge UI.")

    def unregister():
        _BRIDGE_INSTANCE.stop()
        for cls in reversed(classes):
            bpy.utils.unregister_class(cls)
        if hasattr(bpy.types.Scene, "tyretrace_ws_url"):
            del bpy.types.Scene.tyretrace_ws_url
        logger.info("Unregistered TYRETRACE Blender Bridge UI.")


if __name__ == "__main__":
    if IN_BLENDER:
        register()
        _BRIDGE_INSTANCE.start()
        print("TYRETRACE Bridge loaded and automatically connected inside Blender.")
    else:
        print("TYRETRACE Bridge: Running outside Blender environment.")

