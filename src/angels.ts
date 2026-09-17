import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { canStand,segmentBlocked,sightBlockers } from './world';
import { pathfind,type Point } from './navigation';
import { Soundscape } from './audio';
import { isObserved } from './visibility';
import type { ObservationLighting } from './illumination';
export { isObserved } from './visibility';

export class Angel {
  private static nextAudioId=0;private audioId=Angel.nextAudioId++;
  group=new THREE.Group();active=false;seen=false;observed=false;pose=0;path:Point[]=[];pathTimer=0;stepTimer=0;rest=new Map<THREE.Bone,THREE.Quaternion>();bones:THREE.Bone[]=[];lastObserved=true;
  private localObservationBounds=new THREE.Box3();
  private localPoseBounds:THREE.Box3[]=[];
  readonly collisionRadius:number;
  readonly captureReach:number;
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
    this.group.add(copy);
    // Measure actual morphed/skinned vertices once, across every authored pose.
    // The horizontal envelope contains them at ANY facing angle, including
    // the turn and pose change performed during an unseen step.
    const poses=new THREE.Box3();
    for(let pose=0;pose<4;pose++){
      this.setPose(pose);this.group.updateMatrixWorld(true);
      copy.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)(o as THREE.SkinnedMesh).skeleton.update();});
      const poseBounds=new THREE.Box3().setFromObject(this.group,true);
      this.localPoseBounds.push(poseBounds);poses.union(poseBounds);
    }
    const radius=Math.hypot(Math.max(Math.abs(poses.min.x),Math.abs(poses.max.x)),Math.max(Math.abs(poses.min.z),Math.abs(poses.max.z)));
    // A full-pose cylinder keeps wings and reaching hands clear at every yaw.
    this.collisionRadius=radius;
    // The model faces +Z. An extended hand can touch the player's .23 m body
    // before either center reaches the old 1.05 m capture threshold.
    this.captureReach=Math.max(1.05,poses.max.z+.23);
    this.localObservationBounds.set(new THREE.Vector3(-radius,poses.min.y,-radius),new THREE.Vector3(radius,poses.max.y,radius));
    this.group.position.copy(start);this.group.rotation.y=0;scene.add(this.group);this.setPose(0);
  }
  observationBounds(position=this.group.position){return this.localObservationBounds.clone().translate(position);}
  private posedBounds(position=this.group.position,pose=this.pose,yaw=this.group.rotation.y){
    return this.localPoseBounds[pose].clone().applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(position);
  }
  private canCatch(camera:THREE.Camera){
    return Math.hypot(this.group.position.x-camera.position.x,this.group.position.z-camera.position.z)<=this.captureReach&&
      !segmentBlocked(this.group.position.clone().setY(1.3),camera.position);
  }
  private hasSpace(from:Point,to:Point,others:readonly Angel[]){
    const dx=to.x-from.x,dz=to.z-from.z,lengthSquared=dx*dx+dz*dz;
    return others.every(other=>{
      if(other===this)return true;
      const p=other.group.position,radius=this.collisionRadius+other.collisionRadius+.06;
      // Closest point on the whole step prevents tunnelling or swapping places.
      const t=lengthSquared>0?THREE.MathUtils.clamp(((p.x-from.x)*dx+(p.z-from.z)*dz)/lengthSquared,0,1):0;
      return Math.hypot(from.x+dx*t-p.x,from.z+dz*t-p.z)>=radius;
    });
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
  update(dt:number,camera:THREE.PerspectiveCamera,eyesClosed:boolean,sound:Soundscape,speed:number,allowMovement=true,others:readonly Angel[]=[],lighting?:ObservationLighting){
    // Use the actual posed mesh's bounds for sight. The full-yaw collision
    // envelope includes empty space around the wings and can cross the camera
    // while the entire statue is behind the player, making capture impossible.
    const bounds=this.posedBounds();
    const visible=isObserved(camera,bounds,eyesClosed,sightBlockers,lighting);this.observed=visible;
    const dist=Math.hypot(this.group.position.x-camera.position.x,this.group.position.z-camera.position.z);
    if(visible)this.seen=true;
    if(visible&&!this.lastObserved&&dist<5&&this.active)sound.reveal();this.lastObserved=visible;
    if(!this.active||visible||!allowMovement){sound.stopScrape?.(this.audioId);return false;}
    if(this.canCatch(camera))return true;
    this.pathTimer-=dt;
    if(this.pathTimer<=0){this.path=pathfind(this.group.position,camera.position,(from,to)=>this.hasSpace(from,to,others));this.pathTimer=.65;}
    if(this.path.length){
      const target=this.path[0],dx=target.x-this.group.position.x,dz=target.z-this.group.position.z,d=Math.hypot(dx,dz),step=Math.min(speed*dt,d);
      if(d<.08)this.path.shift();else{
        const nx=this.group.position.x+dx/d*step,nz=this.group.position.z+dz/d*step;
        // Check the entire swept volume, not just the destination or center.
        // No translation, rotation or pose change is committed if it may show.
        const next=new THREE.Vector3(nx,0,nz);
        const nextYaw=Math.atan2(camera.position.x-nx,camera.position.z-nz),nextPose=dist<1.8?3:dist<4?2:1;
        // Poses swap instantaneously. Contain both rendered poses, including
        // their facing directions, and the translation between them.
        const swept=bounds.clone().union(this.posedBounds(next,nextPose,nextYaw));
        if(!this.hasSpace(this.group.position,next,others)){
          // Replan promptly, but never push either statue to resolve contact.
          this.pathTimer=Math.min(this.pathTimer,.15);sound.stopScrape?.(this.audioId);
        }else if(canStand(nx,nz,.31)&&!isObserved(camera,swept,eyesClosed,sightBlockers,lighting)){
          this.group.position.copy(next);this.group.rotation.y=nextYaw;
          this.setPose(nextPose);this.stepTimer-=dt;
          if(this.stepTimer<=0){sound.scrape(nx,nz,this.audioId);this.stepTimer=1.1;}
        }
      }
    }else sound.stopScrape?.(this.audioId);
    return this.canCatch(camera);
  }
}
export async function loadAngels(scene:THREE.Scene){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf=await loader.loadAsync('/assets/angel-game.glb');
  // The second statue occupies open sanctuary floor, clear of the side-aisle
  // candelabrum, column plinths, pews and the other statue's full pose envelope.
  return [new Angel(gltf.scene,scene,new THREE.Vector3(.1,0,-9.5)),new Angel(gltf.scene,scene,new THREE.Vector3(-3,0,-10.2))];
}
