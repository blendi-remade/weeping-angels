import bpy, json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/source/angel-rigged.glb'))
report=[]
for o in bpy.context.scene.objects:
    row={'name':o.name,'type':o.type,'location':list(o.location),'scale':list(o.scale),'dimensions':list(o.dimensions)}
    if o.type=='ARMATURE':
        row['bones']=[{'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local)} for b in o.data.bones]
    report.append(row)
print(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'output/angel-inspection.blend'))
