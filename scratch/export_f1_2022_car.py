"""
Master precision F1 2022 GLB exporter with Full Authentic Livery & Textures
Generates composite diffuse textures for:
- Car Body (Ferrari Rosso Corsa, black carbon aerodynamic accents, official sponsor badges & #1)
- Front Wing (Red endplates, white aerodynamic vortex stripes, black accents)
- Rear Wing (Satin Carbon Black with white sponsor graphics: Rolex, Emirates, Crypto.com, Aramco, DHL, Pirelli)
- Mirrors (Red housing + aerodynamic decals)
- Tyres (Official yellow Pirelli and P-Zero sidewall markings)
Excludes WIP/duplicate collections to prevent overlapping car geometry.
"""
import bpy
import bmesh
import math
import numpy as np
from mathutils import Vector, Matrix

print("=== STARTING MASTER F1 2022 AUTHENTIC LIVERY EXPORT ===")

# 1. Reset animation/euler rotation on wheels
wheel_names = ['tire_front', 'rim_front', 'tire_ventil_front', 'tire_rear', 'rim_rear', 'tire_ventil_rear']
for name in wheel_names:
    obj = bpy.data.objects.get(name)
    if obj:
        obj.rotation_euler.z = 0.0

# 2. Cap Subsurf modifiers
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        for m in obj.modifiers:
            if m.type == 'SUBSURF':
                m.levels = min(m.levels, 1)
                m.render_levels = min(m.render_levels, 1)

# 3. Decimate hyper-dense interior parts for smooth WebGL
heavy_names = [
    'cockpit_inner', 'steering_wheel_body.001', 'steering_wheel_top_buttons.001',
    'seatbelt_mechanism', 'seat', 'seat_soft_inner', 'paddle_holders.001',
    'steering_wheel_mount_shaft.001', 'steering_wheel_top_leds.001',
    'steering_wheel_turnable_knobs_top_side.001', 'steering_wheel_turning_knobs.001',
    'steering_wheel_turning_switches.001', 'rear_led_inner.001',
    'steering_wheel_middle_turning_knob.001'
]
for hname in heavy_names:
    obj = bpy.data.objects.get(hname)
    if obj and obj.type == 'MESH':
        mod = obj.modifiers.new(name="WebGl_Decimate", type='DECIMATE')
        mod.ratio = 0.25

mb = bpy.data.objects.get('main_body.003')
if mb:
    mod = mb.modifiers.new(name="WebGl_Decimate", type='DECIMATE')
    mod.ratio = 0.6

# 4. Generate Composite Livery Textures from Packed Blend Data
print("Generating composite diffuse textures...")

# Palette constants: authentic Ferrari F1-75 deep scarlet
ROSSO_CORSA = np.array([0.64, 0.016, 0.018], dtype=np.float32)
CARBON_BLACK = np.array([0.02, 0.02, 0.025], dtype=np.float32)
SATIN_CARBON = np.array([0.03, 0.03, 0.035], dtype=np.float32)
WHITE_DECAL = np.array([0.96, 0.96, 0.98], dtype=np.float32)
PIRELLI_YELLOW = np.array([0.96, 0.80, 0.04], dtype=np.float32)
TYRE_BASE = np.array([0.075, 0.075, 0.08], dtype=np.float32)

