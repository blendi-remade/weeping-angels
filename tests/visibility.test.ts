import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Angel,isObserved } from '../src/angels.ts';
import { obstacles,sightBlockers } from '../src/world.ts';
import type { Soundscape } from '../src/audio.ts';

const box=(min:number[],max:number[])=>new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
function view(){
  const camera=new THREE.PerspectiveCamera(60,1,.05,60);
  camera.position.set(0,1.68,4);camera.lookAt(0,1.68,0);camera.updateMatrixWorld();return camera;
}
function statue(width=2.7,depth=.5){
  const model=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(width,2.65,depth),new THREE.MeshStandardMaterial());
  mesh.position.y=1.325;model.add(mesh);return new Angel(model,new THREE.Scene(),new THREE.Vector3());
}
const silent={scrape(){},reveal(){}} as unknown as Soundscape;

test('a wing sliver beside a column freezes the entire angel',()=>{
  const camera=view(),angel=statue();angel.active=true;
  // This column hides all seven points used by the old visibility check.
  sightBlockers.push(box([-.525,0,1.75],[.525,6,2.25]));
  try{
    for(let frame=0;frame<60;frame++)assert.equal(angel.update(1/60,camera,false,silent,4.2),false);
    assert(angel.observed);assert.deepEqual(angel.group.position.toArray(),[0,0,0]);
    assert.equal(angel.pose,0);assert.equal(angel.group.rotation.y,0);
  }finally{sightBlockers.length=0;}
});

test('a navigation collider must not masquerade as opaque stone',()=>{
  obstacles.push({x:0,z:2,w:4,d:1,h:6});
  try{assert(isObserved(view(),box([-1,0,-.2],[1,2.65,.2]),false,sightBlockers));}
  finally{obstacles.length=0;}
});

test('slivers at every screen edge count, even when the center is off screen',()=>{
  const camera=view();
  for(const bounds of [
    box([2.29,.6,-.01],[3.7,2,.01]),box([-3.7,.6,-.01],[-2.29,2,.01]),
    box([-.2,3.97,-.01],[.2,5,.01]),box([-.2,-2,-.01],[.2,-.61,.01]),
  ])assert(isObserved(camera,bounds,false));
  assert(!isObserved(camera,box([3.5,.6,-.01],[4.5,2,.01]),false));
  assert(!isObserved(camera,box([-.5,0,5],[.5,2.65,6]),false));
});

test('separate blockers covering the corners cannot conceal a visible central gap',()=>{
  const bounds=box([-1,0,-.2],[1,2.65,.2]);
  const solids=[box([-4,0,1.75],[-.04,5,2.25]),box([.04,0,1.75],[4,5,2.25])];
  assert(isObserved(view(),bounds,false,solids));
});

test('full opaque cover still allows stalking, but cover behind the target does not',()=>{
  const bounds=box([-1,0,-.2],[1,2.65,.2]);
  assert(!isObserved(view(),bounds,false,[box([-4,0,1.75],[4,5,2.25])]));
  assert(isObserved(view(),bounds,false,[box([-4,0,-3],[4,5,-2])]));
});

test('a wall hiding both the statue and the floor reflection permits movement',()=>{
  const camera=view();camera.userData.reflectionEnabled=true;
  const bounds=box([-1,0,-.2],[1,2.65,.2]);
  assert(!isObserved(camera,bounds,false,[box([-4,0,2.75],[4,5,3.25])]));
});

test('a step cannot cross a visible gap between two concealed endpoints',()=>{
  const camera=view(),angel=statue(.6,.6);angel.active=true;angel.group.position.x=-2.8;
  angel.path=[{x:2.8,z:0}];angel.pathTimer=2;
  sightBlockers.push(box([-4,0,1.75],[-.04,5,2.25]),box([.04,0,1.75],[4,5,2.25]));
  try{
    assert(!isObserved(camera,angel.observationBounds(),false,sightBlockers));
    assert(!isObserved(camera,angel.observationBounds(new THREE.Vector3(2.8,0,0)),false,sightBlockers));
    angel.update(1,camera,false,silent,5.6);
    assert.equal(angel.group.position.x,-2.8);
  }finally{sightBlockers.length=0;}
});

test('a proposed step into view cannot translate, turn, or change the pose',()=>{
  const angel=statue(.6,.6),camera=view();angel.group.position.x=3.2;angel.active=true;
  angel.path=[{x:2,z:0}];angel.pathTimer=1;
  assert(!isObserved(camera,angel.observationBounds(),false));
  assert(isObserved(camera,angel.observationBounds(new THREE.Vector3(2.7,0,0)),false));
  angel.update(.05,camera,false,silent,10);
  assert.deepEqual(angel.group.position.toArray(),[3.2,0,0]);assert.equal(angel.pose,0);assert.equal(angel.group.rotation.y,0);
});

test('only fully closed eyes release a visible angel, which freezes again on reopening',()=>{
  const angel=statue(),camera=view();angel.active=true;angel.path=[{x:0,z:1}];angel.pathTimer=1;
  angel.update(.05,camera,false,silent,3);assert.equal(angel.group.position.z,0);
  angel.update(.05,camera,true,silent,3);assert(angel.group.position.z>0);
  const position=angel.group.position.clone(),pose=angel.pose,rotation=angel.group.rotation.y;
  angel.update(.05,camera,false,silent,3);
  assert(angel.group.position.equals(position));assert.equal(angel.pose,pose);assert.equal(angel.group.rotation.y,rotation);
});

test('bounds include every morph pose and any facing direction',()=>{
  const model=new THREE.Group(),geometry=new THREE.BoxGeometry(.5,2.65,.5);
  const reach=geometry.attributes.position.clone();reach.name='Reaching';
  for(let i=0;i<reach.count;i++)reach.setZ(i,reach.getZ(i)+2);
  geometry.morphAttributes.position=[reach];
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.position.y=1.325;model.add(mesh);
  const angel=new Angel(model,new THREE.Scene(),new THREE.Vector3());
  for(let pose=0;pose<4;pose++)for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI,5*Math.PI/4]){
    angel.setPose(pose);angel.group.rotation.y=yaw;angel.group.updateMatrixWorld(true);
    assert(angel.observationBounds().containsBox(new THREE.Box3().setFromObject(angel.group,true)));
  }
});
