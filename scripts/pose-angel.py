import bpy, math, numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
root=Path(__file__).resolve().parent.parent
(root/'output').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/source/angel-rigged.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name=='char1')
arm.animation_data_clear()
# Weld UV seam vertices while retaining per-loop UVs, so the posed sleeves
# have continuous weights and normals instead of isolated triangle patches.
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=mesh
mesh.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.0001)
bpy.ops.object.mode_set(mode='OBJECT')
for mod in mesh.modifiers:
    if mod.type=='ARMATURE':mod.use_deform_preserve_volume=False
for o in list(bpy.context.scene.objects):
    if o not in [arm,mesh]:bpy.data.objects.remove(o,do_unlink=True)
for p in arm.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
# Authoring-only twist bones distribute forearm pronation without bending
# the shaft or turning the sleeve cuff inside out. They are baked away.
twist_steps=6
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
bpy.context.view_layer.objects.active=arm
twist_rest={side:(arm.data.bones[side+'ForeArm'].matrix_local.copy(),(arm.data.bones[side+'Hand'].head_local-arm.data.bones[side+'ForeArm'].head_local).length) for side in ['Left','Right']}
bpy.ops.object.mode_set(mode='EDIT')
for side,(matrix,length) in twist_rest.items():
    for step in range(1,twist_steps+1):
        bone=arm.data.edit_bones.new(f'{side}ForeArmTwist{step}')
        bone.head=matrix.translation;bone.tail=bone.head+matrix.to_3x3().col[1]*length
        bone.align_roll(matrix.to_3x3().col[2]);bone.parent=arm.data.edit_bones[side+'ForeArm']
bpy.ops.object.mode_set(mode='OBJECT')
for side in twist_rest:
    for step in range(1,twist_steps+1):mesh.vertex_groups.new(name=f'{side}ForeArmTwist{step}')
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
bpy.context.view_layer.objects.active=mesh
bpy.context.view_layer.update()
# Pose targets and weight regions use the rig's local centimetres. Preserve
# its bone matrices; the armature supplies the scale to metres.
for mat in mesh.data.materials:
    if mat and mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type=='BSDF_PRINCIPLED':
                node.inputs['Emission Strength'].default_value=0
                node.inputs['Metallic'].default_value=0
                node.inputs['Roughness'].default_value=.9
                if 'Specular IOR Level' in node.inputs:node.inputs['Specular IOR Level'].default_value=.3
# Keep the stone wings bound to the spine, not dragged along with the arms.
spine_group=mesh.vertex_groups.get('Spine')
corrected=0
for v in mesh.data.vertices:
    co=arm.matrix_world.inverted() @ (mesh.matrix_world @ v.co)
    if (co.y>6 and co.z>65 and abs(co.x)>18) or (abs(co.x)>42 and co.y>-12 and co.z>60):
        for g in mesh.vertex_groups:g.remove([v.index])
        spine_group.add([v.index],1.0,'REPLACE');corrected+=1
print('wing vertices stabilized',corrected,flush=True)
# Diffuse sleeve weights over mesh edges, with the wings pinned. A spatial
# cutoff alone stretches individual seam triangles into sharp sheets.
xyz=np.array([v.co[:] for v in mesh.data.vertices])
edges=np.array([e.vertices[:] for e in mesh.data.edges])
source=np.concatenate((edges[:,0],edges[:,1]));target=np.concatenate((edges[:,1],edges[:,0]))
degree=np.bincount(source,minlength=len(xyz)).clip(1)
weights=np.zeros((len(xyz),len(mesh.vertex_groups)))
for v in mesh.data.vertices:
    for g in v.groups:weights[v.index,g.group]=g.weight
region=(xyz[:,2]>90)&(xyz[:,2]<205)&(np.abs(xyz[:,0])>15)&(xyz[:,1]>-32)
wing=((xyz[:,1]>6)&(xyz[:,2]>65)&(np.abs(xyz[:,0])>18))|((np.abs(xyz[:,0])>42)&(xyz[:,1]>-12)&(xyz[:,2]>60))
# The exposed forearms are rigid boundary conditions, not another weight
# blend. Diffuse the sleeve *toward* them so the cuff cannot split or bend
# the lower arm into a hook when it rotates to cover the face.
rigid=np.zeros(len(xyz),dtype=bool)
twist_fractions={}
cuff_mask=np.zeros(len(xyz))
def smoothstep(a,b,value):
    v=np.clip((value-a)/(b-a),0,1)
    return v*v*(3-2*v)
for side in ['Left','Right']:
    a=np.array(arm.pose.bones[side+'ForeArm'].head)
    b=np.array(arm.pose.bones[side+'Hand'].head)
    delta=b-a;t=(xyz-a)@delta/(delta@delta)
    radial=np.linalg.norm(xyz-(a+np.clip(t,0,1)[:,None]*delta),axis=1)
    twist_fractions[side]=smoothstep(.08,.92,t)*(1-smoothstep(9.5,16,radial))
    cuff_mask=np.maximum(cuff_mask,smoothstep(-.65,-.3,t)*(1-smoothstep(.2,.55,t))*(1-smoothstep(11,20,radial))*(~wing))
    core=(radial<6)&(t>.05)&(t<1.1)&~wing
    hand_blend=smoothstep(.85,1.1,t[core])
    weights[core]=0
    weights[core,mesh.vertex_groups[side+'ForeArm'].index]=1-hand_blend
    weights[core,mesh.vertex_groups[side+'Hand'].index]=hand_blend
    rigid |= core
