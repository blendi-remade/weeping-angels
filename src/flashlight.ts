import * as THREE from 'three';

/** A compact physical torch, raised from the lower edge rather than a HUD icon. */
export function createFlashlight(camera:THREE.Camera){
  const group=new THREE.Group();group.name='Player flashlight';camera.add(group);
  const paint=new THREE.MeshStandardMaterial({color:0x29332e,roughness:.58,metalness:.6});
  const metal=new THREE.MeshStandardMaterial({color:0x6d736e,roughness:.36,metalness:.85});
  const rubber=new THREE.MeshStandardMaterial({color:0x151c1a,roughness:.85});
  function cylinder(radius:number,length:number,z:number,material:THREE.Material,top=radius){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,radius,length,32),material);mesh.rotation.x=Math.PI/2;mesh.position.z=z;group.add(mesh);return mesh;
  }
  cylinder(.035,.22,.03,paint);cylinder(.057,.09,-.12,paint,.041);
  cylinder(.061,.018,-.17,rubber);cylinder(.056,.012,-.182,metal);
  for(let i=0;i<5;i++)cylinder(.037,.006,.075-i*.022,rubber);
  cylinder(.039,.02,.15,metal);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.049,32),new THREE.MeshBasicMaterial({color:0xc4d1c8}));lens.rotation.y=Math.PI;lens.position.z=-.19;group.add(lens);
  const button=new THREE.Mesh(new THREE.BoxGeometry(.018,.008,.036),rubber);button.position.set(0,.037,.015);group.add(button);
  // A little spill catches the barrel without lighting the room behind the beam.
  const spill=new THREE.PointLight(0xc4d1c8,.85,.75,2);spill.position.set(.12,-.06,-.3);camera.add(spill);
  let amount=0;
  return {group,spill,reset(raised=false){amount=raised?1:0;},update(dt:number,raised:boolean,time:number,moving:boolean,fear:number){
    amount=THREE.MathUtils.damp(amount,raised?1:0,raised?9:12,dt);
    group.visible=amount>.015;group.position.set(.285+Math.sin(time*1.5)*.002,-.25-(1-amount)*.38,-.46);
    group.rotation.set(-.04+(1-amount)*.65,-.08,.08);
    if(moving){group.position.y+=Math.sin(time*8)*.009;group.rotation.z+=Math.sin(time*4)*.012;}
    group.position.x+=Math.sin(time*17)*fear*.0015;
    // Keep the light slot present so drawing the torch never recompiles the room.
    spill.intensity=group.visible?.85*amount:0;
    return THREE.MathUtils.smoothstep(amount,.45,.92);
  }};
}
