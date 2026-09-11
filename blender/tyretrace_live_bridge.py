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
for p in [
    getattr(site, "USER_SITE", None),
    os.path.expanduser("~/Library/Python/3.14/lib/python/site-packages"),
    os.path.expanduser("~/.local/lib/python3.14/site-packages"),
    os.path.expanduser("~/Library/Python/3.11/lib/python/site-packages"),
    os.path.expanduser("~/Library/Python/3.10/lib/python/site-packages"),
]:
    if p and os.path.exists(p) and p not in sys.path:
        sys.path.append(p)

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

        # 3. TDI Metrics
        global_tdi_raw = blender.get("global_tdi") or tdi_data.get("final_tdi")
        global_tdi = float(global_tdi_raw) if global_tdi_raw is not None else None
        
        phys_tdi_raw = tdi_data.get("physics_tdi")
        physics_tdi = float(phys_tdi_raw) if phys_tdi_raw is not None else None
        
        ai_tdi_raw = tdi_data.get("ai_tdi")
        ai_tdi = float(ai_tdi_raw) if ai_tdi_raw is not None else None

        confidence = float(tdi_data.get("confidence", 0.0))
        trend = str(tdi_data.get("trend", "STABLE"))
        state_str = str(blender.get("degradation_state") or tdi_data.get("state", "HEALTHY_LOW_EVIDENCE"))

        # 4. Confounders & Residual
        r_ax_raw = res_data.get("r_ax") or res_data.get("raw_residual_mps2")
        residual_rax = float(r_ax_raw) if r_ax_raw is not None else None
        
        conf_scores = conf_data.get("scores", {})
        evidence_quality = float(conf_scores.get("tyre_evidence_quality", 0.0))
        confounder_score = float(conf_scores.get("non_tyre_explanation_score", 0.0))

        # 5. Four-Wheel Degradation
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

        # 6. Selected Component
        selected_component = blender.get("selected_component") or data.get("selected_component")

        # Handle timestamp (could be numeric float or ISO-8601 string)
        ts_raw = data.get("timestamp") or telemetry.get("timestamp", 0.0)
        ts_sec = 0.0
        ts_iso = str(blender.get("timestamp_iso") or telemetry.get("timestamp_iso") or "")
        if isinstance(ts_raw, (int, float)):
            ts_sec = float(ts_raw)
        elif isinstance(ts_raw, str):
            try:
                ts_sec = float(ts_raw)
            except ValueError:
                ts_iso = ts_raw
                try:
                    ts_sec = float(telemetry.get("timestamp", 0.0))
                except (ValueError, TypeError):
                    ts_sec = 0.0

        lap_val = blender.get("lap") or telemetry.get("lap", 1)
        try:
            lap = int(lap_val)
        except (ValueError, TypeError):
            lap = 1

        return TyreTraceFrame(
            sequence=int(data.get("sequence", blender.get("sequence", 0))),
            timestamp_sec=ts_sec,
            timestamp_iso=ts_iso,
            lap=lap,
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
        )


# ==============================================================================
# 2. BACKGROUND NETWORK CLIENT
# ==============================================================================

