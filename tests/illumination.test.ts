import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { canReveal,type ObservationLighting } from '../src/illumination.ts';
import { Angel,isObserved } from '../src/angels.ts';
import { sightBlockers } from '../src/world.ts';
import type { Soundscape } from '../src/audio.ts';

const box=(min:number[],max:number[])=>new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
const dark:ObservationLighting={ambient:false,lights:[]};
const silent={scrape(){},reveal(){},stopScrape(){}} as unknown as Soundscape;
function view(){const c=new THREE.PerspectiveCamera(64,2,.06,65);c.position.set(0,1.68,8);c.lookAt(0,1.68,0);c.updateMatrixWorld();return c;}
function torch(camera:THREE.Camera,angle=Math.PI/7):ObservationLighting{return {ambient:false,lights:[{position:camera.position.clone(),direction:new THREE.Vector3(0,0,-1),angle,range:26}]};}
function angel(){const m=new THREE.Mesh(new THREE.BoxGeometry(.6,2.65,.6),new THREE.MeshStandardMaterial());m.position.y=1.325;const a=new Angel(m,new THREE.Scene(),new THREE.Vector3());a.active=true;a.path=[{x:0,z:5}];a.pathTimer=10;return a;}
const state=(a:Angel)=>[...a.group.position.toArray(),a.group.rotation.y,a.pose];

test('an angel advances inside the FOV in complete darkness with eyes open',()=>{
  const a=angel(),c=view();assert(isObserved(c,a.observationBounds(),false));
  assert(!isObserved(c,a.observationBounds(),false,[],dark));
  for(let i=0;i<20;i++)a.update(.016,c,false,silent,3.2,true,[a],dark);
  assert(a.group.position.z>.9);assert.equal(a.observed,false);
});

test('switching on the torch freezes position, rotation and pose on the very first frame',()=>{
  const a=angel(),c=view();a.update(.05,c,false,silent,3.2,true,[a],dark);const before=state(a);
  for(let i=0;i<60;i++)a.update(.016,c,false,silent,3.2,true,[a],torch(c));
  assert(a.observed);assert.deepEqual(state(a),before);
});

test('switching off the last light releases the angel again without a blink or camera turn',()=>{
  const a=angel(),c=view();a.update(.05,c,false,silent,3.2,true,[a],torch(c));assert.equal(a.group.position.z,0);
  a.update(.05,c,false,silent,3.2,true,[a],dark);assert(a.group.position.z>0);
});

test('twilight, restored ambient light, and unknown lighting keep the conservative rule',()=>{
  const c=view(),bounds=box([-.4,0,-.3],[.4,2.65,.3]);
  assert(isObserved(c,bounds,false,[],{ambient:true,lights:[]}));assert(isObserved(c,bounds,false));
  assert(!isObserved(c,bounds,true,[],{ambient:true,lights:[]}));
});

test('a wing touching the outside penumbra freezes an angel whose center misses the beam',()=>{
  const c=view(),light=torch(c,.15),bounds=box([1.1,.9,-.2],[3.5,2.2,.2]);
  assert(canReveal(bounds,c.position,light));assert(isObserved(c,bounds,false,[],light));
  assert(!isObserved(c,box([5.7,.9,-.2],[6,2.2,.2]),false,[],light));
});

test('a column hiding the torso cannot release a lit wing sliver',()=>{
  const c=view(),bounds=box([-1.5,0,-.3],[1.5,2.65,.3]);
  const column=box([-.45,0,3.8],[.45,6,4.2]);
  assert(isObserved(c,bounds,false,[column],torch(c)));
});

test('a dark step cannot cross a lit beam even when both endpoints are unlit',()=>{
  const a=angel(),c=view(),light=torch(c,.1);a.group.position.x=-4;a.path=[{x:4,z:0}];
  assert(!isObserved(c,a.observationBounds(),false,[],light));
  assert(!isObserved(c,a.observationBounds(new THREE.Vector3(4,0,0)),false,[],light));
  const before=state(a);a.update(1,c,false,silent,8,true,[a],light);assert.deepEqual(state(a),before);
});

test('a lit floor reflection still freezes a statue outside the direct view',()=>{
  const c=view(),bounds=box([-.7,0,-.3],[.7,2.65,.3]),light=torch(c);c.lookAt(0,-8,0);c.updateMatrixWorld();
  assert(!isObserved(c,bounds,false,[],light));c.userData.reflectionEnabled=true;
  assert(isObserved(c,bounds,false,[],light));assert(!isObserved(c,bounds,false,[],dark));
});

test('a silhouette in front of a lit background counts even without direct illumination',()=>{
  const c=view(),light=torch(c,.05),bounds=box([1.2,1.58,3.9],[1.4,1.78,4.1]);
  assert(!canReveal(bounds,c.position,light));
  const eye=c.position.clone();eye.x=2.6;assert(canReveal(bounds,eye,light));
});

test('nearby barrel spill protects the last visible stone as the flashlight lowers',()=>{
  const c=view(),bounds=box([-.2,1,7],[.2,2,7.3]);
  const spill:ObservationLighting={ambient:false,lights:[{position:new THREE.Vector3(.12,1.62,7.7),range:.75}]};
  assert(isObserved(c,bounds,false,[],spill));assert(!isObserved(c,bounds,false,[],dark));
});

test('darkness does not bypass opaque walls or disable collisions',()=>{
  const a=angel(),c=view();const wall=box([-3,0,3.8],[3,5,4.2]);
  sightBlockers.push(wall);
  try{assert(!isObserved(c,a.observationBounds(),false,sightBlockers,torch(c)));}
  finally{sightBlockers.length=0;}
  const other=angel();other.group.position.z=2.5;
  a.update(1,c,false,silent,8,true,[a,other],dark);assert.equal(a.group.position.z,0);
});
