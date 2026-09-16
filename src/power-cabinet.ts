import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Local +Z faces the player; conduits and mounting feet sit against the wall. */
export function createPowerCabinet(){
  const group=new THREE.Group();group.name='Sacristy electrical cabinet';
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),transform=new THREE.Object3D();
  const steel=new THREE.MeshStandardMaterial({color:0x747c79,metalness:.8,roughness:.43});
  const iron=new THREE.MeshStandardMaterial({color:0x303936,metalness:.7,roughness:.62});
  const gasket=new THREE.MeshStandardMaterial({color:0x111715,roughness:.97});
  const brass=new THREE.MeshStandardMaterial({color:0x9d8a60,metalness:.72,roughness:.5});
  const bakelite=new THREE.MeshStandardMaterial({color:0x572e25,roughness:.6});

  const paintCanvas=document.createElement('canvas');paintCanvas.width=paintCanvas.height=512;
  const pc=paintCanvas.getContext('2d')!;pc.fillStyle='#65716b';pc.fillRect(0,0,512,512);
  let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  for(let i=0;i<7000;i++){
    pc.fillStyle=random()>.5?'rgba(18,27,23,.07)':'rgba(193,190,166,.055)';
    pc.fillRect(random()*512,random()*512,1+random()*3,1+random()*2);
  }
  // Small worn patches near the folded edges, without borrowing masonry UVs.
  for(let i=0;i<100;i++){
    const x=random()>.5?random()*14:498+random()*14,y=random()*512;
    pc.fillStyle=i%3?'rgba(42,34,25,.24)':'rgba(172,172,154,.3)';
    pc.fillRect(x,y,1+random()*4,2+random()*12);
  }
  const paintMap=new THREE.CanvasTexture(paintCanvas);paintMap.colorSpace=THREE.SRGBColorSpace;paintMap.anisotropy=8;
  const paint=new THREE.MeshStandardMaterial({map:paintMap,metalness:.55,roughness:.68});

  function add(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);transform.updateMatrix();geometry.applyMatrix4(transform.matrix);
    if(!batches.has(material))batches.set(material,[]);batches.get(material)!.push(geometry);
  }
  function box(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,radius=.008){
    add(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/3,h/3,d/3)),material,x,y,z);
  }
  function disc(radius:number,depth:number,x:number,y:number,z:number,material:THREE.Material){
    add(new THREE.CylinderGeometry(radius,radius,depth,24),material,x,y,z,Math.PI/2);
  }
  function screw(x:number,y:number,z:number){
    disc(.013,.01,x,y,z,steel);box(.016,.0025,.002,x,y,z+.006,gasket,.0005);
  }
  function label(lines:string[],w:number,h:number,x:number,y:number,z:number,fontSize=43){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*h/w);
    const c=canvas.getContext('2d')!;c.fillStyle='#202a27';c.fillRect(0,0,canvas.width,canvas.height);
    c.strokeStyle='#a79975';c.lineWidth=3;c.strokeRect(9,9,canvas.width-18,canvas.height-18);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ded4b5';c.font=`${fontSize}px Georgia`;
    lines.forEach((text,i)=>c.fillText(text,canvas.width/2,canvas.height/2+(i-(lines.length-1)/2)*fontSize*1.45));
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
    add(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,roughness:.72,metalness:.15}),x,y,z);
  }

  // Folded metal enclosure, recessed door seam, hinge barrels and fasteners.
  for(const x of [-.32,.32])for(const y of [.99,1.94])box(.11,.1,.09,x,y,-.125,iron);
  box(.86,1.18,.23,0,1.46,0,paint,.035);
  box(.784,1.096,.022,0,1.46,.12,gasket,.015);
  box(.753,1.065,.046,0,1.46,.147,paint,.02);
  for(const y of [1.09,1.81]){
    box(.087,.14,.035,-.383,y,.148,steel);
    add(new THREE.CylinderGeometry(.022,.022,.145,16),iron,-.397,y,.176);
    for(const offset of [-.048,.048])add(new THREE.TorusGeometry(.022,.003,6,16),steel,-.397,y+offset,.176,Math.PI/2);
  }
  for(const x of [-.326,.326])for(const y of [1.005,1.915])screw(x,y,.178);
  label(['ORISON  /  AUXILIARY'],.49,.08,0,1.929,.173,38);

  // An inset analogue meter, with a separate needle that responds to power.
  const meterCanvas=document.createElement('canvas');meterCanvas.width=meterCanvas.height=256;
  const mc=meterCanvas.getContext('2d')!;mc.fillStyle='#d4c9a9';mc.fillRect(0,0,256,256);
  mc.strokeStyle='#303731';mc.fillStyle='#303731';mc.lineWidth=3;
  for(let i=0;i<=24;i++){
    const a=Math.PI*(.8+i/24*1.4),r=i%4===0?77:85;
    mc.beginPath();mc.moveTo(128+Math.cos(a)*r,132+Math.sin(a)*r);mc.lineTo(128+Math.cos(a)*98,132+Math.sin(a)*98);mc.stroke();
  }
  mc.font='bold 31px Georgia';mc.textAlign='center';mc.fillText('V',128,177);mc.font='17px Georgia';mc.fillText('0 — 250',128,205);
  const meterMap=new THREE.CanvasTexture(meterCanvas);meterMap.colorSpace=THREE.SRGBColorSpace;meterMap.anisotropy=8;
  disc(.12,.045,-.165,1.711,.191,gasket);
  add(new THREE.TorusGeometry(.108,.009,8,40),steel,-.165,1.711,.217);
  add(new THREE.CircleGeometry(.102,40),new THREE.MeshStandardMaterial({map:meterMap,roughness:.64}),-.165,1.711,.219);
  const needle=new THREE.Group();needle.position.set(-.165,1.711,.223);group.add(needle);
  const pointer=new THREE.Mesh(new THREE.BoxGeometry(.005,.084,.004),gasket);pointer.position.y=.036;needle.add(pointer);
  disc(.012,.008,-.165,1.711,.229,brass);
  for(const x of [.135,.258]){
    disc(.042,.045,x,1.738,.193,gasket);disc(.033,.012,x,1.738,.222,iron);
    box(.03,.004,.003,x,1.738,.23,brass,.001);
  }
  label(['FUSES'],.25,.064,.197,1.623,.174,40);

  // Raised disconnect handle, OFF/ON legends, and a bezel around the lamp.
  box(.226,.41,.052,.145,1.299,.197,gasket,.02);
  box(.15,.335,.016,.145,1.299,.23,iron);
  label(['ON'],.094,.046,.145,1.505,.245,65);
  label(['OFF'],.11,.046,.145,1.095,.245,60);
  const lever=new THREE.Group();lever.position.set(.145,1.3,.264);group.add(lever);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.017,.023,.16,12),steel);stem.position.y=.065;lever.add(stem);
  const grip=new THREE.Mesh(new RoundedBoxGeometry(.112,.065,.068,2,.014),bakelite);grip.position.y=.15;lever.add(grip);
  for(const part of [stem,grip]){part.castShadow=true;part.receiveShadow=true;}
  disc(.049,.021,-.223,1.333,.191,steel);disc(.038,.024,-.223,1.333,.211,gasket);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.03,20,12),new THREE.MeshBasicMaterial({color:0x9d4b24}));
  lamp.scale.z=.45;lamp.position.set(-.223,1.333,.233);group.add(lamp);
  label(['SUPPLY'],.195,.057,-.223,1.244,.174,48);
  label(['240 V   /   KEEP DRY'],.49,.083,0,.981,.174,40);

  // Every conduit has a gland at the cabinet and a termination at the
  // junction box. Routes pass outside the sign and rise into the ceiling.
  box(1.15,.43,.038,0,2.626,-.1,iron);
  label(['SACRISTY','ELECTRICAL SUPPLY'],1.13,.41,0,2.626,-.078,47);
  for(const x of [-.535,.535])for(const y of [2.457,2.795])screw(x,y,-.071);
  box(.59,.38,.15,0,3.455,-.066,paint,.018);
  box(.54,.33,.02,0,3.455,.017,iron);
  for(const x of [-.227,.227])for(const y of [3.335,3.575])screw(x,y,.033);
  label(['JUNCTION  01'],.38,.074,0,3.455,.03,40);
  for(const side of [-1,1]){
    const points=[new THREE.Vector3(side*.245,2.036,-.045),new THREE.Vector3(side*.245,2.16,-.045),
      new THREE.Vector3(side*.58,2.18,-.065),new THREE.Vector3(side*.72,2.3,-.07),
      new THREE.Vector3(side*.72,3.035,-.07),new THREE.Vector3(side*.62,3.15,-.07),
      new THREE.Vector3(side*.195,3.17,-.07),new THREE.Vector3(side*.195,3.28,-.07)];
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),80,.023,10,false),iron);
    for(const [x,y,z]of [[side*.245,2.067,-.045],[side*.195,3.268,-.07]]){
      add(new THREE.CylinderGeometry(.036,.036,.065,6),steel,x,y,z);
      for(const offset of [-.018,.018])add(new THREE.TorusGeometry(.033,.004,6,16),brass,x,y+offset,z,Math.PI/2);
    }
    for(const y of [2.43,2.94]){
      box(.12,.075,.065,side*.72,y,-.119,iron);
      box(.095,.025,.043,side*.72,y,-.047,steel);
      for(const offset of [-.044,.044])screw(side*.72+offset,y,-.016);
    }
  }
  add(new THREE.CylinderGeometry(.027,.027,1.03,16),iron,0,4.135,-.07);
  for(const y of [3.65,4.61])add(new THREE.CylinderGeometry(.045,.045,.07,8),steel,0,y,-.07);
  box(.2,.09,.2,0,4.64,-.07,iron);
  for(const y of [3.91,4.36]){box(.13,.075,.065,0,y,-.119,iron);box(.11,.028,.047,0,y,-.046,steel);}

  for(const [material,parts]of batches){
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    parts.forEach(g=>g.dispose());
  }
  let previous:boolean|undefined;
  function setPowered(powered:boolean){
    if(previous===powered)return;previous=powered;
    lamp.material.color.set(powered?0x9dbe70:0x9d4b24);
    lever.rotation.x=powered?.45:Math.PI-.45;
    needle.rotation.z=powered?-.8:2.1;
  }
  setPowered(false);
  return {group,setPowered};
}