class TyreTraceNetworkClient:
    """
    Background worker thread maintaining a persistent WebSocket connection to FastAPI.
    Deposits parsed frames into a thread-safe Queue consumed by Blender's main timer.
    """

    def __init__(self, url: str = "ws://127.0.0.1:8000/ws/telemetry", max_queue: int = 5):
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
            self._stop_event.set()
            self._thread.join(timeout=1.0)
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
        try:
            import asyncio
            import websockets
            has_websockets = True
        except Exception as e:
            has_websockets = False
            logger.warning(f"websockets package import failed: {e}; using HTTP polling fallback.")

        if has_websockets:
            self._run_asyncio_websockets()
        else:
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
                                frame = PayloadParser.parse(msg)
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
                                try:
                                    await ws.send("ping")
                                except Exception:
                                    break
                            except websockets.ConnectionClosed:
                                break
                except Exception as e:
                    self.is_connected = False
                    self.is_connecting = False
                    if not self._stop_event.is_set():
                        logger.debug(f"Connection attempt failed: {e}. Reconnecting in {reconnect_delay:.1f}s...")
                        await asyncio.sleep(reconnect_delay)
                        reconnect_delay = min(reconnect_delay * 1.5, 5.0)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_client_coroutine())
        except Exception as e:
            logger.debug(f"Asyncio loop exception: {e}")
        finally:
            loop.close()

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

    def __init__(self):
        self.last_update_time: float = time.time()
        self.active_selection: Optional[str] = None
        self._saved_material_states: Dict[str, Dict[str, Any]] = {}
        self._hud_text_obj_name = "TYRETRACE_HUD"
        self._cache_original_materials()

        # Check for Formula 1 2022 model (tire_front, tire_rear)
        self.is_ferrari_f1 = False
        if IN_BLENDER:
            if bpy.data.objects.get("tire_front") or bpy.data.objects.get("tire_rear"):
                self.is_ferrari_f1 = True
                self._setup_ferrari_thermal_materials()

    def _setup_ferrari_thermal_materials(self) -> None:
        """Sets up high-fidelity motorsport FLIR thermal shader node networks for F1 tyres."""
        if not IN_BLENDER:
            return

        def setup_thermal_mat(mat_name: str, base_mat_name: str):
            mat = bpy.data.materials.get(mat_name)
            if not mat:
                base_mat = bpy.data.materials.get(base_mat_name)
                if base_mat:
                    mat = base_mat.copy()
                    mat.name = mat_name
                else:
                    mat = bpy.data.materials.new(name=mat_name)
                    mat.use_nodes = True
            
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf:
                return mat

            tdi_node = nodes.get("TDI_Input")
            if not tdi_node:
                tdi_node = nodes.new(type='ShaderNodeValue')
                tdi_node.name = "TDI_Input"
                tdi_node.label = "TDI Input (0-100)"
                tdi_node.location = (bsdf.location.x - 700, bsdf.location.y - 250)
                tdi_node.outputs[0].default_value = 15.0

            div_node = nodes.get("TDI_Norm")
            if not div_node:
                div_node = nodes.new(type='ShaderNodeMath')
                div_node.name = "TDI_Norm"
                div_node.operation = 'DIVIDE'
                div_node.location = (bsdf.location.x - 520, bsdf.location.y - 250)
                div_node.inputs[1].default_value = 100.0
                links.new(tdi_node.outputs[0], div_node.inputs[0])

            ramp_node = nodes.get("Thermal_ColorRamp")
            if not ramp_node:
                ramp_node = nodes.new(type='ShaderNodeValToRGB')
                ramp_node.name = "Thermal_ColorRamp"
                ramp_node.location = (bsdf.location.x - 320, bsdf.location.y - 250)
                elements = ramp_node.color_ramp.elements
                elements[0].position = 0.0
                elements[0].color = (0.02, 0.03, 0.05, 1.0)
                e1 = elements.new(0.22)
                e1.color = (0.05, 0.85, 0.30, 1.0)
                e2 = elements.new(0.45)
                e2.color = (0.95, 0.75, 0.04, 1.0)
                e3 = elements.new(0.70)
                e3.color = (1.0, 0.30, 0.02, 1.0)
                elements[1].position = 1.0
                elements[1].color = (1.0, 0.02, 0.02, 1.0)
                links.new(div_node.outputs[0], ramp_node.inputs['Fac'])

            scale_node = nodes.get("Emission_Scale")
            if not scale_node:
                scale_node = nodes.new(type='ShaderNodeMath')
                scale_node.name = "Emission_Scale"
                scale_node.operation = 'MULTIPLY'
                scale_node.location = (bsdf.location.x - 140, bsdf.location.y - 380)
                scale_node.inputs[1].default_value = 2.4
                links.new(div_node.outputs[0], scale_node.inputs[0])

            links.new(ramp_node.outputs['Color'], bsdf.inputs['Emission Color'])
            links.new(scale_node.outputs['Value'], bsdf.inputs['Emission Strength'])
            return mat

        mat_front = setup_thermal_mat("Tyre_Thermal_Front", "Tyre Thread ")
        mat_rear = setup_thermal_mat("Tyre_Thermal_Rear", "Tyre Thread ")

        tf = bpy.data.objects.get("tire_front")
        tr = bpy.data.objects.get("tire_rear")
        if tf and mat_front:
            tf.material_slots[0].material = mat_front
        if tr and mat_rear:
            tr.material_slots[0].material = mat_rear

    def _set_ferrari_tdi(self, mat_name: str, tdi: float) -> None:
        if not IN_BLENDER:
            return
        mat = bpy.data.materials.get(mat_name)
        if mat and mat.node_tree:
            node = mat.node_tree.nodes.get("TDI_Input")
            if node:
                node.outputs[0].default_value = float(tdi)

    def _cache_original_materials(self) -> None:
        """Stores baseline material properties so they can be restored cleanly."""
        if not IN_BLENDER:
            return
        for corner, mat_names in self.CORNER_MATERIAL_MAP.items():
            for m_name in mat_names:
                mat = bpy.data.materials.get(m_name)
                if mat and mat.node_tree:
                    principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                    if principled:
                        em_input = principled.inputs.get("Emission Color")
                        em_strength = principled.inputs.get("Emission Strength")
                        self._saved_material_states[m_name] = {
                            "emission_color": tuple(em_input.default_value[:]) if em_input else (0, 0, 0, 1),
                            "emission_strength": float(em_strength.default_value) if em_strength else 1.0,
                        }

    def apply_frame(self, frame: TyreTraceFrame) -> None:
        """Executed strictly on Blender main thread."""
        if not IN_BLENDER:
            return

        now = time.time()
        dt = max(0.001, min(0.5, now - self.last_update_time))
        self.last_update_time = now

        # 1. Wheel Rotation Dynamics
        self._update_wheel_rotation(frame.speed_mps, dt)

        # 2. Selected Tyre Highlighting
        self._update_tyre_selection(frame.selected_component)

        # 3. TDI Visualization (Mode-Aware)
        self._update_tdi_visualization(frame)

        # 4. Camera View Alignment
        self._update_camera(frame.selected_component)

        # 5. Engineering HUD Overlay
        self._update_hud_overlay(frame)

    def _update_wheel_rotation(self, speed_mps: float, dt: float) -> None:
        """
        Rotates wheel meshes based on vehicle speed.
        Supports both Formula 2 model (Wheel_*) and Formula 1 model (tire_*, rim_*).
        """
        if abs(speed_mps) < 0.01:
            return

        if self.is_ferrari_f1:
            # Formula 1 model: bounding wheel radius ~1.217m, axis is rotation_euler.z
            wheel_radius = 1.217
            omega = speed_mps / wheel_radius
            dtheta = omega * dt
            for name in ("tire_front", "tire_rear", "rim_front", "rim_rear"):
                obj = bpy.data.objects.get(name)
                if obj:
                    obj.rotation_euler.z += dtheta
            return

        # Formula 2 model fallback
        omega = speed_mps / self.WHEEL_RADIUS_M
        dtheta = omega * dt

        for corner in ("FL", "RL"):
            obj_name = self.WHEEL_OBJECTS.get(corner)
            obj = bpy.data.objects.get(obj_name)
            if obj:
                obj.rotation_euler.z -= dtheta

        for corner in ("FR", "RR"):
            obj_name = self.WHEEL_OBJECTS.get(corner)
            obj = bpy.data.objects.get(obj_name)
            if obj:
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
            # Select object in Blender viewport if available
            obj = bpy.data.objects.get(self.WHEEL_OBJECTS.get(norm_selected, ""))
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
        Mode-Aware TDI Visualizer:
        - REAL_REPLAY: Zero fake wear. Tyres maintain standard neutral racing appearance.
        - DEMO_SIMULATION: Backend-supplied 4-wheel TDI mapped to visual degradation tiers.
          < 25: Healthy (subtle green tint)
          25–50: Moderate (amber)
          50–75: High (orange)
          75–100: Critical (red)
        """
        if self.is_ferrari_f1:
            # Map telemetry TDI to Ferrari front and rear thermal shaders
            front_tdi = None
            rear_tdi = None
            fl_tdi = frame.corner_tdi.get("FL")
            fr_tdi = frame.corner_tdi.get("FR")
            rl_tdi = frame.corner_tdi.get("RL")
            rr_tdi = frame.corner_tdi.get("RR")

            if fl_tdi is not None or fr_tdi is not None:
                front_tdi = ((fl_tdi or 0.0) + (fr_tdi or 0.0)) / (2.0 if (fl_tdi and fr_tdi) else 1.0)
            if rl_tdi is not None or rr_tdi is not None:
                rear_tdi = ((rl_tdi or 0.0) + (rr_tdi or 0.0)) / (2.0 if (rl_tdi and rr_tdi) else 1.0)

            # Fallback to global_tdi if corner-specific simulated data is absent
            if front_tdi is None and frame.global_tdi is not None:
                front_tdi = frame.global_tdi
            if rear_tdi is None and frame.global_tdi is not None:
                rear_tdi = frame.global_tdi

            if front_tdi is not None:
                self._set_ferrari_tdi("Tyre_Thermal_Front", front_tdi)
            if rear_tdi is not None:
                self._set_ferrari_tdi("Tyre_Thermal_Rear", rear_tdi)
            return

        if frame.data_mode != "DEMO_SIMULATION":
            # Real replay mode: keep tyres in neutral un-degraded visual state
            for corner in ("FL", "FR", "RL", "RR"):
                if corner != self.active_selection:
                    self._restore_corner_materials(corner)
            return

        # DEMO_SIMULATION Mode: map backend simulated TDI
        for corner, tdi_val in frame.corner_tdi.items():
            if corner == self.active_selection:
                continue  # Selection highlight takes visual precedence

            if tdi_val is None:
                self._restore_corner_materials(corner)
                continue

            # Color coding based on visualization tiers
            if tdi_val < 25.0:
                color = (0.1, 0.7, 0.2, 1.0)   # Healthy Green
                strength = 0.5
            elif tdi_val < 50.0:
                color = (1.0, 0.7, 0.0, 1.0)   # Moderate Amber
                strength = 1.0
            elif tdi_val < 75.0:
                color = (1.0, 0.35, 0.0, 1.0)  # High Orange
                strength = 1.5
            else:
                color = (1.0, 0.05, 0.05, 1.0)  # Critical Red
                strength = 2.0

            self._set_corner_materials_emission(corner, color, strength)

    def _update_camera(self, selected_component: Optional[str]) -> None:
        """
        Switches camera to focused close-up when a tyre is selected.
        Uses existing CAM_Wheel_FL_Close when FL is selected, and Camera for overview.
        """
        norm = self._normalize_component_name(selected_component)
        scene = bpy.context.scene
        if not scene:
            return

        cam_overview = bpy.data.objects.get("Camera")
        cam_fl_close = bpy.data.objects.get("CAM_Wheel_FL_Close")

        if norm == "FL" and cam_fl_close:
            scene.camera = cam_fl_close
        elif cam_overview:
            scene.camera = cam_overview

    def _update_hud_overlay(self, frame: TyreTraceFrame) -> None:
        """Renders a small engineering text HUD directly in the 3D scene."""
        text_obj = bpy.data.objects.get(self._hud_text_obj_name)
        tdi_str = f"{frame.global_tdi:.1f}%" if frame.global_tdi is not None else "UNAVAILABLE"
        conf_str = f"{int(frame.confidence * 100)}%" if frame.confidence > 0 else "LOW"
        
        hud_content = (
            f"TYRETRACE | {frame.data_mode}\n"
            f"TDI: {tdi_str} ({frame.degradation_state}) | CONF: {conf_str}\n"
            f"SPD: {frame.speed_kph:.0f} km/h | GEAR: {frame.gear} | DRS: {'ON' if frame.drs_active else 'OFF'}\n"
            f"LAP: {frame.lap} | SEQ: #{frame.sequence}"
        )

        if text_obj and text_obj.type == 'FONT':
            text_obj.data.body = hud_content
        else:
            # Create lightweight 3D text overlay if it doesn't exist
            try:
                font_curve = bpy.data.curves.new(type="FONT", name="TyreTraceFont")
                font_curve.body = hud_content
                font_curve.size = 0.45 if self.is_ferrari_f1 else 0.22
                new_obj = bpy.data.objects.new(self._hud_text_obj_name, font_curve)
                if self.is_ferrari_f1:
                    new_obj.location = Vector((4.5, -4.2, 1.6))
                    new_obj.rotation_euler = Euler((math.radians(90), 0, math.radians(110)), 'XYZ')
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
        for m_name in self.CORNER_MATERIAL_MAP.get(corner, []):
            mat = bpy.data.materials.get(m_name)
            saved = self._saved_material_states.get(m_name)
            if mat and mat.node_tree and saved:
                principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if principled:
                    em_input = principled.inputs.get("Emission Color")
                    em_strength = principled.inputs.get("Emission Strength")
                    if em_input:
                        em_input.default_value = saved["emission_color"]
                    if em_strength:
                        em_strength.default_value = saved["emission_strength"]

    def _set_corner_materials_emission(self, corner: str, color: Tuple[float, float, float, float], strength: float) -> None:
        for m_name in self.CORNER_MATERIAL_MAP.get(corner, []):
            mat = bpy.data.materials.get(m_name)
            if mat and mat.node_tree:
                principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if principled:
                    em_input = principled.inputs.get("Emission Color")
                    em_strength = principled.inputs.get("Emission Strength")
                    if em_input:
                        em_input.default_value = color
                    if em_strength:
                        em_strength.default_value = strength

    def reset_all(self) -> None:
        """Restores all tyre materials and resets camera."""
        if not IN_BLENDER:
            return
        if self.is_ferrari_f1:
            self._set_ferrari_tdi("Tyre_Thermal_Front", 0.0)
            self._set_ferrari_tdi("Tyre_Thermal_Rear", 0.0)
        for corner in ("FL", "FR", "RL", "RR"):
            self._restore_corner_materials(corner)
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

    def start(self, url: str = "ws://127.0.0.1:8000/ws/telemetry") -> None:
        if self.is_running:
            return
        self.net_client.url = url
        self.net_client.start()
        self.is_running = True

        if IN_BLENDER and bpy.app.timers:
            if not bpy.app.timers.is_registered(_global_tyretrace_timer):
                bpy.app.timers.register(_global_tyretrace_timer, persistent=True)
        logger.info("TyreTrace Blender bridge engine active.")

    def stop(self) -> None:
        if not self.is_running:
            return
        self.is_running = False
        self.net_client.stop()
        if IN_BLENDER and bpy.app.timers:
            if bpy.app.timers.is_registered(_global_tyretrace_timer):
                try:
                    bpy.app.timers.unregister(_global_tyretrace_timer)
                except Exception:
                    pass
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


def _global_tyretrace_timer() -> Optional[float]:
    if _BRIDGE_INSTANCE and _BRIDGE_INSTANCE.is_running:
        return _BRIDGE_INSTANCE._timer_callback()
    return None


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
            default="ws://127.0.0.1:8000/ws/telemetry",
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

