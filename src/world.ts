import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export type Obstacle = { x:number; z:number; w:number; d:number; h:number };
export type Station = { id:'power'|'key'|'gate'|'note'; position:THREE.Vector3; object:THREE.Group; label:string };
export const obstacles:Obstacle[]=[];
export function insideFloor(x:number,z:number,r=0){
  return (Math.abs(x)<7.65-r && Math.abs(z)<15.6-r)||
    (x>7-r && x<13.6-r && z>-10.6+r && z<-3.4-r)||
    (x< -7+r && x> -13.6+r && z>3.4+r && z<10.6-r);
}
export function canStand(x:number,z:number,r=.25){
  if(!insideFloor(x,z,r))return false;
  return !obstacles.some(b=>Math.abs(x-b.x)<b.w/2+r&&Math.abs(z-b.z)<b.d/2+r);
}
export function segmentBlocked(a:THREE.Vector3,b:THREE.Vector3){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
  for(const o of obstacles){
    let lo=0,hi=1;
    const p=[a.x,a.y,a.z],d=[dx,dy,dz],min=[o.x-o.w/2,0,o.z-o.d/2],max=[o.x+o.w/2,o.h,o.z+o.d/2];
    for(let k=0;k<3;k++){
      if(Math.abs(d[k])<1e-8){if(p[k]<min[k]||p[k]>max[k]){hi=-1;break;}}
      else{let t1=(min[k]-p[k])/d[k],t2=(max[k]-p[k])/d[k];if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}
    }
    if(hi>=lo&&hi>.002&&lo<.98)return true;
  }
  return false;
}
export function random(seed=813){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

export async function makeWorld(scene:THREE.Scene,onProgress:(label:string)=>void){
  const rng=random(),loader=new THREE.TextureLoader();
  async function material(name:string,color:number,roughness:number,scale:number){
    const [map,normalMap,roughnessMap]=await Promise.all(['basecolor','normal','roughness'].map(type=>loader.loadAsync(`/assets/${name}-${type}.webp`).catch(()=>null)));
    for(const t of [map,normalMap,roughnessMap])if(t){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(scale,scale);t.anisotropy=8;}
    if(map)map.colorSpace=THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({color,map,normalMap,roughnessMap,roughness,normalScale:new THREE.Vector2(.55,.55)});
  }
  onProgress('Dressing the chapel');
  const [stone,floor,wood]=await Promise.all([material('limestone',0x99978b,.93,.35),material('floor',0x737c7b,.7,.35),material('wood',0x666057,.88,.4)]);
  const trim=stone.clone();trim.color.set(0xaaa799);trim.normalScale.set(.25,.25);
  const darkStone=stone.clone();darkStone.color.set(0x646f71);
  const metal=new THREE.MeshStandardMaterial({color:0x252a27,metalness:.8,roughness:.46});
  const brass=new THREE.MeshStandardMaterial({color:0x80704d,metalness:.8,roughness:.48});
  const black=new THREE.MeshStandardMaterial({color:0x141918,roughness:1});
  const wax=new THREE.MeshStandardMaterial({color:0xbcb18c,roughness:.94});
  const ceiling=new THREE.MeshStandardMaterial({color:0x222e31,roughness:1,map:stone.map,normalMap:stone.normalMap});
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const temp=new THREE.Object3D();
  function add(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0){temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.set(1,1,1);temp.updateMatrix();g.applyMatrix4(temp.matrix);if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(g);}
  function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material=stone,solid=false,ry=0){
    const g=new THREE.BoxGeometry(w,h,d);const uv=g.attributes.uv,p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<uv.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));uv.setXY(i,nx>.5?p.getZ(i):p.getX(i),ny>.5?p.getZ(i):p.getY(i));}
    add(g,m,x,y,z,0,ry);if(solid)obstacles.push({x,z,w,d,h:y+h/2});
  }
  function cylinder(r:number,rt:number,h:number,x:number,y:number,z:number,m=trim,segments=12){add(new THREE.CylinderGeometry(rt,r,h,segments),m,x,y,z);}
  function line(points:THREE.Vector3[],radius:number,m:THREE.Material=trim){add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(12,points.length*3),radius,6,false),m);}
  function archPoints(cx:number,z:number,w:number,spring:number,rise:number,axis='x'){
    const pts:THREE.Vector3[]=[];
    for(let i=0;i<=32;i++){const t=i/32,x=-w/2+w*t;const y=spring+rise*Math.sin(Math.PI*t)**.73;pts.push(axis==='x'?new THREE.Vector3(cx+x,y,z):new THREE.Vector3(cx,y,z+x));}return pts;
  }
  function arch(cx:number,z:number,w:number,spring:number,rise:number,axis='x',thickness=.12){line(archPoints(cx,z,w,spring,rise,axis),thickness);}
  function plaque(text:string,w:number,h:number,x:number,y:number,z:number,rotation=0){
    const c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#262d2c';ctx.fillRect(0,0,1024,512);ctx.strokeStyle='#a49774';ctx.lineWidth=3;ctx.strokeRect(25,25,974,462);ctx.textAlign='center';ctx.fillStyle='#b5ae98';ctx.font='42px Georgia';
    text.split('\n').forEach((l,i,a)=>ctx.fillText(l,512,256+(i-(a.length-1)/2)*65));
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:tex,roughness:.7,metalness:.2}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;scene.add(mesh);return mesh;
  }
  // Continuous floor and stepped sanctuary.
  box(15.5,.25,31.5,0,-.14,0,floor);
  box(6,.25,7.3,10.6,-.14,-7,floor);box(6,.25,7.3,-10.6,-.14,7,floor);
  // Nave outer walls, leaving actual doorways to both rooms.
  for(const side of [-1,1]){
    const doorZ=side===1?-7:7;
    const spans:[number,number][]=[[-16,doorZ-1.5],[doorZ+1.5,16]];
    for(const [a,b]of spans)box(.5,10,b-a,side*7.9,5,(a+b)/2,stone,true);
    box(.5,7,3,side*7.9,6.5,doorZ,stone);
    arch(side*7.58,doorZ,3,2.1,1.8,'z',.15);
    for(const zz of [doorZ-1.6,doorZ+1.6]){box(.3,3,.3,side*7.55,1.5,zz,trim);}
    for(const y of [.2,.65,4.2,6.8,9.5])box(.3,.13,31.5,side*7.56,y,0,trim);
  }
  box(16,11,.6,0,5.5,-16,stone,true);box(6.5,10,.5,-4.9,5,16,stone,true);box(6.5,10,.5,4.9,5,16,stone,true);box(3.4,6,.5,0,7,16,stone);
  // Side rooms: coherent closed envelopes.
  for(const s of [-1,1]){
    const z=s===1?-7:7;
    box(.4,4.8,7.6,s*13.8,2.4,z,stone,true);
    box(6.2,4.8,.4,s*10.8,2.4,z-3.8,stone,true);box(6.2,4.8,.4,s*10.8,2.4,z+3.8,stone,true);
    box(6.2,.3,7.6,s*10.8,4.8,z,ceiling);
    for(const zz of [z-3.5,z+3.5])box(6,.16,.15,s*10.8,3.8,zz,trim);
  }
  // Bundled Gothic columns, plinths, capitals and longitudinal arcades.
  const bays=[-12,-6,0,6,12];
  for(const x of [-4.7,4.7])for(const z of bays){
    box(1.0,.2,1.0,x,.1,z,trim,true);box(.8,.18,.8,x,.29,z,trim);
    cylinder(.32,.29,5.6,x,3.1,z,trim,16);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(.085,.08,5.45,x+Math.cos(a)*.29,3.1,z+Math.sin(a)*.29);}
    for(const [y,r,h] of [[.45,.39,.12],[5.65,.38,.13],[5.8,.48,.18],[6,.52,.16]] as number[][])cylinder(r,r,h,x,y,z);
    obstacles.push({x,z,w:.85,d:.85,h:6.1});
    arch(0,z,9.4,5.9,4.3,'x',.14);arch(0,z+.21,9.4,5.9,4.3,'x',.07);
    for(const s of [-1,1])line([new THREE.Vector3(x,5.9,z),new THREE.Vector3(x+s*.12,7.1,z+1),new THREE.Vector3(0,10.1,z+3)],.08,trim);
  }
  for(const x of [-4.7,4.7])for(let i=0;i<bays.length-1;i++){
    const z=(bays[i]+bays[i+1])/2;arch(x,z,6,5.85,2.4,'z',.15);
    box(.35,1.25,6,x,8.95,z,darkStone);
    for(let k=0;k<5;k++){const zz=z-2.4+k*1.2;arch(x,zz,.86,8.2,.55,'z',.06);cylinder(.05,.05,.8,x,7.85,zz-.48);}
  }
  // Barrel vault, ridged cross sections, lateral aisle roofs.
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let j=0;j<2;j++)for(let i=0;i<=48;i++){const t=i/48;positions.push(-4.7+9.4*t,5.95+4.3*Math.sin(Math.PI*t)**.73,-15.8+j*31.6);uvs.push(t*4,j*12);}
  for(let i=0;i<48;i++){indices.push(i,i+49,i+1,i+1,i+49,i+50);}
  const vault=new THREE.BufferGeometry();vault.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));vault.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));vault.setIndex(indices);vault.computeVertexNormals();ceiling.side=THREE.DoubleSide;add(vault,ceiling);
  for(const x of [-6.3,6.3])box(3.2,.2,32,x,6.5,0,ceiling);
  line([new THREE.Vector3(0,10.18,-16),new THREE.Vector3(0,10.18,0),new THREE.Vector3(0,10.18,16)],.09);
  // Deep pointed window recesses and tracery.
  const paneCanvas=document.createElement('canvas');paneCanvas.width=256;paneCanvas.height=512;const pc=paneCanvas.getContext('2d')!;pc.fillStyle='#536b76';pc.fillRect(0,0,256,512);
  for(let row=-1;row<17;row++)for(let col=-1;col<7;col++){
    const x=col*48+(row%2)*24,y=row*36;pc.beginPath();pc.moveTo(x,y-36);pc.lineTo(x+24,y);pc.lineTo(x,y+36);pc.lineTo(x-24,y);pc.closePath();pc.fillStyle=['#556c78','#66797c','#465d69','#797d70'][Math.floor(rng()*4)];pc.fill();pc.strokeStyle='#1b292e';pc.lineWidth=2;pc.stroke();
  }
  for(let i=0;i<2500;i++){pc.fillStyle=`rgba(15,25,28,${rng()*.15})`;pc.fillRect(rng()*256,rng()*512,1+rng()*3,1+rng()*4);}
  const paneTex=new THREE.CanvasTexture(paneCanvas);paneTex.colorSpace=THREE.SRGBColorSpace;
  const windowMat=new THREE.MeshStandardMaterial({map:paneTex,emissiveMap:paneTex,emissive:0x8ca6bb,emissiveIntensity:.6,roughness:.35,metalness:.2,side:THREE.DoubleSide});
  for(const side of [-1,1])for(const z of [-12,-1,11]){
    box(.07,3.4,1.9,side*7.61,3.6,z,black);
    const shape=new THREE.Shape();shape.moveTo(-.8,-1.4);shape.lineTo(.8,-1.4);shape.lineTo(.8,1.1);shape.quadraticCurveTo(.7,1.8,0,2.4);shape.quadraticCurveTo(-.7,1.8,-.8,1.1);shape.closePath();const wg=new THREE.ShapeGeometry(shape,16);const wuv=wg.attributes.uv,wp=wg.attributes.position;for(let i=0;i<wuv.count;i++)wuv.setXY(i,(wp.getX(i)+.8)/1.6,(wp.getY(i)+1.4)/3.8);add(wg,windowMat,side*7.55,3.35,z,0,-side*Math.PI/2);
    for(const offset of [-.82,0,.82])box(.12,3.2,.07,side*7.47,3.55,z+offset,trim);
    arch(side*7.45,z,1.8,4.45,1.3,'z',.11);
    box(.36,.2,2.2,side*7.5,1.95,z,trim);
    for(const y of [2.6,3.5,4.4])box(.06,.065,1.8,side*7.44,y,z,metal);
  }
  // Rose window: actual glass, leadwork, petal tracery and surrounding stone rings.
  const rose=new THREE.Group();rose.position.set(0,7.3,-15.64);scene.add(rose);
  const glassCanvas=document.createElement('canvas');glassCanvas.width=glassCanvas.height=1024;const ctx=glassCanvas.getContext('2d')!;
  ctx.fillStyle='#142b39';ctx.fillRect(0,0,1024,1024);
  const colors=['#405c6b','#9b7850','#708489','#5c697b','#9f8758','#3d5558'];
  for(let ring=0;ring<5;ring++)for(let i=0;i<36;i++){
    const a=i*Math.PI*2/36,r=ring*100;
    ctx.beginPath();ctx.arc(512,512,r+98,a,a+.168);ctx.arc(512,512,r+5,a+.168,a,true);ctx.closePath();ctx.fillStyle=colors[(i+ring*2)%colors.length];ctx.fill();ctx.strokeStyle='#172226';ctx.lineWidth=7;ctx.stroke();
  }
  const glassTex=new THREE.CanvasTexture(glassCanvas);glassTex.colorSpace=THREE.SRGBColorSpace;
  const gm=new THREE.MeshStandardMaterial({map:glassTex,emissiveMap:glassTex,emissive:0xffffff,emissiveIntensity:1.4,roughness:.4,side:THREE.DoubleSide});
  rose.add(new THREE.Mesh(new THREE.CircleGeometry(2.15,80),gm));
  for(const r of [2.17,2.28,2.42,.52]){const t=new THREE.Mesh(new THREE.TorusGeometry(r,r===2.42?.1:.065,8,80),trim);t.position.z=.035;rose.add(t);}
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;const petal=new THREE.Mesh(new THREE.TorusGeometry(.57,.05,6,40),trim);petal.scale.set(.7,1.8,1);petal.position.set(Math.sin(a)*1.28,Math.cos(a)*1.28,.04);petal.rotation.z=-a;rose.add(petal);
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(.045,1.65,.08),trim);spoke.position.set(Math.sin(a)*1.3,Math.cos(a)*1.3,.07);spoke.rotation.z=-a;rose.add(spoke);
  }
  // Altar, carved reredos, candles, devotional detail.
  box(4.4,.15,3.2,0,.065,-13.6,trim);box(3.7,.15,2.8,0,.2,-13.9,trim);
  box(2.9,1.05,1.1,0,.72,-14,stone,true);box(3.3,.18,1.4,0,1.33,-14,trim);
  for(const x of [-1,0,1]){arch(x,-13.43,.75,.9,.3,'x',.04);box(.06,.6,.05,x-.4,.75,-13.4,trim);}
  for(const x of [-2.8,2.8]){box(.45,3.9,.55,x,1.95,-15.35,trim);arch(x,-15.03,1.5,2.5,1,'x',.08);}
  box(.13,2.1,.1,0,3.4,-15.4,brass);box(1.05,.12,.1,0,3.8,-15.38,brass);
  plaque('IN SILENTIO\nVIGILAMUS',2.1,.65,0,1.0,-13.42);
  // Pew rows. Open central aisle and side aisles are fully navigable.
  let pewModel:THREE.Group|null=null;
  try{pewModel=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/assets/pew-game.glb')).scene;}catch{/* Asset production preview uses the measured blockout. */}
  if(pewModel){
    pewModel.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(pewModel),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=2.8/size.x;
    const coords=[-1,1].flatMap(side=>[-7,-3.5,0,3.5,7].map(z=>({x:side*2.65,z})));
    pewModel.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const m=o as THREE.Mesh,inst=new THREE.InstancedMesh(m.geometry,m.material,coords.length);
      coords.forEach(({x,z},i)=>{const matrix=new THREE.Matrix4().makeTranslation(x,0,z).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z)).multiply(m.matrixWorld);inst.setMatrixAt(i,matrix);});inst.castShadow=true;inst.receiveShadow=true;scene.add(inst);
    });
  }
  for(const side of [-1,1])for(const z of [-7,-3.5,0,3.5,7]){
    const x=side*2.65;
    if(pewModel){
      obstacles.push({x,z,w:2.8,d:.95,h:1.3});continue;
    }
    box(2.8,.13,.6,x,.57,z,wood,true);box(2.8,.8,.14,x,.9,z+.34,wood);
    for(const xx of [x-1.38,x+1.38]){box(.15,.95,.8,xx,.5,z,wood);cylinder(.1,.1,.18,xx,1.06,z+.22,wood);box(.24,.11,.83,xx,1.02,z,wood);}
    for(const xx of [x-1,x+1])box(.13,.52,.42,xx,.26,z,wood);
    box(2.5,.12,.2,x,.17,z-.6,wood);
  }
  // Wrought iron entrance gate, animated as one group.
  const gate=new THREE.Group();gate.position.set(0,0,15.55);scene.add(gate);
  const meshBox=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,parent:THREE.Group)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  for(let i=-7;i<=7;i++){meshBox(.035,3.7,.045,i*.2,1.85,0,metal,gate);const tip=new THREE.Mesh(new THREE.ConeGeometry(.065,.21,4),brass);tip.position.set(i*.2,3.75,0);gate.add(tip);}
  for(const y of [.25,1.4,3.3])meshBox(3.1,.07,.065,0,y,0,metal,gate);
  arch(0,15.45,3.3,3.4,1.7,'x',.14);plaque('SAINT ORISON\nMDCCCLXXXIX',2.1,.6,0,5.65,15.68,Math.PI);
  // Rooms: electrical switch cabinet and archive shelves.
  const power=new THREE.Group();power.position.set(13.45,0,-7);power.rotation.y=-Math.PI/2;scene.add(power);
  meshBox(.8,1.1,.2,0,1.45,0,metal,power);meshBox(.68,.95,.06,0,1.45,.14,darkStone,power);meshBox(.08,.35,.15,.18,1.3,.23,brass,power);
  const powerLamp=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),new THREE.MeshBasicMaterial({color:0xa04b24}));powerLamp.position.set(-.2,1.65,.2);power.add(powerLamp);
  plaque('SACRISTY\nELECTRICAL SUPPLY',1.1,.45,13.46,2.4,-7,-Math.PI/2);
  for(let i=0;i<3;i++){line([new THREE.Vector3(13.4,1.7,-7+.3*i),new THREE.Vector3(13.4,3.8,-7+.3*i),new THREE.Vector3(10,3.8,-7+.3*i)],.018,metal);}
  const bookMaterials=Array.from({length:6},()=>new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.07+rng()*.05,.15,.09+rng()*.12),roughness:.98}));
  for(const z of [4,10]){
    box(4.1,2.7,.45,-11,1.35,z,wood,true);
    for(const y of [.12,.8,1.5,2.2,2.8])box(4.3,.08,.6,-11,y,z-.08,wood);
    for(let row=0;row<3;row++)for(let j=0;j<22;j++){const m=bookMaterials[Math.floor(rng()*bookMaterials.length)];box(.1+rng()*.06,.4+rng()*.2,.3,-12.9+j*.175,.4+row*.7,z-.23,m);}
  }
  const key=new THREE.Group();key.position.set(-12.7,1.0,7);scene.add(key);
  box(1.2,.12,1.5,-12.7,.88,7,wood,true);for(const z of [6.4,7.6])box(.1,.85,.1,-12.7,.42,z,wood);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.08,.018,8,20),brass);ring.rotation.x=-Math.PI/2;key.add(ring);meshBox(.022,.025,.24,0,0,.17,brass,key);meshBox(.07,.03,.03,.025,0,.27,brass,key);
  const keyGlow=new THREE.PointLight(0xdcc494,1.2,2,2);keyGlow.position.set(0,.4,0);key.add(keyGlow);
  const note=new THREE.Group();note.position.set(6.8,1.0,10.7);scene.add(note);
  box(.9,.12,.8,6.8,.9,10.7,wood,true);box(.1,.9,.1,6.8,.45,10.7,wood);
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(.38,.5),new THREE.MeshStandardMaterial({color:0xb6ae91,roughness:1}));paper.rotation.x=-Math.PI/2;paper.rotation.z=.16;note.add(paper);
  plaque('THE ARCHIVE',1.2,.28,-7.52,3.1,7,Math.PI/2);plaque('SACRISTY',1.15,.28,7.52,3.1,-7,-Math.PI/2);
  // Wall tombs, inscriptions, reliefs, broken masonry and scattered leaves.
  for(const side of [-1,1])for(const z of [-9,3,13]){
    if(side===-1&&z===3)continue;
    box(.45,1.7,1.1,side*7.48,1.0,z,darkStone);box(.55,.16,1.35,side*7.4,1.91,z,trim);
    arch(side*7.2,z,1.05,1.3,.7,'z',.045);box(.03,.65,.08,side*7.22,1.1,z,brass);box(.03,.06,.36,side*7.21,1.25,z,brass);
  }
  const debris=new THREE.MeshStandardMaterial({color:0x595c53,roughness:1});
  for(let i=0;i<110;i++){
    const side=rng()>.5?1:-1;const x=side*(5.9+rng()*1.7),z=-15+rng()*30;
    const g=new THREE.DodecahedronGeometry(.035+rng()*.11,0);g.scale(1,.45+rng()*.4,1);add(g,debris,x,.04,z,rng(),rng()*6,rng());
  }
  for(let i=0;i<26;i++){const z=-14+rng()*28,x=(rng()-.5)*14;if(Math.abs(x)<1.3)continue;box(.15+rng()*.2,.004,.2+rng()*.2,x,.01,z,rng()>.5?wood:darkStone,false,rng()*6);}
  // Candles: shared flame geometry with animated shader; a few lights do the illumination.
  const flameMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv; uniform float time; void main(){vUv=uv;vec3 p=position;p.x+=sin(time*8.+position.y*18.)*.009*uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float a=pow(max(0.,1.-length(vec2(p.x*1.8,p.y))),2.);vec3 c=mix(vec3(1.,.15,.01),vec3(1.,.85,.4),a);gl_FragColor=vec4(c*2.,a);}`});
  const fireGeometries:THREE.BufferGeometry[]=[];const candleLights:THREE.PointLight[]=[];
  function candle(x:number,y:number,z:number,height=.22){
    cylinder(.038,.034,height,x,y+height/2,z,wax,8);cylinder(.007,.007,.025,x,y+height+.012,z,black,6);
    const g=new THREE.PlaneGeometry(.13,.23);g.translate(x,y+height+.09,z);fireGeometries.push(g);const g2=g.clone();g2.translate(-x,-y-height-.09,-z);g2.rotateY(Math.PI/2);g2.translate(x,y+height+.09,z);fireGeometries.push(g2);
  }
  for(const x of [-6.1,6.1])for(const z of [-11,-4,4,11]){
    cylinder(.19,.09,.12,x,.06,z,brass);cylinder(.04,.035,1.7,x,.95,z,brass);cylinder(.2,.2,.055,x,1.8,z,brass);
    for(let i=-1;i<=1;i++){candle(x+i*.19,1.83,z,.18+(1-Math.abs(i))*.1);if(i)line([new THREE.Vector3(x,1.4,z),new THREE.Vector3(x+i*.19,1.55,z),new THREE.Vector3(x+i*.19,1.82,z)],.018,brass);}
    const l=new THREE.PointLight(0xffbd73,10,7,2);l.position.set(x,2.15,z);scene.add(l);candleLights.push(l);
  }
  for(const x of [-1.15,-.8,.8,1.15])candle(x,1.43,-14,.23+rng()*.2);
  const altarLight=new THREE.PointLight(0xffce88,15,9,2);altarLight.position.set(0,2,-13);scene.add(altarLight);candleLights.push(altarLight);
  for(const [x,z] of [[12,-9.7],[-12,7],[6.8,10.7]]){candle(x,1,z,.32);const l=new THREE.PointLight(0xffc07e,9,6,2);l.position.set(x,1.5,z);scene.add(l);candleLights.push(l);}
  const fire=new THREE.Mesh(mergeGeometries(fireGeometries),flameMaterial);scene.add(fire);
  // Hanging sanctuary banners and iron chandeliers break up the repeated bays.
  const fabric=new THREE.MeshStandardMaterial({color:0x35282a,roughness:1,side:THREE.DoubleSide});
  for(const side of [-1,1]){
    const g=new THREE.PlaneGeometry(1.0,3.6,20,30),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin(x*22)*.055+Math.sin(y*2+x)*.035);if(y< -1.65)p.setY(i,y+rng()*.22);}
    g.computeVertexNormals();add(g,fabric,side*3.5,4.8,-15.45);
    line([new THREE.Vector3(side*3.5-.65,6.65,-15.35),new THREE.Vector3(side*3.5+.65,6.65,-15.35)],.026,brass);
    box(.025,1.0,.04,side*3.5,5.2,-15.32,brass);box(.38,.025,.04,side*3.5,5.4,-15.31,brass);
  }
  for(const z of [-3,9]){
    add(new THREE.TorusGeometry(1.1,.035,7,48),metal,0,5.7,z,Math.PI/2);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*1.1,zz=z+Math.sin(a)*1.1;line([new THREE.Vector3(x,5.7,zz),new THREE.Vector3(0,7.2,z),new THREE.Vector3(0,9.6,z)],.012,metal);cylinder(.065,.065,.16,x,5.75,zz,brass);}
  }
  // Soft contact occlusion, shared as a single decal material beneath heavy objects.
  const aoCanvas=document.createElement('canvas');aoCanvas.width=aoCanvas.height=128;const ac=aoCanvas.getContext('2d')!,ag=ac.createRadialGradient(64,64,12,64,64,64);ag.addColorStop(0,'rgba(0,0,0,0.65)');ag.addColorStop(.55,'rgba(0,0,0,0.23)');ag.addColorStop(1,'rgba(0,0,0,0)');ac.fillStyle=ag;ac.fillRect(0,0,128,128);
  const aoMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(aoCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  for(const x of [-4.7,4.7])for(const z of bays)add(new THREE.PlaneGeometry(2.1,2.1),aoMaterial,x,.003,z,-Math.PI/2);
  for(const x of [-2.65,2.65])for(const z of [-7,-3.5,0,3.5,7])add(new THREE.PlaneGeometry(3.6,1.6),aoMaterial,x,.002,z,-Math.PI/2);
  // Dust, rain glimpsed through the high windows, and soft shafts of moonlight.
  const dustPositions=new Float32Array(600*3);for(let i=0;i<600;i++){dustPositions[i*3]=(rng()-.5)*15;dustPositions[i*3+1]=rng()*8;dustPositions[i*3+2]=(rng()-.5)*30;}
  const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dg,new THREE.PointsMaterial({color:0xb3c9cf,size:.017,transparent:true,opacity:.35,depthWrite:false}));scene.add(dust);
  const beamMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv; varying vec3 vWorld; uniform float time;void main(){float edge=pow(sin(vUv.x*3.14159),2.);float vertical=sin(vUv.y*3.14159);float dust=.8+.2*sin(vWorld.x*14.+vWorld.y*5.+time*.14);gl_FragColor=vec4(.29,.43,.52,edge*vertical*dust*.075);}`});
  for(const z of [-11,-1,10]){
    const g=new THREE.PlaneGeometry(1.8,10);const beam=new THREE.Mesh(g,beamMaterial);beam.position.set(3.1,3.9,z);beam.rotation.z=-.8;scene.add(beam);
    const l=new THREE.SpotLight(0x9ac0de,65,22,.22,.8,1.8);l.position.set(7.4,5.1,z);l.target.position.set(-2,.1,z-1.5);scene.add(l,l.target);
  }
  const moon=new THREE.SpotLight(0xadc5df,135,30,.43,.8,1.6);moon.position.set(0,8,-14.8);moon.target.position.set(0,0,-5);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);moon.shadow.bias=-.0004;moon.shadow.normalBias=.025;scene.add(moon,moon.target);
  moon.shadow.autoUpdate=false;moon.shadow.needsUpdate=true;
  const ambient=new THREE.HemisphereLight(0x8ca5bf,0x33312a,.52);scene.add(ambient);
  const angelRim=new THREE.SpotLight(0x91b4d2,35,15,.6,.9,1.8);angelRim.position.set(2,6,-4);angelRim.target.position.set(0,1.4,-9);scene.add(angelRim,angelRim.target);
  // Lightly reflective damp floor. Reflection is deliberately restrained, not polished marble.
  const reflection=new Reflector(new THREE.PlaneGeometry(15.4,31.4),{textureWidth:512,textureHeight:512,color:0x7d8a8c,clipBias:.003,multisample:0});
  reflection.rotation.x=-Math.PI/2;reflection.position.y=.006;
  const rm=reflection.material as THREE.ShaderMaterial;rm.transparent=true;rm.depthWrite=false;
  rm.fragmentShader=rm.fragmentShader.replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',`float wet=sin(vUv.x*17.)*sin(vUv.y*21.);gl_FragColor=vec4(min(base.rgb,vec3(1.2))*.65,.12+.08*smoothstep(-.1,.6,wet));`);
  scene.add(reflection);
  // Merge static detail by material to keep draw calls under control.
  for(const [m,geoms]of batches){const geometry=mergeGeometries(geoms);if(!geometry)continue;const mesh=new THREE.Mesh(geometry,m);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);geoms.forEach(g=>g.dispose());}
  const stations:Station[]=[{id:'power',position:new THREE.Vector3(12.8,1.4,-7),object:power,label:'HOLD TO RESTORE POWER'},{id:'key',position:new THREE.Vector3(-12.7,1.0,7),object:key,label:'TAKE THE GATE KEY'},{id:'gate',position:new THREE.Vector3(0,1.5,15.2),object:gate,label:'UNLOCK THE GATE'},{id:'note',position:new THREE.Vector3(6.8,1,10.7),object:note,label:'READ THE KEEPER’S NOTE'}];
  for(const group of [rose,gate]){
    const groups=new Map<THREE.Material,THREE.BufferGeometry[]>();
    for(const o of [...group.children]){const m=o as THREE.Mesh;if(!m.isMesh||Array.isArray(m.material))continue;m.updateMatrix();if(!groups.has(m.material))groups.set(m.material,[]);groups.get(m.material)!.push(m.geometry.clone().applyMatrix4(m.matrix));group.remove(m);m.geometry.dispose();}
    for(const [mat,parts]of groups){const merged=new THREE.Mesh(mergeGeometries(parts),mat);merged.castShadow=true;merged.receiveShadow=true;group.add(merged);parts.forEach(g=>g.dispose());}
  }
  return {stations,reflection,moon,ambient,update(time:number,powered:boolean){
    flameMaterial.uniforms.time.value=time;beamMaterial.uniforms.time.value=time;
    candleLights.forEach((l,i)=>l.intensity=(i===8?15:10)*(1+Math.sin(time*5+i*7)*.06+Math.sin(time*11+i)*.025));
    dust.rotation.y=Math.sin(time*.025)*.02;dust.position.y=Math.sin(time*.06)*.08;
    (powerLamp.material as THREE.MeshBasicMaterial).color.set(powered?0x9bbe73:0xa04b24);
    key.rotation.y=time*.25;
  }};
}
