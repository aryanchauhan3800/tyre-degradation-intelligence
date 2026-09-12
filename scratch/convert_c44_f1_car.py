"""
Convert Kick Sauber C44.glb into production f1_car.glb:
- Separates 4 independent wheels: Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR
- Joins remaining aerodynamic body components into Car_Body
- Preserves 100% of the 4K Stake livery, carbon textures, and sponsor decals
- Aligns orientation: Front wing facing +Y (up on screen), Rear wing at -Y
- Normalizes scale to standard F1 wheelbase (3.083m) and sets ground contact at Z=0.0
"""
import bpy
import bmesh
import mathutils
import math
import shutil
import os

print("=== CONVERTING C44.glb TO PRODUCTION F1 CAR MODEL ===")

C44_PATH = '/Users/aryanchauhan/Downloads/C44.glb'
TARGET_GLB = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend/public/models/f1_car.glb'
BACKUP_GLB = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend/public/models/f1_car_ferrari.glb.bak'

# Backup existing model
if os.path.exists(TARGET_GLB) and not os.path.exists(BACKUP_GLB):
    shutil.copyfile(TARGET_GLB, BACKUP_GLB)
    print(f"Backed up existing model to {BACKUP_GLB}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=C44_PATH)

# 1. Ensure all meshes have 'UVMap' layer and a default material if unassigned
default_mat = bpy.data.materials.new('Hardware_Metal')
default_mat.use_nodes = True
bsdf = default_mat.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.08, 0.08, 0.10, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.25
    bsdf.inputs['Metallic'].default_value = 0.85

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        elif obj.data.uv_layers[0].name != 'UVMap':
            obj.data.uv_layers[0].name = 'UVMap'
        if not obj.material_slots or not obj.material_slots[0].material:
            obj.data.materials.append(default_mat)

# 2. Split model_9 and model_10 into the 4 wheels
wheel_objs = [bpy.data.objects['model_9'], bpy.data.objects['model_10']]
corners = {
    'FL': {'x_sign': 1, 'y_min': -3.5, 'y_max': -1.5},
    'FR': {'x_sign': -1, 'y_min': -3.5, 'y_max': -1.5},
    'RL': {'x_sign': 1, 'y_min': 2.5, 'y_max': 4.5},
    'RR': {'x_sign': -1, 'y_min': 2.5, 'y_max': 4.5},
}

split_wheel_parts = {'FL': [], 'FR': [], 'RL': [], 'RR': []}
for src_obj in wheel_objs:
    for cname, cfg in corners.items():
        bm = bmesh.new()
        bm.from_mesh(src_obj.data)
        del_verts = [v for v in bm.verts if not (((v.co.x * cfg['x_sign']) > 0.4) and (cfg['y_min'] <= v.co.y <= cfg['y_max']))]
        bmesh.ops.delete(bm, geom=del_verts, context='VERTS')
        part_mesh = bpy.data.meshes.new(f'{src_obj.name}_{cname}')
        for mat in src_obj.data.materials:
            part_mesh.materials.append(mat)
        bm.to_mesh(part_mesh)
        bm.free()
        part_obj = bpy.data.objects.new(f'{src_obj.name}_{cname}', part_mesh)
        bpy.context.collection.objects.link(part_obj)
        split_wheel_parts[cname].append(part_obj)

joined_wheels = {}
for cname, parts in split_wheel_parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    w = parts[0]
    w.name = f'Wheel_{cname}'
    joined_wheels[cname] = w
    print(f"Created {w.name} with {len(w.data.vertices)} vertices")

for o in wheel_objs:
    bpy.data.objects.remove(o, do_unlink=True)

# 3. Join body parts into Car_Body, ensuring active object has UVMap and textured material
body_parts = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Wheel_')]
active_body = bpy.data.objects.get('model_11') or body_parts[0]
bpy.ops.object.select_all(action='DESELECT')
for p in body_parts: p.select_set(True)
bpy.context.view_layer.objects.active = active_body
bpy.ops.object.join()
car_body = active_body
car_body.name = 'Car_Body'
print(f"Created Car_Body with {len(car_body.data.vertices)} vertices")

# 4. Transform: Rotate 180 Z, Scale to wheelbase 3.083m, align ground Z=0.0
all_objs = [car_body] + list(joined_wheels.values())
rot_mat = mathutils.Matrix.Rotation(math.radians(180), 4, 'Z')
for o in all_objs: o.data.transform(rot_mat)

fl_verts = [v.co for v in joined_wheels['FL'].data.vertices]
fr_verts = [v.co for v in joined_wheels['FR'].data.vertices]
rl_verts = [v.co for v in joined_wheels['RL'].data.vertices]
rr_verts = [v.co for v in joined_wheels['RR'].data.vertices]
front_y = (sum(v.y for v in fl_verts)/len(fl_verts) + sum(v.y for v in fr_verts)/len(fr_verts)) / 2
rear_y = (sum(v.y for v in rl_verts)/len(rl_verts) + sum(v.y for v in rr_verts)/len(rr_verts)) / 2
current_wheelbase = front_y - rear_y

TARGET_WHEELBASE = 3.083
scale_factor = TARGET_WHEELBASE / current_wheelbase
scale_mat = mathutils.Matrix.Scale(scale_factor, 4)
for o in all_objs: o.data.transform(scale_mat)

min_z = min(min(v.co.z for v in o.data.vertices) for o in joined_wheels.values())
center_y = (front_y * scale_factor + rear_y * scale_factor) / 2
target_center_y = (1.241 - 1.842) / 2 # -0.3005 m
trans_mat = mathutils.Matrix.Translation(mathutils.Vector((0, target_center_y - center_y, -min_z)))
for o in all_objs: o.data.transform(trans_mat)

for o in all_objs:
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')

print("=== FINAL OBJECT POSITIONS ===")
for o in all_objs:
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    print(f"  {o.name:12} | origin=({o.location.x:+.3f}, {o.location.y:+.3f}, {o.location.z:+.3f}) | X=[{min(xs):.2f}, {max(xs):.2f}] | Y=[{min(ys):.2f}, {max(ys):.2f}] | Z=[{min(zs):.2f}, {max(zs):.2f}]")

# 5. Export to production GLB
print(f"Exporting converted model to {TARGET_GLB}...")
bpy.ops.object.select_all(action='DESELECT')
for o in all_objs: o.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=TARGET_GLB,
    use_selection=True,
    export_format='GLB',
    export_materials='EXPORT',
    export_texcoords=True,
    export_normals=True,
    export_tangents=True,
    export_cameras=False,
    export_lights=False,
    export_draco_mesh_compression_enable=False,
)

print("=== C44 MODEL CONVERSION & EXPORT COMPLETE ===")
