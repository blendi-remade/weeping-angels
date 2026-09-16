import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix
root=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/source/angel-rigged.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name=='char1')
arm.animation_data_clear()
for o in list(bpy.context.scene.objects):
    if o not in [arm,mesh]:bpy.data.objects.remove(o,do_unlink=True)
for p in arm.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
# Meshy's rig uses centimetres within an armature scaled to metres. Correct
# the display tails while preserving bone matrices and deformation bind poses.
print('mesh local bounds',list(mesh.data.vertices[0].co),'matrix',list(mesh.matrix_world),flush=True)
for mat in mesh.data.materials:
    if mat and mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type=='BSDF_PRINCIPLED':
                node.inputs['Emission Strength'].default_value=0
                node.inputs['Metallic'].default_value=0
                node.inputs['Roughness'].default_value=.9
                if 'Specular IOR Level' in node.inputs:node.inputs['Specular IOR Level'].default_value=.3
# Keep the stone wings bound to the spine, not dragged along with the arms.
group_indices={g.name:g.index for g in mesh.vertex_groups}
spine_group=mesh.vertex_groups.get('Spine')
corrected=0
for v in mesh.data.vertices:
    co=arm.matrix_world.inverted() @ (mesh.matrix_world @ v.co)
    if (co.y>6 and co.z>65 and abs(co.x)>18) or (abs(co.x)>42 and co.y>-12 and co.z>60):
        for g in mesh.vertex_groups:g.remove([v.index])
        spine_group.add([v.index],1.0,'REPLACE');corrected+=1
print('wing vertices stabilized',corrected,flush=True)
deps=bpy.context.evaluated_depsgraph_get()
def coords():
    bpy.context.view_layer.update();ev=mesh.evaluated_get(deps);m=ev.to_mesh();out=[v.co.copy() for v in m.vertices];ev.to_mesh_clear();return out
base=coords()
rest={p.name:p.matrix.copy() for p in arm.pose.bones}
def reset():
    for p in arm.pose.bones:p.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
def aim(name,child_name,target):
    p=arm.pose.bones[name];child=arm.pose.bones[child_name]
    bpy.context.view_layer.update();start=p.head.copy();old=(child.head-start).normalized();new=(Vector(target)-start).normalized()
    q=old.rotation_difference(new)
    p.matrix=Matrix.Translation(start) @ q.to_matrix().to_4x4() @ Matrix.Translation(-start) @ p.matrix
    bpy.context.view_layer.update()
def pose(kind):
    reset()
    for side,s in [('Left',1),('Right',-1)]:
        if kind=='Weeping':
            hand=Vector((s*7,-28,211));pole=Vector((s*1,-.1,-.55));fingers=Vector((s*-.06,0,1))
        elif kind=='Reaching':
            hand=Vector((s*20,-78,188 if s==1 else 182));pole=Vector((s*.5,-.1,-1));fingers=Vector((s*-.1,-1,.12))
        else:
            hand=Vector((s*30,-63,208));pole=Vector((s*1,0,-.5));fingers=Vector((s*-.15,-1,.15))
        upper=arm.pose.bones[side+'Arm'];lower=arm.pose.bones[side+'ForeArm'];wrist=arm.pose.bones[side+'Hand']
        shoulder=upper.head.copy();l1=(lower.head-shoulder).length;l2=(wrist.head-lower.head).length
        delta=hand-shoulder;distance=min(delta.length,l1+l2-.01);direction=delta.normalized()
        a=(l1*l1-l2*l2+distance*distance)/(2*distance);h=math.sqrt(max(0,l1*l1-a*a))
        bend=(pole-direction*pole.dot(direction)).normalized();elbow=shoulder+direction*a+bend*h
        aim(side+'Arm',side+'ForeArm',elbow)
        aim(side+'ForeArm',side+'Hand',hand)
        p=arm.pose.bones[side+'Hand'];start=p.head.copy();old=p.matrix.to_3x3().col[1].normalized();q=old.rotation_difference(fingers.normalized())
        p.matrix=Matrix.Translation(start) @ q.to_matrix().to_4x4() @ Matrix.Translation(-start) @ p.matrix
        bpy.context.view_layer.update()
    if kind=='Lunging':
        p=arm.pose.bones['Head'];p.rotation_mode='XYZ';p.rotation_euler.x=-.12
    return coords()
poses={name:pose(name) for name in ['Weeping','Reaching','Lunging']}
reset()
# Bake all deformation into shared-topology shape keys. No armature runtime
# overhead and no identity drift between the statue's poses.
for mod in list(mesh.modifiers):mesh.modifiers.remove(mod)
for v,co in zip(mesh.data.vertices,base):v.co=co
mesh.parent=None;mesh.matrix_world=Matrix.Identity(4)
mesh.shape_key_add(name='Basis')
for name,values in poses.items():
    key=mesh.shape_key_add(name=name)
    for point,co in zip(key.data,values):point.co=co
for p in mesh.data.polygons:p.use_smooth=True
bpy.data.objects.remove(arm,do_unlink=True)
# Restore the original PBR surface; the auto-rigger substitutes an emissive
# preview material, which is inappropriate for an in-game stone sculpture.
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/source/angel.glb'))
original=next(o for o in bpy.context.scene.objects if o not in before and o.type=='MESH')
mesh.data.materials.clear()
for m in original.data.materials:
    mesh.data.materials.append(m)
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type=='BSDF_PRINCIPLED':n.inputs['Metallic'].default_value=0;n.inputs['Roughness'].default_value=.9
for o in list(bpy.context.scene.objects):
    if o not in before:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
# Base mesh coordinates were already in metres after the skin modifier.
bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'output/angel-poses.blend'))
bpy.ops.export_scene.gltf(filepath=str(root/'assets/source/angel-poses.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=True,export_morph_normal=True)
print('Exported angel with Weeping, Reaching, Lunging morphs',list(mesh.dimensions),flush=True)
