import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress,dedup,prune,weld,simplify,meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier,MeshoptEncoder,MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const models=[['angel-poses','angel-game',1],['pew','pew-game',.35]];
const selected=process.argv.slice(2);
if(selected.some(name=>!models.some(([source])=>source===name)))throw new Error('Choose angel-poses or pew, or omit arguments to optimize both.');
for(const [source,target,ratio]of models.filter(([source])=>!selected.length||selected.includes(source))){
  const doc=await io.read(`assets/source/${source}.glb`);
  const count=()=>doc.getRoot().listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((b,p)=>b+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
  const before=count();
  await doc.transform(dedup(),weld());
  if(ratio<1)await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio,error:.0015}));
  await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',resize:[2048,2048],quality:94,effort:70}),prune(),meshopt({encoder:MeshoptEncoder,level:'high'}));
  await io.write(`public/assets/${target}.glb`,doc);
  console.log(source,{trianglesBefore:before,trianglesAfter:count(),bytes:(await fs.stat(`public/assets/${target}.glb`)).size});
}
