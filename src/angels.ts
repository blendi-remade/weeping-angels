import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { canStand,segmentBlocked } from './world';
import { pathfind,type Point } from './navigation';
import { Soundscape } from './audio';

export function isObserved(camera:THREE.PerspectiveCamera,position:THREE.Vector3,blinking:boolean){
  if(blinking)return false;
  const projected=new THREE.Vector3();
  for(const [x,y]of [[0,.35],[0,1.3],[0,2.3],[-.6,1.7],[.6,1.7],[-.4,2.5],[.4,2.5]]){
    const p=new THREE.Vector3(position.x+x,y,position.z);projected.copy(p).project(camera);
    if(projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.035&&Math.abs(projected.y)<1.035&&!segmentBlocked(camera.position,p))return true;
    if(camera.userData.reflectionEnabled){
      const reflected=p.clone();reflected.y=-reflected.y;projected.copy(reflected).project(camera);
      if(projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1){
        const hit=camera.position.clone().lerp(reflected,camera.position.y/(camera.position.y+y));hit.y=.015;
        if(Math.abs(hit.x)<7.7&&Math.abs(hit.z)<15.7&&!segmentBlocked(camera.position,hit)&&!segmentBlocked(hit,p))return true;
      }
    }
  }
  return false;
}
export class Angel {
  group=new THREE.Group();active=false;seen=false;observed=false;pose=0;path:Point[]=[];pathTimer=0;stepTimer=0;rest=new Map<THREE.Bone,THREE.Quaternion>();bones:THREE.Bone[]=[];lastObserved=true;
  constructor(model:THREE.Object3D,scene:THREE.Scene,public start:THREE.Vector3){
    const copy=clone(model);copy.updateMatrixWorld(true);copy.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh){const m=o as THREE.SkinnedMesh;m.skeleton.update();m.computeBoundingBox();}});
    const bounds=new THREE.Box3();copy.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){if((m as THREE.SkinnedMesh).isSkinnedMesh)bounds.union((m as THREE.SkinnedMesh).boundingBox!.clone().applyMatrix4(m.matrixWorld));else bounds.union(new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute).applyMatrix4(m.matrixWorld));}});
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=2.65/size.y;copy.scale.multiplyScalar(scale);copy.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    copy.traverse(o=>{
      if((o as THREE.Mesh).isMesh){const m=o as THREE.Mesh;m.castShadow=true;m.receiveShadow=true;
        const materials=Array.isArray(m.material)?m.material:[m.material];m.material=materials.map(mat=>{const c=mat.clone() as THREE.MeshStandardMaterial;if(c.isMeshStandardMaterial){c.emissive.set(0);c.emissiveMap=null;c.roughness=.92;c.roughnessMap=null;c.normalScale.set(.55,.55);c.metalness=0;c.color.multiplyScalar(.73);if(c.map){c.map.anisotropy=8;c.map.colorSpace=THREE.SRGBColorSpace;}}return c;});if(materials.length===1)m.material=m.material[0];
      }
      if((o as THREE.Bone).isBone){const b=o as THREE.Bone;this.bones.push(b);this.rest.set(b,b.quaternion.clone());}
    });
    this.group.add(copy);this.group.position.copy(start);this.group.rotation.y=0;scene.add(this.group);this.setPose(0);
  }
  reset(){this.group.position.copy(this.start);this.group.rotation.y=0;this.active=false;this.seen=false;this.observed=false;this.path=[];this.pathTimer=0;this.lastObserved=true;this.setPose(0);}
  setPose(pose:number){
    this.pose=pose;
    this.group.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.morphTargetInfluences&&mesh.morphTargetDictionary){mesh.morphTargetInfluences.fill(0);const name=pose===0?'Weeping':pose===2?'Reaching':pose===3?'Lunging':null;if(name&&name in mesh.morphTargetDictionary)mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]]=1;}});
    for(const b of this.bones){b.quaternion.copy(this.rest.get(b)!);}
    // Bone-space poses are refined against the actual imported skeleton.
    for(const b of this.bones){
      const n=b.name.toLowerCase();
      if(/head/.test(n)&&!/end/.test(n)){b.rotateX(pose===0?.12:pose===2?-.1:0);b.rotateZ(pose===1?.08:0);}
    }
  }
  update(dt:number,camera:THREE.PerspectiveCamera,blinking:boolean,sound:Soundscape,speed:number){
    const visible=isObserved(camera,this.group.position,blinking);this.observed=visible;
    const dist=Math.hypot(this.group.position.x-camera.position.x,this.group.position.z-camera.position.z);
    if(visible)this.seen=true;
    if(visible&&!this.lastObserved&&dist<5&&this.active)sound.reveal();this.lastObserved=visible;
    if(!this.active||visible)return false;
    this.pathTimer-=dt;
    if(this.pathTimer<=0){this.path=pathfind(this.group.position,camera.position);this.pathTimer=.65;}
    if(this.path.length){
      const target=this.path[0],dx=target.x-this.group.position.x,dz=target.z-this.group.position.z,d=Math.hypot(dx,dz),step=Math.min(speed*dt,d);
      if(d<.08)this.path.shift();else{
        const nx=this.group.position.x+dx/d*step,nz=this.group.position.z+dz/d*step;
        // Never step into observation: test the candidate before committing it.
        const next=new THREE.Vector3(nx,0,nz);
        if(canStand(nx,nz,.31)&&!isObserved(camera,next,blinking)){
          this.group.position.copy(next);this.group.rotation.y=Math.atan2(camera.position.x-nx,camera.position.z-nz);
          this.setPose(dist<1.8?3:dist<4?2:1);this.stepTimer-=dt;
          if(this.stepTimer<=0){sound.scrape(nx,nz);this.stepTimer=.8;}
        }
      }
    }
    return dist<1.05&&!segmentBlocked(this.group.position.clone().setY(1.3),camera.position);
  }
}
export async function loadAngels(scene:THREE.Scene){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf=await loader.loadAsync('/assets/angel-game.glb');
  return [new Angel(gltf.scene,scene,new THREE.Vector3(.1,0,-9.5)),new Angel(gltf.scene,scene,new THREE.Vector3(-6.1,0,-11))];
}
