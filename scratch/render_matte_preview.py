import bpy
import math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/Users/aryanchauhan/Developer/tyre-degradation-intelligence/frontend/public/models/f1_car.glb')

# Elevate pitch black materials to natural charcoal
for mat in bpy.data.materials:
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Roughness'].default_value = 0.45
                node.inputs['Metallic'].default_value = 0.05
                if 'Specular IOR Level' in node.inputs:
                    node.inputs['Specular IOR Level'].default_value = 0.4
                elif 'Specular' in node.inputs:
                    node.inputs['Specular'].default_value = 0.4
                if not node.inputs['Base Color'].is_linked:
                    c = node.inputs['Base Color'].default_value
                    if c[0] < 0.1 and c[1] < 0.1 and c[2] < 0.1:
                        node.inputs['Base Color'].default_value = (0.16, 0.17, 0.20, 1.0)

# Natural daylight studio world
world = bpy.data.worlds.new("NaturalWorld")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.97, 0.98, 0.99, 1.0)
bg.inputs['Strength'].default_value = 0.95

# Main overhead soft area light (centered, slight forward offset)
sun_data = bpy.data.lights.new(name="TopKey", type='AREA')
sun_data.energy = 650
sun_data.size = 8.0
sun_obj = bpy.data.objects.new(name="TopKey", object_data=sun_data)
bpy.context.scene.collection.objects.link(sun_obj)
sun_obj.location = (0.5, 0.5, 8.0)

# Opposing fill
fill_data = bpy.data.lights.new(name="Fill", type='AREA')
fill_data.energy = 350
fill_data.size = 10.0
fill_obj = bpy.data.objects.new(name="Fill", object_data=fill_data)
bpy.context.scene.collection.objects.link(fill_obj)
fill_obj.location = (-0.5, -0.5, 7.0)

# Ground
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.005))
ground = bpy.context.active_object
gmat = bpy.data.materials.new("GMat")
gmat.use_nodes = True
g_bsdf = gmat.node_tree.nodes['Principled BSDF']
g_bsdf.inputs['Base Color'].default_value = (0.97, 0.98, 0.99, 1.0)
g_bsdf.inputs['Roughness'].default_value = 0.95
ground.data.materials.append(gmat)

# Top down camera (matching frontend DEFAULT_CAM_POS = (0, 10.8, 0.35))
cam_data = bpy.data.cameras.new("TopCam")
cam_obj = bpy.data.objects.new("TopCam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# In Blender Z is up, in Three.js Y is up
# Three.js (0, 10.8, 0.35) -> Blender (0, -0.35, 10.8)
cam_obj.location = (0.0, -0.35, 10.8)
cam_obj.rotation_euler = (0, 0, 0)

bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
bpy.context.scene.render.resolution_x = 1024
bpy.context.scene.render.resolution_y = 1024
bpy.context.scene.render.filepath = "/Users/aryanchauhan/.gemini/antigravity-ide/brain/7d759fdc-94bc-4515-bd59-7aafa7ffabf0/c44_topdown_natural_preview.png"

bpy.ops.render.render(write_still=True)
print("Rendered topdown natural preview!")
