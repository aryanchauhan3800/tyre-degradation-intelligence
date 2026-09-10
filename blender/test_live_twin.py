import sys
import os
import time
from pathlib import Path

# Ensure root is in sys.path
sys.path.insert(0, ".")

import bpy
from blender.tyretrace_live_bridge import (
    PayloadParser,
    TyreTraceSceneManager,
    TyreTraceBridgeEngine,
    _BRIDGE_INSTANCE,
)

print("=== STARTING BLENDER LIVE DIGITAL TWIN VERIFICATION ===")

scene_mgr = TyreTraceSceneManager()

# 1. Verify 4 Wheel Objects exist in scene
for corner, obj_name in scene_mgr.WHEEL_OBJECTS.items():
    obj = bpy.data.objects.get(obj_name)
    assert obj is not None, f"Wheel object {obj_name} ({corner}) not found in Blender scene!"
    print(f"Verified wheel object: {corner} -> {obj.name}")

# 2. Verify all tyre materials exist in scene
for corner, mat_names in scene_mgr.CORNER_MATERIAL_MAP.items():
    for m_name in mat_names:
        mat = bpy.data.materials.get(m_name)
        assert mat is not None, f"Material {m_name} ({corner}) not found in Blender scene!"
        assert mat.node_tree is not None, f"Material {m_name} has no node tree!"
    print(f"Verified materials for corner {corner}: {mat_names}")

# 3. Test Wheel Rotation Dynamics
print("\n--- Testing Wheel Rotation Dynamics ---")
fl = bpy.data.objects["Wheel_FL"]
fr = bpy.data.objects["Wheel_FR"]
rl = bpy.data.objects["Wheel_RL"]
rr = bpy.data.objects["Wheel_RR"]

fl_init_z = fl.rotation_euler.z
fr_init_z = fr.rotation_euler.z
rl_init_z = rl.rotation_euler.z
rr_init_z = rr.rotation_euler.z

# Simulate frame with speed = 80.0 m/s (~288 km/h)
payload_speed = {
    "blender": {
        "vehicle": {"speed_mps": 80.0, "speed_kph": 288.0},
        "global_tdi": 10.0,
        "data_mode": "REPLAY",
    }
}
frame_speed = PayloadParser.parse(payload_speed)
assert frame_speed is not None
scene_mgr.apply_frame(frame_speed)

# Check rotation: Left wheels (FL, RL) decrease Z, Right wheels (FR, RR) increase Z
fl_d1 = fl.rotation_euler.z - fl_init_z
fr_d1 = fr.rotation_euler.z - fr_init_z
rl_d1 = rl.rotation_euler.z - rl_init_z
rr_d1 = rr.rotation_euler.z - rr_init_z

print(f"FL rotation delta: {fl_d1:.4f} rad")
print(f"FR rotation delta: {fr_d1:.4f} rad")
print(f"RL rotation delta: {rl_d1:.4f} rad")
print(f"RR rotation delta: {rr_d1:.4f} rad")

assert fl_d1 < 0.0, "Left wheel FL should rotate in negative Z direction"
assert rl_d1 < 0.0, "Left wheel RL should rotate in negative Z direction"
assert fr_d1 > 0.0, "Right wheel FR should rotate in positive Z direction"
assert rr_d1 > 0.0, "Right wheel RR should rotate in positive Z direction"
assert abs(abs(fl_d1) - abs(fr_d1)) < 1e-4, "Left and right wheels should rotate at equal angular magnitude"
print("Wheel rotation direction and magnitude verified: SUCCESS")

# Test speed = 0: wheels must stop rotating
time.sleep(0.05)
fl_z_before_stop = fl.rotation_euler.z
payload_zero = {
    "blender": {
        "vehicle": {"speed_mps": 0.0, "speed_kph": 0.0},
        "global_tdi": 10.0,
        "data_mode": "REPLAY",
    }
}
frame_zero = PayloadParser.parse(payload_zero)
scene_mgr.apply_frame(frame_zero)
assert fl.rotation_euler.z == fl_z_before_stop, "Wheels must stop rotating when speed is zero!"
print("Zero speed stop verified: SUCCESS")

# 4. Test REPLAY mode: Global TDI applied consistently to all 4 wheels
print("\n--- Testing REPLAY mode (Global TDI = 60.0, Yellow-Orange) ---")
payload_replay = {
    "blender": {
        "data_mode": "REPLAY",
        "vehicle": {"speed_mps": 50.0},
        "global_tdi": 60.0,
        "tyres": {
            "FL": {"available": False, "tdi": None},
            "FR": {"available": False, "tdi": None},
            "RL": {"available": False, "tdi": None},
            "RR": {"available": False, "tdi": None},
        }
    }
}
frame_replay = PayloadParser.parse(payload_replay)
# Apply a few ticks to let smoothing converge
for _ in range(25):
    scene_mgr.apply_frame(frame_replay)

