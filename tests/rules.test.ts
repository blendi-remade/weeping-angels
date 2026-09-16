import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { canStand,insideFloor,obstacles,segmentBlocked } from '../src/world.ts';
import { pathfind } from '../src/navigation.ts';
import { isObserved } from '../src/angels.ts';
test('floor layout connects the nave and both side rooms, but excludes the exterior',()=>{
  assert(insideFloor(0,0));assert(insideFloor(10,-7));assert(insideFloor(-10,7));assert(!insideFloor(10,7));assert(!insideFloor(0,17));
  assert(pathfind({x:0,z:13},{x:12,z:-7}).length>0);assert(pathfind({x:12,z:-7},{x:-12,z:7}).length>0);
});
test('navigation routes around a solid wall and never cuts through it',()=>{
  obstacles.push({x:0,z:0,w:4,d:1,h:3});
  try{assert(!canStand(0,0));const path=pathfind({x:0,z:3},{x:0,z:-3});assert(path.length>0);assert(path.every(p=>canStand(p.x,p.z,.35)));assert(path.some(p=>Math.abs(p.x)>2));}finally{obstacles.length=0;}
});
test('observation requires view and line of sight, blinking releases observation',()=>{
  const camera=new THREE.PerspectiveCamera(65,16/9,.05,60);camera.position.set(0,1.68,4);camera.lookAt(0,1.4,0);camera.updateMatrixWorld();
  const angel=new THREE.Vector3(0,0,0);assert(isObserved(camera,angel,false));assert(!isObserved(camera,angel,true));
  obstacles.push({x:0,z:2,w:4,d:.5,h:4});try{assert(!isObserved(camera,angel,false));assert(segmentBlocked(camera.position,new THREE.Vector3(0,1.5,0)));}finally{obstacles.length=0;}
  camera.lookAt(0,1.68,8);camera.updateMatrixWorld();assert(!isObserved(camera,angel,false));
});
test('low cover does not hide the entire angel',()=>{
  const camera=new THREE.PerspectiveCamera(65,16/9,.05,60);camera.position.set(0,1.68,4);camera.lookAt(0,1.4,0);camera.updateMatrixWorld();
  obstacles.push({x:0,z:2,w:4,d:.5,h:.8});try{assert(isObserved(camera,new THREE.Vector3(0,0,0),false));}finally{obstacles.length=0;}
});
test('a visible floor reflection also freezes an angel',()=>{
  const camera=new THREE.PerspectiveCamera(65,16/9,.05,60);camera.position.set(0,1.68,4);camera.lookAt(0,-6,0);camera.updateMatrixWorld();
  assert.equal(isObserved(camera,new THREE.Vector3(0,0,0),false),false);
  camera.userData.reflectionEnabled=true;
  assert.equal(isObserved(camera,new THREE.Vector3(0,0,0),false),true);
  assert.equal(isObserved(camera,new THREE.Vector3(0,0,0),true),false);
});
