import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeWorld,canStand,type Station } from './world';
import { loadAngels,type Angel } from './angels';
import { Soundscape } from './audio';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const show=(id:string,v:boolean)=>$(id).classList.toggle('hidden',!v);
const canvas=$<HTMLCanvasElement>('world');
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c1319);scene.fog=new THREE.FogExp2(0x152129,.027);
const camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.06,65);camera.rotation.order='YXZ';
camera.userData.reflectionEnabled=true;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.info.autoReset=false;
const pmrem=new THREE.PMREMGenerator(renderer),envScene=new RoomEnvironment();scene.environment=pmrem.fromScene(envScene,.04).texture;scene.environmentIntensity=.075;envScene.dispose();pmrem.dispose();
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.25,.55,.95);composer.addPass(bloom);composer.addPass(new OutputPass());
const film=new ShaderPass({uniforms:{tDiffuse:{value:null},time:{value:0},stress:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse;uniform float time;uniform float stress;varying vec2 vUv;float rand(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time)*43758.5453);}void main(){vec2 uv=vUv;vec3 c=texture2D(tDiffuse,uv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,.82);c=pow(c,vec3(.98,1.,1.01));float vignette=1.-dot(uv-.5,uv-.5)*(.5+stress*.6);c*=vignette;c+=(rand(uv)-.5)*.017;gl_FragColor=vec4(c,1.);}`});composer.addPass(film);
const flashlight=new THREE.SpotLight(0xffedd1,21,26,Math.PI/7,.75,1.7);flashlight.castShadow=true;flashlight.shadow.mapSize.set(1024,1024);flashlight.shadow.bias=-.0002;flashlight.shadow.normalBias=.015;scene.add(flashlight,flashlight.target);
const fill=new THREE.PointLight(0xafc2c9,.7,4,2);scene.add(fill);
const sound=new Soundscape();
let world:Awaited<ReturnType<typeof makeWorld>>|undefined,angels:Angel[]=[],ready=false;
type Mode='menu'|'playing'|'paused'|'caught'|'dead'|'won';let mode:Mode='menu';let caughtTime=0;
let powered=false,hasKey=false,readNote=false,stage=0,elapsed=0,blinkCount=0,eye=1,blinkTime=0,blinkCooldown=0,autoBlink=true,lightOn=true,quality=true;
let yaw=0,pitch=0,sensitivity=1,stepTime=0,walkTime=0,hold=0,station:Station|null=null,subtitleTimer=0,grace=4,secondIntro=false;
const player=new THREE.Vector3(0,1.68,13.1),keys=new Set<string>(),forward=new THREE.Vector3(),right=new THREE.Vector3(),direction=new THREE.Vector3();
let lastTime=performance.now(),frameMs=16,menuMouse={x:0,y:0},noticeTimeout=0;
const checkpoint={powered:false,hasKey:false};
const objectives=['Find the electrical panel in the sacristy.','Find the gate key in the archive.','Return to the entrance. Unlock the gate.'];
function notice(text:string){$('notice').textContent=text;$('notice').style.opacity='1';clearTimeout(noticeTimeout);noticeTimeout=window.setTimeout(()=>$('notice').style.opacity='0',4000);}
function subtitle(text:string,duration=6){$('subtitle').textContent=text;$('subtitle').style.opacity='1';subtitleTimer=duration;}
function setMode(next:Mode){mode=next;show('menu',next==='menu');show('hud',next==='playing');show('pause',next==='paused');show('ending',next==='dead'||next==='won');keys.clear();hold=0;}
function reset(resumeCheckpoint=false){
  powered=resumeCheckpoint&&checkpoint.powered;hasKey=resumeCheckpoint&&checkpoint.hasKey;stage=hasKey?2:powered?1:0;readNote=false;secondIntro=false;elapsed=0;blinkCount=0;eye=1;blinkTime=0;blinkCooldown=0;grace=5;lightOn=true;yaw=0;pitch=0;player.set(0,1.68,13.1);hold=0;station=null;
  if(resumeCheckpoint&&hasKey){player.set(-11.2,1.68,7);yaw=-Math.PI/2;}else if(resumeCheckpoint&&powered){player.set(11.5,1.68,-7);yaw=Math.PI/2;}
  angels.forEach(a=>a.reset());if(powered)angels[0].active=true;if(hasKey)angels[1].active=true;
  if(world){world.stations.find(s=>s.id==='key')!.object.visible=!hasKey;world.stations.find(s=>s.id==='gate')!.object.position.y=0;world.moon.shadow.needsUpdate=true;}
  $('objective').textContent=objectives[stage];$('blink').classList.remove('closed');$('damage').style.opacity='0';
}
async function lock(){
  try{await canvas.requestPointerLock();}catch{notice('Click the scene to capture your mouse. Escape releases it.');}
}
function start(resumeCheckpoint=false){if(!ready)return;if(!resumeCheckpoint)checkpoint.powered=checkpoint.hasKey=false;reset(resumeCheckpoint);setMode('playing');sound.start();void lock();subtitle(powered?'The chapel remembers you.':'The gate is locked. There must be another way out.',6);}
function pause(){if(mode!=='playing')return;setMode('paused');if(document.pointerLockElement)document.exitPointerLock();sound.pause();}
function resume(){if(mode!=='paused')return;setMode('playing');grace=Math.max(grace,1);sound.start();void lock();}
function title(){setMode('menu');if(document.pointerLockElement)document.exitPointerLock();sound.pause();reset();}
function finish(won:boolean){
  if(mode!=='playing'&&mode!=='caught')return;setMode(won?'won':'dead');if(document.pointerLockElement)document.exitPointerLock();
  $('ending-label').textContent=won?'YOU SURVIVED THE VIGIL':'SAINT ORISON CLAIMS ANOTHER';$('ending-title').textContent=won?'You kept watching.':'You looked away.';
  $('ending-copy').innerHTML=won?'The gate gives way. Cold air fills your lungs.<br>Behind you, the stone is perfectly still.':'A hand of cold stone. A moment stolen.<br>Somewhere, a chapel waits for you again.';
  $('stats').textContent=`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')} IN THE CHAPEL · ${blinkCount} BLINKS`;
  $('retry').innerHTML=won?'ENTER AGAIN <span>↗</span>':`${checkpoint.powered?'CONTINUE FROM CHECKPOINT':'TRY AGAIN'} <span>↗</span>`;
  if(won)sound.complete();else{$('damage').style.opacity='0';}
}
function caught(angel:Angel){
  angel.setPose(3);angel.group.rotation.y=Math.atan2(player.x-angel.group.position.x,player.z-angel.group.position.z);if(world)world.moon.shadow.needsUpdate=true;
  camera.lookAt(angel.group.position.x,2.36,angel.group.position.z);caughtTime=1.15;setMode('caught');sound.death();$('damage').style.opacity='.55';
}
function blink(){if(mode!=='playing'||blinkTime>0||blinkCooldown>0)return;blinkTime=.29;blinkCooldown=.9;eye=1;blinkCount++;$('blink').classList.add('closed');sound.blink();}
function toggleQuality(){quality=!quality;camera.userData.reflectionEnabled=quality;renderer.setPixelRatio(Math.min(devicePixelRatio,quality?1.35:.85));composer.setPixelRatio(renderer.getPixelRatio());if(world)world.reflection.visible=quality;bloom.enabled=quality;$('quality-menu').textContent=$('quality-pause').textContent=`QUALITY: ${quality?'HIGH':'PERFORMANCE'}`;resize();}
function toggleSound(){sound.mute(!sound.muted);$('sound-menu').textContent=$('sound-pause').textContent=sound.muted?'SOUND OFF':'SOUND ON';}
$('begin').onclick=()=>start();$('resume').onclick=resume;$('restart').onclick=()=>{checkpoint.powered=checkpoint.hasKey=false;start();};$('exit-menu').onclick=title;$('ending-menu').onclick=title;
$('retry').onclick=()=>{const cp=mode==='dead';if(!cp)checkpoint.powered=checkpoint.hasKey=false;start(cp);};
$('how').onclick=()=>show('instructions',true);$('close-how').onclick=()=>show('instructions',false);
for(const id of ['quality-menu','quality-pause'])$(id).onclick=toggleQuality;
for(const id of ['sound-menu','sound-pause'])$(id).onclick=toggleSound;
$<HTMLInputElement>('sensitivity').oninput=e=>sensitivity=Number((e.target as HTMLInputElement).value);
$<HTMLInputElement>('auto-blink').onchange=e=>autoBlink=(e.target as HTMLInputElement).checked;
canvas.addEventListener('click',()=>{if(mode==='playing'&&!document.pointerLockElement)void lock();});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&mode==='playing')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();lastTime=performance.now();});
window.addEventListener('blur',pause);
window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)&&mode==='playing')e.preventDefault();
  if(e.repeat)return;keys.add(e.code);if(e.code==='Escape'){if(mode==='playing')pause();else if(mode==='paused')resume();}
  if(mode!=='playing')return;if(e.code==='Space')blink();if(e.code==='KeyF'){lightOn=!lightOn;sound.noiseHit(.07,950,.18);}if(e.code==='KeyH')document.body.classList.toggle('clean');
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('mousemove',e=>{
  menuMouse={x:e.clientX/innerWidth-.5,y:e.clientY/innerHeight-.5};
  if(mode!=='playing'||document.pointerLockElement!==canvas)return;
  yaw-=e.movementX*.0018*sensitivity;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0018*sensitivity,-1.35,1.35);
});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
window.addEventListener('resize',resize);
function interaction(dt:number){
  if(!world)return;station=null;camera.getWorldDirection(direction);
  let best=2.1;
  for(const s of world.stations){
    if(s.id==='key'&&hasKey)continue;const delta=s.position.clone().sub(camera.position),d=delta.length();if(d<best&&delta.normalize().dot(direction)>.65){station=s;best=d;}
  }
  show('interaction',!!station);$('reticle').classList.toggle('interactive',!!station);
  if(!station){hold=0;return;}
  const label=$('interaction').querySelector('span')!;
  label.textContent=station.id==='power'&&powered?'POWER RESTORED':station.id==='key'&&!powered?'THE ARCHIVE LOCK NEEDS POWER':station.id==='gate'&&!hasKey?'LOCKED — FIND THE GATE KEY':station.label;
  if(!keys.has('KeyE')){hold=0;$('interact-progress').style.width='0';return;}
  const seconds=station.id==='power'?1.4:station.id==='gate'?2.4:.25;
  if((station.id==='power'&&powered)||(station.id==='key'&&!powered)||(station.id==='gate'&&!hasKey))return;
  hold+=dt;$('interact-progress').style.width=`${Math.min(1,hold/seconds)*100}%`;
  if(hold<seconds)return;hold=0;keys.delete('KeyE');
  if(station.id==='power'){
    powered=true;checkpoint.powered=true;stage=1;angels[0].active=true;grace=3;sound.switch();subtitle('The archive lock released. Somewhere, stone scrapes against stone.',7);$('objective').textContent=objectives[stage];
  }else if(station.id==='key'){
    hasKey=true;checkpoint.hasKey=true;stage=2;station.object.visible=false;angels[1].active=true;grace=2;sound.switch();subtitle('A second set of footsteps. You are not alone on the way back.',7);$('objective').textContent=objectives[stage];
  }else if(station.id==='gate'){
    station.object.position.y=4;sound.gate();finish(true);
  }else{
    readNote=true;subtitle('“They cannot move under your gaze. The power is in the sacristy. The gate key is in the archive. Do not blink.”',11);
  }
}
function update(dt:number){
  elapsed+=dt;grace=Math.max(0,grace-dt);blinkCooldown=Math.max(0,blinkCooldown-dt);
  if(blinkTime>0){blinkTime-=dt;if(blinkTime<=0)$('blink').classList.remove('closed');}
  if(autoBlink&&blinkTime<=0){eye=Math.max(0,eye-dt/20);if(eye<=0)blink();}
  $('eye-meter').style.width=`${eye*100}%`;$('eye-meter').style.background=eye<.2?'#c59c75':'#c0c5b4';$('eye-label').textContent=eye<.2?'NEED TO BLINK':'EYES OPEN';
  const running=keys.has('ShiftLeft')||keys.has('ShiftRight');
  forward.set(-Math.sin(yaw),0,-Math.cos(yaw));right.set(Math.cos(yaw),0,-Math.sin(yaw));direction.set(0,0,0);
  if(keys.has('KeyW')||keys.has('ArrowUp'))direction.add(forward);if(keys.has('KeyS')||keys.has('ArrowDown'))direction.sub(forward);if(keys.has('KeyD')||keys.has('ArrowRight'))direction.add(right);if(keys.has('KeyA')||keys.has('ArrowLeft'))direction.sub(right);
  const moving=direction.lengthSq()>0;
  if(moving){direction.normalize().multiplyScalar(dt*(running?3.65:2.25));const pieces=Math.ceil(direction.length()/.08);direction.divideScalar(pieces);
    const clear=(x:number,z:number)=>canStand(x,z,.23)&&angels.every(a=>Math.hypot(a.group.position.x-x,a.group.position.z-z)>.73);
    for(let i=0;i<pieces;i++){if(clear(player.x+direction.x,player.z))player.x+=direction.x;if(clear(player.x,player.z+direction.z))player.z+=direction.z;}
    walkTime+=dt*(running?11:7);stepTime-=dt;if(stepTime<=0){sound.step(running);stepTime=running?.32:.49;}
  }else stepTime=Math.min(stepTime,.1);
  camera.position.copy(player);camera.position.y=1.68+(moving?Math.sin(walkTime)*.022:Math.sin(elapsed*1.7)*.004);camera.rotation.set(pitch,yaw,moving?Math.sin(walkTime*.5)*.003:0,'YXZ');camera.updateMatrixWorld();
  // The blink starts with an 85 ms closing transition. Keep angels frozen
  // until both opaque lids actually cover the entire rendered viewport.
  let eyesClosed=false;
  if(blinkTime>0){
    const [top,bottom]=Array.from($('blink').children).map(lid=>lid.getBoundingClientRect());
    eyesClosed=top.top<=0&&top.bottom>=innerHeight/2&&bottom.top<=innerHeight/2&&bottom.bottom>=innerHeight;
  }
  let nearest=30;
  for(let i=0;i<angels.length;i++){
    const a=angels[i];if(i===0&&a.seen&&elapsed>14)a.active=true;
    if(i===1&&powered&&!secondIntro&&player.z>0){secondIntro=true;a.active=true;subtitle('There were only two statues at the altar. Where is the other one?',6);}
    const oldX=a.group.position.x,oldZ=a.group.position.z;
    if(grace<=0&&a.update(dt,camera,eyesClosed,sound,hasKey?4.2:3.2)){caught(a);break;}
    if(world&&(a.group.position.x!==oldX||a.group.position.z!==oldZ))world.moon.shadow.needsUpdate=true;
    if(a.active)nearest=Math.min(nearest,a.group.position.distanceTo(player));
  }
  const tension=THREE.MathUtils.clamp(1-nearest/8,0,1);film.uniforms.stress.value=tension;sound.tension(tension);sound.listener(player.x,player.z,forward.x,forward.z);
  if(mode==='playing')interaction(dt);
  $('location').textContent=player.x>8?'THE SACRISTY':player.x< -8?'THE ARCHIVE':player.z< -9?'THE SANCTUARY':'SAINT ORISON’S CHAPEL';
  if(subtitleTimer>0){subtitleTimer-=dt;if(subtitleTimer<=0)$('subtitle').style.opacity='0';}
}
function frame(now:number){
  requestAnimationFrame(frame);const raw=(now-lastTime)/1000;lastTime=now;const dt=Math.min(raw,.05);frameMs=frameMs*.96+Math.min(raw*1000,100)*.04;const t=now*.001;
  if(mode==='playing'&&raw<.4)update(dt);
  if(mode==='caught'){caughtTime-=dt;if(caughtTime<=0)finish(false);}
  if(mode==='menu'){
    camera.position.set(-2.0+menuMouse.x*.10,1.6+menuMouse.y*.04,-5.2);camera.lookAt(-2.0,2.05,-12);film.uniforms.stress.value=0;
  }
  camera.getWorldDirection(forward);flashlight.position.copy(camera.position).add(new THREE.Vector3(.1,-.13,.05));flashlight.target.position.copy(camera.position).addScaledVector(forward,12);flashlight.visible=(mode==='playing'||mode==='caught')&&lightOn;
  fill.position.copy(camera.position);fill.intensity=mode==='menu'?.2:.55;
  if(world)world.update(t,powered);film.uniforms.time.value=t%1000;
  renderer.info.reset();composer.render();
}
requestAnimationFrame(frame);
async function init(){
  try{
    $('loading-bar').style.width='15%';
    world=await makeWorld(scene,label=>{$('begin-label').textContent=label.toUpperCase();});$('loading-bar').style.width='65%';
    $('begin-label').textContent='AWAKENING THE ANGELS';angels=await loadAngels(scene);$('loading-bar').style.width='100%';
    world.moon.shadow.needsUpdate=true;camera.updateMatrixWorld();await renderer.compileAsync(scene,camera);
    ready=true;$<HTMLButtonElement>('begin').disabled=false;$('begin-label').textContent='ENTER THE CHAPEL';
    if(matchMedia('(pointer:coarse)').matches)show('mobile-warning',true);
  }catch(error){console.error(error);$('begin-label').textContent='RELOAD TO TRY AGAIN';$<HTMLButtonElement>('begin').disabled=false;$('begin').onclick=()=>location.reload();notice('An asset could not load. Reload to retry.');}
}
void init();
// Local development instrumentation supports reproducible visibility, collision and completion tests.
if(import.meta.env.DEV){
  (window as any).__game={
    snapshot:()=>({ready,mode,powered,hasKey,stage,readNote,elapsed,blinkCount,eye,player:player.toArray(),yaw,pitch,fps:Math.round(1000/frameMs),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,angels:angels.map(a=>({position:a.group.position.toArray(),active:a.active,observed:a.observed,pose:a.pose,bones:a.bones.map(b=>b.name)}))}),
    teleport:(x:number,z:number,angle=0,p=0)=>{player.set(x,1.68,z);yaw=angle;pitch=p;camera.position.copy(player);camera.rotation.set(p,yaw,0,'YXZ');camera.updateMatrixWorld();},
    start:()=>start(),pause,resume,blink,
    observe:(index:number,active:boolean)=>{angels[index].active=active;},
    getAngels:()=>angels,scene,camera,renderer,THREE,
    setAngel:(index:number,x:number,z:number,active=true)=>{const a=angels[index];a.group.position.set(x,0,z);a.active=active;a.path=[];a.pathTimer=0;},
    setGrace:(v:number)=>grace=v,
    setAutoBlink:(v:boolean)=>autoBlink=v,
    getWorld:()=>world,
    title,
  };
}
