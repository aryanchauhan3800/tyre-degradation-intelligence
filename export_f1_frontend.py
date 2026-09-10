import bpy
import bmesh
from mathutils import Vector
import os

print("--- STARTING F1 2022 FRONTEND GLB EXPORT ---")

# 1. Remove non-car collections
remove_col_names = [
    "studio_for_render",
    "studio_personal",
    "cameras",
    "cameras.001",
    "templates",
    "templates_f1_2022",
    "tire_video",
]

for c_name in remove_col_names:
    col = bpy.data.collections.get(c_name)
    if col:
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(col)

# Remove any remaining cameras, lights, or studio floor objects
for obj in list(bpy.data.objects):
    if obj.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(obj, do_unlink=True)
    elif "floor" in obj.name.lower() or obj.name in ("Plane", "Circle", "Cube"):
        bpy.data.objects.remove(obj, do_unlink=True)

# Remove hidden duplicate meshes that conflict with mixer meshes
# In this blend file, main_body collection was hide_render=True, replaced by main_body.003
col_main = bpy.data.collections.get("main_body")
if col_main:
    for obj in list(col_main.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col_main)

# Remove duplicate front wing parts (replaced by front_wing_complete / flap.001)
col_fw = bpy.data.collections.get("front_wing")
if col_fw:
    for obj in list(col_fw.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col_fw)

# Remove duplicate rear wing
col_rw = bpy.data.collections.get("rear_wing")
if col_rw:
    for obj in list(col_rw.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col_rw)

# Also remove duplicate front_wing_for_mixer (duplicate of front_wing_complete)
fw_dup = bpy.data.objects.get("front_wing_for_mixer")
if fw_dup:
    bpy.data.objects.remove(fw_dup, do_unlink=True)

# 2. Reset wheel rotations to baseline upright
for w_name in ("tire_front", "rim_front", "tire_rear", "rim_rear"):
    w = bpy.data.objects.get(w_name)
    if w:
        w.rotation_mode = 'XYZ'
        w.rotation_euler = (1.5707963705062866, 0.0, 0.0)

bpy.context.view_layer.update()

# 3. Process wheels: split mirror into FL, FR, RL, RR
def process_wheel_pair(tire_name, rim_name, corner_left, corner_right):
    tire_obj = bpy.data.objects.get(tire_name)
    rim_obj = bpy.data.objects.get(rim_name)
    if not tire_obj or not rim_obj:
        print(f"Error: {tire_name} or {rim_name} not found")
        return

    grp_l = bpy.data.objects.new(f"Wheel_{corner_left}", None)
    grp_r = bpy.data.objects.new(f"Wheel_{corner_right}", None)
    bpy.context.scene.collection.objects.link(grp_l)
    bpy.context.scene.collection.objects.link(grp_r)

    def split_mirrored(obj, part_type):
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        mw = obj.matrix_world.copy()

        # Build Left mesh (world Y < 0)
        bm_l = bmesh.new()
        bm_l.from_mesh(eval_mesh)
        del_verts_l = [v for v in bm_l.verts if (mw @ v.co).y > 0.0]
        bmesh.ops.delete(bm_l, geom=del_verts_l, context='VERTS')
        mesh_l = bpy.data.meshes.new(f"{part_type}_{corner_left}")
        bm_l.to_mesh(mesh_l)
        bm_l.free()

        # Build Right mesh (world Y > 0)
        bm_r = bmesh.new()
        bm_r.from_mesh(eval_mesh)
        del_verts_r = [v for v in bm_r.verts if (mw @ v.co).y < 0.0]
        bmesh.ops.delete(bm_r, geom=del_verts_r, context='VERTS')
        mesh_r = bpy.data.meshes.new(f"{part_type}_{corner_right}")
        bm_r.to_mesh(mesh_r)
        bm_r.free()

        eval_obj.to_mesh_clear()

        obj_l = bpy.data.objects.new(f"{part_type}_{corner_left}", mesh_l)
        obj_r = bpy.data.objects.new(f"{part_type}_{corner_right}", mesh_r)
        bpy.context.scene.collection.objects.link(obj_l)
        bpy.context.scene.collection.objects.link(obj_r)

        obj_l.matrix_world = mw.copy()
        obj_r.matrix_world = mw.copy()

        for s in obj.material_slots:
            if s.material:
                if part_type == "Tyre":
                    mat_l = s.material.copy()
                    mat_l.name = f"Tyre_{corner_left}"
                    obj_l.data.materials.append(mat_l)

                    mat_r = s.material.copy()
                    mat_r.name = f"Tyre_{corner_right}"
                    obj_r.data.materials.append(mat_r)
                else:
                    obj_l.data.materials.append(s.material)
                    obj_r.data.materials.append(s.material)

        return obj_l, obj_r

    tire_l, tire_r = split_mirrored(tire_obj, "Tyre")
    rim_l, rim_r = split_mirrored(rim_obj, "Rim")

    coords_l = [tire_l.matrix_world @ v.co for v in tire_l.data.vertices]
    center_l = Vector((
        sum(v.x for v in coords_l) / len(coords_l),
        sum(v.y for v in coords_l) / len(coords_l),
        sum(v.z for v in coords_l) / len(coords_l),
    ))
    grp_l.location = center_l

    coords_r = [tire_r.matrix_world @ v.co for v in tire_r.data.vertices]
    center_r = Vector((
        sum(v.x for v in coords_r) / len(coords_r),
        sum(v.y for v in coords_r) / len(coords_r),
        sum(v.z for v in coords_r) / len(coords_r),
    ))
    grp_r.location = center_r

    bpy.context.view_layer.update()

    for o in (tire_l, rim_l):
        o.parent = grp_l
        o.matrix_parent_inverse = grp_l.matrix_world.inverted()

    for o in (tire_r, rim_r):
        o.parent = grp_r
        o.matrix_parent_inverse = grp_r.matrix_world.inverted()

    bpy.data.objects.remove(tire_obj, do_unlink=True)
    bpy.data.objects.remove(rim_obj, do_unlink=True)