# Check all 4 wheels have glowing thermal materials corresponding to TDI ~60 (Yellow/Orange)
for corner in ("FL", "FR", "RL", "RR"):
    mat = bpy.data.materials.get(f"Tyre_{corner}_Center")
    principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    em_color = principled.inputs.get("Emission Color").default_value[:]
    em_strength = principled.inputs.get("Emission Strength").default_value
    base_color = principled.inputs.get("Base Color").default_value[:]
    print(f"{corner} (TDI ~60): BaseColor={base_color[:3]}, EmColor={em_color[:3]}, EmStrength={em_strength:.2f}")
    assert em_strength > 1.5, f"Thermal emission should be active on {corner}"
    assert em_color[0] > 0.8, f"Thermal emission should be yellowish-orange on {corner}"

print("REPLAY mode global TDI visualization verified: SUCCESS")

# 5. Test DEMO_SIMULATION mode: Per-wheel individual TDI values
print("\n--- Testing DEMO_SIMULATION mode (Different TDI per corner) ---")
# FL: 10 (Cool blue), FR: 30 (Green), RL: 50 (Yellow), RR: 85 (Red)
payload_demo = {
    "blender": {
        "data_mode": "DEMO_SIMULATION",
        "vehicle": {"speed_mps": 60.0},
        "global_tdi": 43.7,
        "tyres": {
            "FL": {"available": True, "tdi": 10.0},
            "FR": {"available": True, "tdi": 30.0},
            "RL": {"available": True, "tdi": 50.0},
            "RR": {"available": True, "tdi": 85.0},
        }
    }
}
frame_demo = PayloadParser.parse(payload_demo)
for _ in range(35):
    scene_mgr.apply_frame(frame_demo)

# Verify FL is cool blue
fl_mat = bpy.data.materials.get("Tyre_FL_Center")
fl_principled = next(n for n in fl_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
fl_em = fl_principled.inputs.get("Emission Color").default_value[:]
print(f"FL (TDI 10, Cool Blue): EmColor={fl_em[:3]}")
assert fl_em[2] > fl_em[0], "FL should have blue dominant emission"

# Verify FR is green
fr_mat = bpy.data.materials.get("Tyre_FR_Center")
fr_principled = next(n for n in fr_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
fr_em = fr_principled.inputs.get("Emission Color").default_value[:]
print(f"FR (TDI 30, Green): EmColor={fr_em[:3]}")
assert fr_em[1] > fr_em[0] and fr_em[1] > fr_em[2], "FR should have green dominant emission"

# Verify RL is yellow
rl_mat = bpy.data.materials.get("Tyre_RL_Center")
rl_principled = next(n for n in rl_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
rl_em = rl_principled.inputs.get("Emission Color").default_value[:]
print(f"RL (TDI 50, Yellow): EmColor={rl_em[:3]}")
assert rl_em[0] > 0.5 and rl_em[1] > 0.5, "RL should have yellow emission"

# Verify RR is red / hot
rr_mat = bpy.data.materials.get("Tyre_RR_Center")
rr_principled = next(n for n in rr_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
rr_em = rr_principled.inputs.get("Emission Color").default_value[:]
rr_str = rr_principled.inputs.get("Emission Strength").default_value
print(f"RR (TDI 85, Red Hot): EmColor={rr_em[:3]}, EmStrength={rr_str:.2f}")
assert rr_em[0] > 0.8 and rr_em[1] < 0.3, "RR should have red dominant emission"
assert rr_str > 3.0, "RR should have high emission strength"

print("DEMO_SIMULATION per-wheel thermal visualization verified: SUCCESS")

# 6. Test reset_all() restores baseline materials
print("\n--- Testing reset_all() ---")
scene_mgr.reset_all()
for corner in ("FL", "FR", "RL", "RR"):
    mat = bpy.data.materials.get(f"Tyre_{corner}_Center")
    principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    em_str = principled.inputs.get("Emission Strength").default_value
    base_col = principled.inputs.get("Base Color").default_value[:]
    assert em_str == 0.0, f"Corner {corner} emission should be restored to 0.0"
    assert base_col == (0.0, 0.0, 0.0, 1.0), f"Corner {corner} base color should be restored to black"
print("Baseline material restoration verified: SUCCESS")

print("\n=== ALL BLENDER DIGITAL TWIN VERIFICATIONS PASSED SUCCESSFULLY ===")