free=region&~wing&~rigid
for _ in range(250):
    neighbor=np.zeros_like(weights);np.add.at(neighbor,source,weights[target])
    weights[free]=.5*weights[free]+.5*(neighbor/degree[:,None])[free]
for side,fraction in twist_fractions.items():
    indices=[mesh.vertex_groups[side+'ForeArm'].index]+[mesh.vertex_groups[f'{side}ForeArmTwist{step}'].index for step in range(1,twist_steps+1)]
    influence=weights[:,indices[0]].copy();weights[:,indices[0]]=0
    for step,index in enumerate(indices):
        weights[:,index]=influence*np.maximum(0,1-np.abs(fraction*twist_steps-step))
for i in np.flatnonzero(region|rigid):
    for g in mesh.vertex_groups:g.remove([int(i)])
    for group,weight in enumerate(weights[i]):
        if weight>1e-6:mesh.vertex_groups[group].add([int(i)],float(weight),'REPLACE')
# Restore the carved surface after skinning, before baking the final poses.
corrective=mesh.modifiers.new('Pose corrective','CORRECTIVE_SMOOTH')
corrective.factor=.8;corrective.iterations=20;corrective.rest_source='ORCO'
deps=bpy.context.evaluated_depsgraph_get()
def coords():
    bpy.context.view_layer.update();ev=mesh.evaluated_get(deps);m=ev.to_mesh();out=[v.co.copy() for v in m.vertices];ev.to_mesh_clear();return out
base=coords()
def reset():
    for p in arm.pose.bones:p.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
def aim(name,child_name,target):
    p=arm.pose.bones[name];child=arm.pose.bones[child_name]
    bpy.context.view_layer.update();start=p.head.copy();old=(child.head-start).normalized();new=(Vector(target)-start).normalized()
    q=old.rotation_difference(new)
    p.matrix=Matrix.Translation(start) @ q.to_matrix().to_4x4() @ Matrix.Translation(-start) @ p.matrix
    bpy.context.view_layer.update()
def orient_palm(name,direction):
    # Set both direction and roll so the palms face inward without twisting
    # the wrist independently from its forearm.
    p=arm.pose.bones[name];start=p.head.copy()
    y=direction.normalized();z=Vector((0,1,0));z=(z-y*z.dot(y)).normalized();x=y.cross(z).normalized()
    p.matrix=Matrix.Translation(start) @ Matrix((x,y,z)).transposed().to_4x4()
    bpy.context.view_layer.update()
def pose(kind):
    reset()
    for side,s in [('Left',1),('Right',-1)]:
        if kind=='Weeping':
            # Elbows forward and down, inside the shoulders; palms over eyes.
            hand=Vector((s*6.5,-24,211));pole=Vector((s*.08,-.45,-1));fingers=Vector((s*-.06,.08,1))
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
        if kind=='Weeping':
            matrix=arm.pose.bones[side+'ForeArm'].matrix.to_3x3()
            y=matrix.col[1].normalized();current_x=matrix.col[0].normalized()
            z=Vector((0,1,0));z=(z-y*z.dot(y)).normalized();target_x=y.cross(z).normalized()
            angle=math.atan2(y.dot(current_x.cross(target_x)),current_x.dot(target_x))
            for step in range(1,twist_steps+1):
                p=arm.pose.bones[f'{side}ForeArmTwist{step}'];p.rotation_mode='XYZ';p.rotation_euler.y=angle*step/twist_steps
            orient_palm(side+'Hand',fingers)
        else:
            p=arm.pose.bones[side+'Hand'];start=p.head.copy();old=p.matrix.to_3x3().col[1].normalized();q=old.rotation_difference(fingers.normalized())
            p.matrix=Matrix.Translation(start) @ q.to_matrix().to_4x4() @ Matrix.Translation(-start) @ p.matrix
        bpy.context.view_layer.update()
    if kind=='Lunging':
        p=arm.pose.bones['Head'];p.rotation_mode='XYZ';p.rotation_euler.x=-.12
    values=coords()
    if kind=='Weeping':
        # Fair the compressed cuff folds after the large elbow bend. This is
        # local sculpt cleanup, leaving the face, hands and wing carving intact.
        points=np.array(values)
        for _ in range(35):
            neighbor=np.zeros_like(points);np.add.at(neighbor,source,points[target])
            points+=.6*cuff_mask[:,None]*(neighbor/degree[:,None]-points)
        values=[Vector(point) for point in points]
    return values
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
    key.value=0
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
# Retain local centimetres in the baked geometry; the runtime normalizes
# the statue to 2.65 metres. The authoring file opens in the initial pose.
bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
mesh.data.shape_keys.key_blocks['Weeping'].value=1
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(root/'output/angel-poses.blend'))
mesh.data.shape_keys.key_blocks['Weeping'].value=0
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(root/'assets/source/angel-poses.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=True,export_morph_normal=True)
print('Exported angel with Weeping, Reaching, Lunging morphs',list(mesh.dimensions),flush=True)