def get_image_array(name):
    img = bpy.data.images.get(name)
    if not img: return None
    arr = np.empty(img.size[0] * img.size[1] * img.channels, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape((img.size[1], img.size[0], img.channels))

# A. Body Diffuse Texture (4096 -> 2048)
img_red = get_image_array('f1_2022_ig_body_stickers_Metalness_red.png')
img_blk = get_image_array('f1_2022_ig_body_stickers_Metalness_black.png')

body_tex_path = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/scratch/f1_body_diffuse.png'
if img_red is not None and img_blk is not None:
    H, W = img_red.shape[:2]
    comp_body = np.zeros((H, W, 4), dtype=np.float32)
    comp_body[:, :, :3] = ROSSO_CORSA
    comp_body[:, :, 3] = 1.0
    
    # Black carbon accents
    mask_b = img_blk[:, :, :1]
    comp_body[:, :, :3] = comp_body[:, :, :3] * (1.0 - mask_b) + CARBON_BLACK * mask_b
    
    # White sponsor logos & badges
    mask_r = img_red[:, :, :1]
    comp_body[:, :, :3] = comp_body[:, :, :3] * (1.0 - mask_r) + WHITE_DECAL * mask_r
    
    comp_body_down = comp_body[::2, ::2, :]
    tex_img = bpy.data.images.new('f1_body_baked', width=comp_body_down.shape[1], height=comp_body_down.shape[0], alpha=True)
    tex_img.pixels.foreach_set(comp_body_down.ravel())
    tex_img.filepath_raw = body_tex_path
    tex_img.file_format = 'PNG'
    tex_img.save()
    print("  -> Saved body diffuse:", body_tex_path)

# B. Front Wing Diffuse Texture (4096 -> 2048)
img_fw = get_image_array('f12022_ig_bw_uv_front_wing_sticker.png')
fw_tex_path = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/scratch/f1_fw_diffuse.png'
if img_fw is not None:
    H, W = img_fw.shape[:2]
    comp_fw = np.zeros((H, W, 4), dtype=np.float32)
    comp_fw[:, :, :3] = ROSSO_CORSA
    comp_fw[:, :, 3] = 1.0
    
    # White vortex lines
    mask_fw = img_fw[:, :, :1]
    comp_fw[:, :, :3] = comp_fw[:, :, :3] * (1.0 - mask_fw) + WHITE_DECAL * mask_fw
    
    comp_fw_down = comp_fw[::2, ::2, :]
    tex_img = bpy.data.images.new('f1_fw_baked', width=comp_fw_down.shape[1], height=comp_fw_down.shape[0], alpha=True)
    tex_img.pixels.foreach_set(comp_fw_down.ravel())
    tex_img.filepath_raw = fw_tex_path
    tex_img.file_format = 'PNG'
    tex_img.save()
    print("  -> Saved front wing diffuse:", fw_tex_path)

# C. Rear Wing Diffuse Texture (4096 -> 2048)
img_rw = get_image_array('f1_2022_ig_rear_wing_stickers_Metalness.png')
rw_tex_path = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/scratch/f1_rw_diffuse.png'
if img_rw is not None:
    H, W = img_rw.shape[:2]
    comp_rw = np.zeros((H, W, 4), dtype=np.float32)
    comp_rw[:, :, :3] = SATIN_CARBON
    comp_rw[:, :, 3] = 1.0
    
    mask_rw = img_rw[:, :, :1]
    comp_rw[:, :, :3] = comp_rw[:, :, :3] * (1.0 - mask_rw) + WHITE_DECAL * mask_rw
    
    comp_rw_down = comp_rw[::2, ::2, :]
    tex_img = bpy.data.images.new('f1_rw_baked', width=comp_rw_down.shape[1], height=comp_rw_down.shape[0], alpha=True)
    tex_img.pixels.foreach_set(comp_rw_down.ravel())
    tex_img.filepath_raw = rw_tex_path
    tex_img.file_format = 'PNG'
    tex_img.save()
    print("  -> Saved rear wing diffuse:", rw_tex_path)

# D. Mirror Diffuse Texture (2048 -> 1024)
img_mir = get_image_array('f12022_ig_bw_uv_mirrors_stickers.png')
mir_tex_path = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/scratch/f1_mirror_diffuse.png'
if img_mir is not None:
    H, W = img_mir.shape[:2]
    comp_mir = np.zeros((H, W, 4), dtype=np.float32)
    comp_mir[:, :, :3] = ROSSO_CORSA
    comp_mir[:, :, 3] = 1.0
    
    mask_mir = img_mir[:, :, :1]
    comp_mir[:, :, :3] = comp_mir[:, :, :3] * (1.0 - mask_mir) + WHITE_DECAL * mask_mir
    
    comp_mir_down = comp_mir[::2, ::2, :]
    tex_img = bpy.data.images.new('f1_mir_baked', width=comp_mir_down.shape[1], height=comp_mir_down.shape[0], alpha=True)
    tex_img.pixels.foreach_set(comp_mir_down.ravel())
    tex_img.filepath_raw = mir_tex_path
    tex_img.file_format = 'PNG'
    tex_img.save()
    print("  -> Saved mirror diffuse:", mir_tex_path)

# E. Pirelli P-Zero Yellow Tyre Texture (3727 -> 1863)
img_pz = get_image_array('pzero_side_no_rim.png')
tyre_tex_path = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/scratch/f1_tyre_yellow.png'
if img_pz is not None:
    H, W = img_pz.shape[:2]
    comp_pz = np.zeros((H, W, 4), dtype=np.float32)
    comp_pz[:, :, :3] = TYRE_BASE
    comp_pz[:, :, 3] = 1.0
    
    alpha = img_pz[:, :, 3:4]
    comp_pz[:, :, :3] = comp_pz[:, :, :3] * (1.0 - alpha) + PIRELLI_YELLOW * alpha
    
    comp_pz_down = comp_pz[::2, ::2, :]
    tex_img = bpy.data.images.new('f1_pz_baked', width=comp_pz_down.shape[1], height=comp_pz_down.shape[0], alpha=True)
    tex_img.pixels.foreach_set(comp_pz_down.ravel())
    tex_img.filepath_raw = tyre_tex_path
    tex_img.file_format = 'PNG'
    tex_img.save()
    print("  -> Saved tyre diffuse:", tyre_tex_path)

# 5. PBR Material Setup Functions
carbon_norm_path = '/Users/aryanchauhan/Developer/tyre-degradation-intelligence/scratch/carbon 2.bmp.001.png'
carbon_norm_img = bpy.data.images.load(carbon_norm_path, check_existing=True)

def set_pbr_image(mat_name, img_path, roughness=0.20, metallic=0.14, coat=1.0, coat_roughness=0.06):
    m = bpy.data.materials.get(mat_name)
    if not m:
        m = bpy.data.materials.new(mat_name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    
    img = bpy.data.images.load(img_path, check_existing=True)
    tex_node = nodes.new('ShaderNodeTexImage')
    tex_node.image = img
    links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
    
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    elif 'Clearcoat' in bsdf.inputs:
        bsdf.inputs['Clearcoat'].default_value = coat
        bsdf.inputs['Clearcoat Roughness'].default_value = coat_roughness

def set_clean_pbr(mat_name, base_color, roughness=0.3, metallic=0.1, coat=0.0, coat_roughness=0.1):
    m = bpy.data.materials.get(mat_name)
    if not m:
        m = bpy.data.materials.new(mat_name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    elif 'Clearcoat' in bsdf.inputs:
        bsdf.inputs['Clearcoat'].default_value = coat
        bsdf.inputs['Clearcoat Roughness'].default_value = coat_roughness

def set_carbon_fiber_pbr(mat_name, roughness=0.34, metallic=0.10, coat=0.35):
    m = bpy.data.materials.get(mat_name)
    if not m:
        m = bpy.data.materials.new(mat_name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    
    bsdf.inputs['Base Color'].default_value = (0.015, 0.015, 0.018, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.12
    elif 'Clearcoat' in bsdf.inputs:
        bsdf.inputs['Clearcoat'].default_value = coat
        bsdf.inputs['Clearcoat Roughness'].default_value = 0.12
        
    tex_node = nodes.new('ShaderNodeTexImage')
    tex_node.image = carbon_norm_img
    
    norm_node = nodes.new('ShaderNodeNormalMap')
    norm_node.inputs['Strength'].default_value = 0.85
    
    links.new(tex_node.outputs['Color'], norm_node.inputs['Color'])
    links.new(norm_node.outputs['Normal'], bsdf.inputs['Normal'])

# Apply composite textures with clearcoat lacquer
print("Applying composite PBR textures...")
set_pbr_image('checkuered_texture', body_tex_path, roughness=0.20, metallic=0.14, coat=1.0, coat_roughness=0.06)
set_pbr_image('checkuered_texture.001', body_tex_path, roughness=0.20, metallic=0.14, coat=1.0, coat_roughness=0.06)
set_pbr_image('checkuered_texture._front_wing', fw_tex_path, roughness=0.20, metallic=0.14, coat=1.0, coat_roughness=0.06)
set_pbr_image('checkuered_texture_rear_wing', rw_tex_path, roughness=0.30, metallic=0.08, coat=0.5, coat_roughness=0.10)
set_pbr_image('checkuered_texture_mirror', mir_tex_path, roughness=0.20, metallic=0.14, coat=1.0, coat_roughness=0.06)
set_pbr_image('Tyre_Thermal_Front', tyre_tex_path, roughness=0.78, metallic=0.03, coat=0.0)
set_pbr_image('Tyre_Thermal_Rear', tyre_tex_path, roughness=0.78, metallic=0.03, coat=0.0)

# Authentic Woven Carbon Fiber for Floor, Diffuser, Undertray, Wings, and Wishbones
set_carbon_fiber_pbr('Carbon Fiber (no UV)', roughness=0.34, metallic=0.10, coat=0.35)
set_carbon_fiber_pbr('Carbon Fiber (no UV)_rough', roughness=0.45, metallic=0.08, coat=0.20)
set_carbon_fiber_pbr('Carbon Fiber (no UV)_rough_steering_wheel', roughness=0.42, metallic=0.08, coat=0.25)
set_carbon_fiber_pbr('Carbon Fiber (no UV).001', roughness=0.34, metallic=0.10, coat=0.35)
set_carbon_fiber_pbr('checkuered_texture_winglets', roughness=0.34, metallic=0.10, coat=0.35)
set_clean_pbr('checkuered_texture_foam_inner', (0.02, 0.02, 0.025, 1.0), roughness=0.85, metallic=0.0)

# Ferrari Rosso Corsa backup & winglet red
set_clean_pbr('red', (0.58, 0.012, 0.016, 1.0), roughness=0.20, metallic=0.14, coat=1.0, coat_roughness=0.06)

# BBS Rims & hardware
set_clean_pbr('Material.001', (0.045, 0.045, 0.05, 1.0), roughness=0.32, metallic=0.82)
set_clean_pbr('Material.002', (0.045, 0.045, 0.05, 1.0), roughness=0.32, metallic=0.82)
set_clean_pbr('Material.003', (0.82, 0.82, 0.85, 1.0), roughness=0.18, metallic=0.92)
set_clean_pbr('mirror', (0.95, 0.95, 0.98, 1.0), roughness=0.02, metallic=0.98)
set_clean_pbr('chrome', (0.90, 0.90, 0.92, 1.0), roughness=0.08, metallic=0.96)
set_clean_pbr('chrome_exhaust', (0.88, 0.88, 0.90, 1.0), roughness=0.10, metallic=0.95)
set_clean_pbr('chrome_exhaust_inner', (0.08, 0.08, 0.10, 1.0), roughness=0.45, metallic=0.85)
set_clean_pbr('AnodizedMetal_silver', (0.70, 0.70, 0.72, 1.0), roughness=0.20, metallic=0.88)
set_clean_pbr('AnodizedMetal_silver.001', (0.70, 0.70, 0.72, 1.0), roughness=0.20, metallic=0.88)
set_clean_pbr('AnodizedMetal_grey', (0.16, 0.16, 0.18, 1.0), roughness=0.30, metallic=0.75)
set_clean_pbr('AnodizedMetal_red', (0.70, 0.015, 0.015, 1.0), roughness=0.22, metallic=0.75)
set_clean_pbr('BMD_Brass', (0.85, 0.70, 0.22, 1.0), roughness=0.24, metallic=0.88)
set_clean_pbr('Fabric_seatbelts', (0.60, 0.015, 0.015, 1.0), roughness=0.75, metallic=0.0)

# Cockpit & LEDs
set_clean_pbr('mat_Plastic', (0.018, 0.018, 0.022, 1.0), roughness=0.55, metallic=0.05)
set_clean_pbr('mat_Plastic.001', (0.018, 0.018, 0.022, 1.0), roughness=0.55, metallic=0.05)
set_clean_pbr('mat_Plastic.002', (0.018, 0.018, 0.022, 1.0), roughness=0.55, metallic=0.05)
set_clean_pbr('Rubber', (0.02, 0.02, 0.025, 1.0), roughness=0.82, metallic=0.02)
set_clean_pbr('Rubber.001', (0.02, 0.02, 0.025, 1.0), roughness=0.82, metallic=0.02)
set_clean_pbr('BMD_Felt_0018', (0.02, 0.02, 0.02, 1.0), roughness=0.92, metallic=0.0)
set_clean_pbr('display_screen', (0.01, 0.01, 0.01, 1.0), roughness=0.08, metallic=0.1)
set_clean_pbr('rear_led_emmitor', (0.95, 0.02, 0.02, 1.0), roughness=0.15, metallic=0.0)
set_clean_pbr('glass_clear_headlight', (0.85, 0.88, 0.92, 1.0), roughness=0.05, metallic=0.12)
set_clean_pbr('glass_clear_headlight.001', (0.85, 0.88, 0.92, 1.0), roughness=0.05, metallic=0.12)
set_clean_pbr('led_steering_wheel', (0.0, 0.9, 0.2, 1.0), roughness=0.2, metallic=0.0)
set_clean_pbr('steering_wheel_inner_led', (0.95, 0.75, 0.0, 1.0), roughness=0.2, metallic=0.0)

dg = bpy.context.evaluated_depsgraph_get()

# 6. Build Wheel Meshes
def create_half_mesh_obj(src_name, side, new_name):
    src_obj = bpy.data.objects.get(src_name)
    if not src_obj: return None
    eval_obj = src_obj.evaluated_get(dg)
    mesh = eval_obj.to_mesh()
    
    bm = bmesh.new()
    bm.from_mesh(mesh)
    eval_obj.to_mesh_clear()
    
    bm.transform(src_obj.matrix_world)
    
    if side == 'LEFT':
        del_verts = [v for v in bm.verts if v.co.y > 0.0]
    else:
        del_verts = [v for v in bm.verts if v.co.y < 0.0]
    bmesh.ops.delete(bm, geom=del_verts, context='VERTS')
    
    new_mesh = bpy.data.meshes.new(new_name)
    for mat in src_obj.data.materials:
        new_mesh.materials.append(mat)
    bm.to_mesh(new_mesh)
    bm.free()
    
    new_obj = bpy.data.objects.new(new_name, new_mesh)
    bpy.context.collection.objects.link(new_obj)
    return new_obj

print("Building 4 individual wheels...")
# Front Left
fl_parts = [
    create_half_mesh_obj('tire_front', 'LEFT', 'fl_tire'),
    create_half_mesh_obj('rim_front', 'LEFT', 'fl_rim'),
    create_half_mesh_obj('tire_ventil_front', 'LEFT', 'fl_ventil')
]
bpy.ops.object.select_all(action='DESELECT')
for p in fl_parts: p.select_set(True)
bpy.context.view_layer.objects.active = fl_parts[0]
bpy.ops.object.join()
wheel_fl = fl_parts[0]
wheel_fl.name = 'Wheel_FL'

# Front Right
fr_parts = [
    create_half_mesh_obj('tire_front', 'RIGHT', 'fr_tire'),
    create_half_mesh_obj('rim_front', 'RIGHT', 'fr_rim'),
    create_half_mesh_obj('tire_ventil_front', 'RIGHT', 'fr_ventil')
]
bpy.ops.object.select_all(action='DESELECT')
for p in fr_parts: p.select_set(True)
bpy.context.view_layer.objects.active = fr_parts[0]
bpy.ops.object.join()
wheel_fr = fr_parts[0]
wheel_fr.name = 'Wheel_FR'

# Rear Left
rl_parts = [
    create_half_mesh_obj('tire_rear', 'LEFT', 'rl_tire'),
    create_half_mesh_obj('rim_rear', 'LEFT', 'rl_rim'),
    create_half_mesh_obj('tire_ventil_rear', 'LEFT', 'rl_ventil')
]
bpy.ops.object.select_all(action='DESELECT')
for p in rl_parts: p.select_set(True)
bpy.context.view_layer.objects.active = rl_parts[0]
bpy.ops.object.join()
wheel_rl = rl_parts[0]
wheel_rl.name = 'Wheel_RL'

# Rear Right
rr_parts = [
    create_half_mesh_obj('tire_rear', 'RIGHT', 'rr_tire'),
    create_half_mesh_obj('rim_rear', 'RIGHT', 'rr_rim'),
    create_half_mesh_obj('tire_ventil_rear', 'RIGHT', 'rr_ventil')
]
bpy.ops.object.select_all(action='DESELECT')
for p in rr_parts: p.select_set(True)
bpy.context.view_layer.objects.active = rr_parts[0]
bpy.ops.object.join()
wheel_rr = rr_parts[0]
wheel_rr.name = 'Wheel_RR'

# 7. Build Car Body Mesh (Strictly Exclude WIP / Duplicate Collections)
exclude_collections = {
    'body_panels', 'main_body', 'front_wing', 'rear_wing',
    'studio_for_render', 'studio_personal', 'tire_video',
    'templates', 'templates_f1_2022', 'Collection'
}
exclude_object_names = {
    'mirror', 'front_wing_bottom.001', 'front_wing_bottom_flap.001',
    'front_wing_middle_flap.001', 'front_wing_top_flap.001',
    'front_wing_for_mixer', 'tire_front', 'rim_front',
    'tire_ventil_front', 'tire_rear', 'rim_rear', 'tire_ventil_rear',
    'mirror_plane', 'mirror_plane.001'
}

body_objs = []
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name not in exclude_object_names and o not in [wheel_fl, wheel_fr, wheel_rl, wheel_rr]:
        cols = {c.name for c in o.users_collection}
        if cols.isdisjoint(exclude_collections) and not o.hide_render:
            body_objs.append(o)

print(f"Joining {len(body_objs)} car body components...")
converted_body = []
for src_obj in body_objs:
    eval_obj = src_obj.evaluated_get(dg)
    mesh = eval_obj.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    eval_obj.to_mesh_clear()
    
    bm.transform(src_obj.matrix_world)
    
    new_mesh = bpy.data.meshes.new('eval_' + src_obj.name)
    for mat in src_obj.data.materials:
        if mat and mat.name == 'mirror' and 'rear_wing' in src_obj.name:
            cf = bpy.data.materials.get('Carbon Fiber (no UV)')
            new_mesh.materials.append(cf if cf else mat)
        else:
            new_mesh.materials.append(mat)
    bm.to_mesh(new_mesh)
    bm.free()
    
    new_obj = bpy.data.objects.new('eval_' + src_obj.name, new_mesh)
    bpy.context.collection.objects.link(new_obj)
    converted_body.append(new_obj)

bpy.ops.object.select_all(action='DESELECT')
for o in converted_body: o.select_set(True)
bpy.context.view_layer.objects.active = converted_body[0]
bpy.ops.object.join()

car_body = converted_body[0]
car_body.name = 'Car_Body'

# 8. Remove extraneous objects
car_five = [car_body, wheel_fl, wheel_fr, wheel_rl, wheel_rr]
car_five_set = set(car_five)
for o in list(bpy.data.objects):
    if o not in car_five_set:
        bpy.data.objects.remove(o, do_unlink=True)

# 9. Coordinate Transformation: wheelbase 3.083m
src_wheelbase = 11.5604
target_wheelbase = 3.083
scale_factor = target_wheelbase / src_wheelbase
rot_z = Matrix.Rotation(math.radians(-90.0), 4, 'Z')
scale_mat = Matrix.Scale(scale_factor, 4)
transform_mat = scale_mat @ rot_z

for o in car_five:
    o.data.transform(transform_mat)
    o.data.update()

min_z = min(min(v.co.z for v in o.data.vertices) for o in [wheel_fl, wheel_fr, wheel_rl, wheel_rr])

y_shift = 1.241
z_shift = -min_z
x_shift = 0.0

trans_mat = Matrix.Translation(Vector((x_shift, y_shift, z_shift)))
for o in car_five:
    o.data.transform(trans_mat)
    o.data.update()

# 10. Set origin to geometry center for each object
for o in car_five:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')

print("=== FINAL OBJECT POSITIONS ===")
for o in car_five:
    bbox = [o.matrix_world @ Vector(v) for v in o.bound_box]
    center = sum(bbox, Vector((0,0,0))) / 8
    dims = Vector((
        max(v.x for v in bbox) - min(v.x for v in bbox),
        max(v.y for v in bbox) - min(v.y for v in bbox),
        max(v.z for v in bbox) - min(v.z for v in bbox),
    ))
    print(f"  {o.name:12} | origin=({o.location.x:+.3f}, {o.location.y:+.3f}, {o.location.z:+.3f}) | dims=({dims.x:.3f}, {dims.y:.3f}, {dims.z:.3f})")

# 11. Export to GLB
output_glb = "frontend/public/models/f1_car.glb"
print(f"Exporting to {output_glb}...")
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    export_image_format='AUTO',
    export_apply=False,
    export_yup=True
)
print("=== MASTER VIBRANT EXPORT FINISHED SUCCESSFULLY ===")
