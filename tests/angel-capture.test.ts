import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Angel } from '../src/angels.ts';
import { obstacles,sightBlockers } from '../src/world.ts';
import type { Soundscape } from '../src/audio.ts';
import type { ObservationLighting } from '../src/illumination.ts';

const silent={scrape(){},reveal(){},stopScrape(){}} as unknown as Soundscape;
const dark:ObservationLighting={ambient:false,lights:[]};
// Use the shipped mesh and morph targets, without loading its images or WebGL.
// Its wide wings and long reaching pose caused the capture regression.
await MeshoptDecoder.ready;
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(fileURLToPath(new URL('../public/assets/angel-game.glb',import.meta.url)));
const model=new THREE.Group();
for(const node of doc.getRoot().listNodes()){
  const source=node.getMesh();if(!source)continue;
  for(const primitive of source.listPrimitives()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!,3));
    geometry.morphAttributes.position=primitive.listTargets().map(target=>new THREE.Float32BufferAttribute(target.getAttribute('POSITION')!.getArray()!,3));
    geometry.morphTargetsRelative=true;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
    mesh.morphTargetDictionary=Object.fromEntries((source.getExtras().targetNames as string[]).map((name,index)=>[name,index]));
    mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));model.add(mesh);
  }
}
function angel(){const a=new Angel(model,new THREE.Scene(),new THREE.Vector3());a.active=true;return a;}
function camera(z=6,yaw=0){const c=new THREE.PerspectiveCamera(64,16/9,.06,65);c.position.set(0,1.68,z);c.lookAt(Math.sin(yaw)*4,1.68,z+Math.cos(yaw)*4);c.userData.reflectionEnabled=true;c.updateMatrixWorld();return c;}
function torch(c:THREE.Camera):ObservationLighting{return {ambient:false,lights:[{position:c.position.clone(),direction:c.getWorldDirection(new THREE.Vector3()),angle:Math.PI/7,range:26}]};}
const state=(a:Angel)=>[...a.group.position.toArray(),a.group.rotation.y,a.pose];

test('the shipped angel catches a player looking away, in ambient light or with a forward flashlight',()=>{
  for(const yaw of [0,-.4,.4,-.8,.8])for(const flashlight of [false,true]){
    const a=angel(),c=camera(6,yaw);let caught=false;
    for(let frame=0;frame<600&&!caught;frame++)caught=a.update(1/60,c,false,silent,3.2,true,[a],flashlight?torch(c):undefined);
    assert(caught,`angel stalled behind player: yaw=${yaw}, flashlight=${flashlight}, distance=${c.position.z-a.group.position.z}`);
  }
});

test('an illuminated angel outside contact range stays frozen and harmless',()=>{
  for(const z of [1.15,1.8,2]){
    const a=angel(),c=camera(z,Math.PI),before=state(a);
    for(let frame=0;frame<30;frame++)assert.equal(a.update(1/60,c,false,silent,3.2,true,[a],torch(c)),false);
    assert(a.observed);assert.deepEqual(state(a),before);
  }
});

test('close contact is lethal even when the angel is illuminated and watched, without moving it',()=>{
  for(const z of [.75,1,1.1]){
    const a=angel(),c=camera(z,Math.PI),before=state(a);
    assert.equal(a.update(1/60,c,false,silent,3.2,true,[a],torch(c)),true);
    assert(a.observed);assert.deepEqual(state(a),before);
  }
});

test('looking at a nearby wall cannot make a close angel harmless',()=>{
  const a=angel();a.group.position.z=14.25;const c=camera(15.3);
  c.lookAt(0,.3,16);c.updateMatrixWorld();
  obstacles.push({x:0,z:16,w:16,d:.4,h:6});
  sightBlockers.push(new THREE.Box3(new THREE.Vector3(-8,0,15.8),new THREE.Vector3(8,6,16.2)));
  try{assert.equal(a.update(1/60,c,false,silent,3.2,true,[a],torch(c)),true);}
  finally{obstacles.length=0;sightBlockers.length=0;}
});

test('contact resolves with an empty route and another angel blocking further approach',()=>{
  const a=angel(),other=angel(),c=camera(1);
  other.group.position.z=2.7;a.path=[];a.pathTimer=10;
  const before=state(a),otherBefore=state(other);
  assert(a.group.position.distanceTo(other.group.position)>a.collisionRadius+other.collisionRadius+.06);
  assert.equal(a.update(1/60,c,false,silent,3.2,true,[a,other],dark),true);
  assert.deepEqual(state(a),before);assert.deepEqual(state(other),otherBefore);
});

test('looking directly at an unlit angel does not prevent capture in pitch darkness',()=>{
  const a=angel(),c=camera(6,Math.PI);let caught=false;
  for(let frame=0;frame<600&&!caught;frame++)caught=a.update(1/60,c,false,silent,3.2,true,[a],dark);
  assert(caught);
});

test('capture is checked after the movement step, before a later flashlight frame could save the player',()=>{
  const a=angel(),c=camera(a.captureReach+.04);a.path=[{x:0,z:.5}];a.pathTimer=10;
  assert.equal(a.update(.02,c,false,silent,3.2,true,[a],dark),true);
});

test('walls prevent capture even when an unseen angel is within reach',()=>{
  const a=angel(),c=camera(1.1);a.pathTimer=10;
  obstacles.push({x:0,z:.6,w:4,d:.2,h:3});
  sightBlockers.push(new THREE.Box3(new THREE.Vector3(-2,0,.5),new THREE.Vector3(2,3,.7)));
  try{assert.equal(a.update(1/60,c,true,silent,3.2,true,[a],dark),false);}
  finally{obstacles.length=0;sightBlockers.length=0;}
});

test('inactive angels and grace periods cannot capture or move',()=>{
  const a=angel(),c=camera(1.1),before=state(a);
  a.active=false;assert.equal(a.update(1/60,c,true,silent,3.2,true,[a],dark),false);
  a.active=true;assert.equal(a.update(1/60,c,true,silent,3.2,false,[a],dark),false);
  assert.deepEqual(state(a),before);
});