process_wheel_pair("tire_front", "rim_front", "FL", "FR")
process_wheel_pair("tire_rear", "rim_rear", "RL", "RR")

for v_name in ("tire_ventil_front", "tire_ventil_rear", "mirror_plane", "mirror_plane.001"):
    v_obj = bpy.data.objects.get(v_name)
    if v_obj:
        bpy.data.objects.remove(v_obj, do_unlink=True)

# 4. Tame Subsurf modifiers and optimize high-poly meshes for web performance
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        n_verts = len(obj.data.vertices)
        if obj.modifiers:
            for m in list(obj.modifiers):
                if m.type == 'SUBSURF':
                    if n_verts > 1000:
                        obj.modifiers.remove(m)
                    else:
                        m.levels = 1
                        m.render_levels = 1

        # Decimate extremely dense meshes (> 20k verts) so Three.js renders smoothly
        if n_verts > 20000 and "tire" not in obj.name.lower() and "wheel" not in obj.name.lower():
            ratio = 20000.0 / n_verts
            dec = obj.modifiers.new("Decimate_Web", 'DECIMATE')
            dec.ratio = max(0.15, ratio)
            print(f"Decimating {obj.name}: {n_verts} verts -> ratio {dec.ratio:.2f}")

# 5. Center car around (0, 0, 0)
min_pt = Vector((float('inf'), float('inf'), float('inf')))
max_pt = Vector((float('-inf'), float('-inf'), float('-inf')))

for obj in bpy.data.objects:
    if obj.type == 'MESH':
        for c in obj.bound_box:
            w_pt = obj.matrix_world @ Vector(c)
            min_pt.x = min(min_pt.x, w_pt.x)
            min_pt.y = min(min_pt.y, w_pt.y)
            min_pt.z = min(min_pt.z, w_pt.z)
            max_pt.x = max(max_pt.x, w_pt.x)
            max_pt.y = max(max_pt.y, w_pt.y)
            max_pt.z = max(max_pt.z, w_pt.z)

print(f"Car bounding box: X=[{min_pt.x:.2f}, {max_pt.x:.2f}], Y=[{min_pt.y:.2f}, {max_pt.y:.2f}], Z=[{min_pt.z:.2f}, {max_pt.z:.2f}]")

center_offset = Vector((
    (min_pt.x + max_pt.x) / 2.0,
    (min_pt.y + max_pt.y) / 2.0,
    min_pt.z,
))

car_root = bpy.data.objects.new("CAR_ROOT", None)
bpy.context.scene.collection.objects.link(car_root)

for obj in list(bpy.data.objects):
    if obj != car_root and obj.parent is None:
        obj.location -= center_offset

bpy.context.view_layer.update()

# 6. Export to GLB
out_dir = r"c:\Users\himan\Documents\TrackShift\tyre-degradation-intelligence\frontend\public\models"
os.makedirs(out_dir, exist_ok=True)
out_glb = os.path.join(out_dir, "f1_car.glb")

print(f"Exporting to {out_glb}...")
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)

size_mb = os.path.getsize(out_glb) / (1024 * 1024)
print(f"EXPORT COMPLETED! Size: {size_mb:.2f} MB")
