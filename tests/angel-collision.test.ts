import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Angel } from '../src/angels.ts';
import { obstacles } from '../src/world.ts';
import type { Soundscape } from '../src/audio.ts';

const silent={scrape(){},reveal(){},stopScrape(){}} as unknown as Soundscape;
function statue(x:number,z:number,width=2.7){
  const model=new THREE.Mesh(new THREE.BoxGeometry(width,2.65,.6),new THREE.MeshStandardMaterial());
  model.position.y=1.325;
  const angel=new Angel(model,new THREE.Scene(),new THREE.Vector3(x,0,z));angel.active=true;return angel;
}
function camera(x=0,z=12){const c=new THREE.PerspectiveCamera(64,16/9,.06,65);c.position.set(x,1.68,z);c.lookAt(0,1.68,0);c.updateMatrixWorld();return c;}
function separated(a:Angel,b:Angel){assert(a.group.position.distanceTo(b.group.position)>=a.collisionRadius+b.collisionRadius+.06-1e-8,'full statue envelopes intersected');}
function state(a:Angel){return {position:a.group.position.toArray(),yaw:a.group.rotation.y,pose:a.pose};}

test('two pursuing angels never overlap while converging and changing direction',()=>{
  const angels=[statue(-3,-10),statue(3,-10)],view=camera();
  for(const [x,z]of [[0,12],[5,5],[-5,-10],[0,12]]){
    view.position.set(x,1.68,z);view.updateMatrixWorld();
    for(let frame=0;frame<300;frame++)for(const angel of angels){
      angel.update(1/30,view,true,silent,4.2,true,angels);separated(angels[0],angels[1]);
    }
    angels.reverse();
  }
  assert(angels.some(a=>a.group.position.z>8),'pursuit must still make progress');
});

test('a large step cannot tunnel through another angel even if its endpoint is clear',()=>{
  const moving=statue(-4,0),idle=statue(0,0);idle.active=false;
  moving.path=[{x:4,z:0}];moving.pathTimer=10;
  const before=state(moving);moving.update(1,camera(),true,silent,8,true,[moving,idle]);
  assert.deepEqual(state(moving),before);separated(moving,idle);
});

test('pathfinding routes around an inactive statue without pushing or changing it',()=>{
  const moving=statue(0,-7),idle=statue(0,0);idle.active=false;const before=state(idle),view=camera(0,7);
  let sideways=0;
  for(let frame=0;frame<450;frame++){
    moving.update(1/30,view,true,silent,4.2,true,[moving,idle]);separated(moving,idle);
    sideways=Math.max(sideways,Math.abs(moving.group.position.x));
  }
  assert(sideways>moving.collisionRadius+idle.collisionRadius);assert(moving.group.position.z>5);
  assert.deepEqual(state(idle),before);
});

test('an observed statue is never displaced by an approaching angel',()=>{
  const watched=statue(0,0),approaching=statue(0,-5),view=camera(0,4),before=state(watched);
  // Both are watched; separation must never be implemented as a post-update push.
  for(let frame=0;frame<180;frame++)for(const angel of [watched,approaching]){
    angel.update(1/30,view,false,silent,4.2,true,[watched,approaching]);separated(watched,approaching);
  }
  assert(watched.observed);assert.deepEqual(state(watched),before);
});

test('a blocked narrow passage makes the follower wait, then resume when cleared',()=>{
  const follower=statue(0,-5),leader=statue(0,0),view=camera(0,6);leader.active=false;
  obstacles.push({x:-4.5,z:0,w:7,d:31,h:5},{x:4.5,z:0,w:7,d:31,h:5});
  try{
    for(let frame=0;frame<120;frame++){follower.update(1/30,view,true,silent,4.2,true,[follower,leader]);separated(follower,leader);}
    assert(follower.group.position.z< -2);assert.equal(leader.group.position.z,0);
    leader.group.position.set(6,0,-10);
    for(let frame=0;frame<240;frame++){follower.update(1/30,view,true,silent,4.2,true,[follower,leader]);separated(follower,leader);}
    assert(follower.group.position.z>4);
  }finally{obstacles.length=0;}
});

test('clearance includes wide wings and every reaching pose at arbitrary yaw',()=>{
  const geometry=new THREE.BoxGeometry(2.7,2.65,.6),reach=geometry.attributes.position.clone();reach.name='Reaching';
  for(let i=0;i<reach.count;i++)reach.setZ(i,reach.getZ(i)+1.3);
  geometry.morphAttributes.position=[reach];
  const model=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());model.position.y=1.325;
  const a=new Angel(model,new THREE.Scene(),new THREE.Vector3()),b=statue(0,0);
  b.group.position.x=a.collisionRadius+b.collisionRadius+.06;
  for(let pose=0;pose<4;pose++)for(const yaw of [0,.7,Math.PI/2,Math.PI]){
    a.setPose(pose);a.group.rotation.y=yaw;a.group.updateMatrixWorld(true);
    a.group.traverse(object=>{
      const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        assert(Math.hypot(p.x,p.z)<=a.collisionRadius+1e-7);
        assert(Math.hypot(p.x-b.group.position.x,p.z)>b.collisionRadius);
      }
    });
  }
});
