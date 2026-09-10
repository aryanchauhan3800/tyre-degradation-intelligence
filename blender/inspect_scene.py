import bpy

print("=== ALL OBJECTS ===")
for obj in bpy.data.objects:
    parent_name = obj.parent.name if obj.parent else "None"
    print(f"{obj.name} | type={obj.type} | parent={parent_name} | rot_mode={obj.rotation_mode}")

print("\n=== WHEEL / TYRE OBJECTS DETAILS ===")
for obj in bpy.data.objects:
    if any(k in obj.name.lower() for k in ["wheel", "tyre", "tire", "rim", "brake"]):
        print(f"Object: {obj.name}, Parent: {obj.parent.name if obj.parent else None}, RotMode: {obj.rotation_mode}, RotEuler: {obj.rotation_euler}, Loc: {obj.location}")
        for slot in obj.material_slots:
            if slot.material:
                print(f"   Material: {slot.material.name}")

print("\n=== ALL MATERIALS ===")
for mat in bpy.data.materials:
    print(f"Material: {mat.name}, use_nodes={mat.use_nodes}")
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                base_color = node.inputs.get("Base Color")
                em_color = node.inputs.get("Emission Color")
                em_strength = node.inputs.get("Emission Strength")
                bc_val = base_color.default_value[:] if base_color else None
                em_val = em_color.default_value[:] if em_color else None
                str_val = em_strength.default_value if em_strength else None
                print(f"   BSDF_PRINCIPLED: BaseColor={bc_val}, EmColor={em_val}, EmStrength={str_val}")
