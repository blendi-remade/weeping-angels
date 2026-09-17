import test from 'node:test';
import assert from 'node:assert/strict';
import { HorrorDirector,candleStrength,shouldAwakenAngel,type HorrorInput,type Sighting,type EncounterProgress } from '../src/horror.ts';

const angel=(overrides:Partial<Sighting>={}):Sighting=>({x:0,z:-10,pose:0,observed:true,active:true,distance:12,...overrides});
const input=(angels:Sighting[],overrides:Partial<HorrorInput>={}):HorrorInput=>({angels,running:false,powered:false,lightOn:false,...overrides});
function awaken(h:HorrorDirector){h.update(.016,input([angel()]));return h.update(.016,input([angel({z:-8,pose:1,distance:10})]));}

test('the second angel awakens during an outage even before visiting the archive',()=>{
  const progress:EncounterProgress={elapsed:24,powered:false,hasKey:false,playerZ:-8,blackoutStarted:false};
  assert.equal(shouldAwakenAngel(1,true,progress),false);
  assert(shouldAwakenAngel(1,true,{...progress,blackoutStarted:true}));
  // It can start stalking in darkness even if the player never noticed it.
  assert(shouldAwakenAngel(1,false,{...progress,blackoutStarted:true}));
});

test('both old progression triggers still wake the second angel, and a fresh game resets them',()=>{
  const fresh:EncounterProgress={elapsed:0,powered:false,hasKey:false,playerZ:13.1,blackoutStarted:false};
  assert.equal(shouldAwakenAngel(1,false,fresh),false);
  assert(shouldAwakenAngel(1,false,{...fresh,powered:true}));
  assert(shouldAwakenAngel(1,false,{...fresh,hasKey:true,playerZ:-12}));
  assert.equal(shouldAwakenAngel(0,true,fresh),false);
  assert.equal(shouldAwakenAngel(0,true,{...fresh,elapsed:2.49}),false);
  assert(shouldAwakenAngel(0,true,{...fresh,elapsed:2.5}));
  assert.equal(shouldAwakenAngel(0,false,{...fresh,elapsed:3}),false);
  assert(shouldAwakenAngel(0,false,{...fresh,blackoutStarted:true}));
});

test('the real blackout progression wakes the second angel after electricity trips',()=>{
  const h=new HorrorDirector();awaken(h);
  for(let i=0;i<145;i++)h.update(.05,input([]));
  const blackoutStarted=h.phase!=='quiet';
  assert.equal(h.phase,'warning');
  assert(shouldAwakenAngel(1,false,{elapsed:20,powered:false,hasKey:false,playerZ:-5,blackoutStarted}));
});

test('proximity alone does not give away an angel or start the heartbeat',()=>{
  const h=new HorrorDirector();
  for(let i=0;i<600;i++)h.update(.05,input([angel({distance:1})]));
  assert.equal(h.aware,false);assert.equal(h.bpm,0);assert.equal(h.fear,0);assert.equal(h.phase,'dark');
});

test('the first witnessed change triggers realization once',()=>{
  const h=new HorrorDirector();h.update(.016,input([angel()]));
  assert.deepEqual(h.update(.016,input([angel({z:-8,observed:false})])),[]);
  assert.equal(h.aware,false);
  assert.deepEqual(h.update(.016,input([angel({z:-8})])),['realization']);
  assert(h.bpm>58);assert(h.fear>0);
  assert.deepEqual(h.update(.016,input([angel({z:-6,pose:2})])),[]);
});

test('a changed pose also reveals the threat',()=>{
  const h=new HorrorDirector();h.update(.016,input([angel()]));
  assert.deepEqual(h.update(.016,input([angel({pose:1})])),['realization']);
});

test('unseen proximity cannot act as a heartbeat radar through walls',()=>{
  const close=new HorrorDirector(),far=new HorrorDirector();awaken(close);awaken(far);
  for(let i=0;i<60;i++){
    close.update(.05,input([angel({observed:false,distance:.5})]));
    far.update(.05,input([angel({observed:false,distance:30})]));
  }
  assert.equal(close.fear,far.fear);
});

test('fear rises quickly on seeing a close threat and recovers gradually',()=>{
  const h=new HorrorDirector();awaken(h);const initial=h.fear;
  for(let i=0;i<20;i++)h.update(.05,input([angel({z:-8,distance:1})]));
  assert(h.fear>initial+.15);const peak=h.fear;
  h.update(.05,input([]));assert(h.fear>peak-.01);
  for(let i=0;i<800;i++)h.update(.05,input([],{powered:true,lightOn:true}));
  assert(h.fear<.2);assert(h.bpm<75);
});

test('opening stays lit, warns at 7 seconds and reaches full darkness at 10 without requiring recognition',()=>{
  const h=new HorrorDirector();
  assert.deepEqual(h.update(6.9,input([])),[]);assert.equal(h.phase,'quiet');assert.equal(h.blackout,0);
  assert.deepEqual(h.update(.1,input([])),['warning']);assert.equal(h.blackout,0);
  assert.deepEqual(h.update(1,input([])),[]);assert.equal(h.phase,'snuffing');assert.equal(h.blackout,0);
  h.update(1,input([]));assert.equal(h.blackout,.5);
  assert.deepEqual(h.update(1,input([])),['dark']);assert.equal(h.blackout,1);
  assert.equal(h.aware,false);assert.equal(h.bpm,0);
  for(let i=0;i<600;i++)assert.deepEqual(h.update(.05,input([],{powered:true})),[]);
});

test('blackout timing is consistent across frame rates and recognition or power states',()=>{
  for(const fps of [20,30,60,144])for(const powered of [false,true]){
    const h=new HorrorDirector(),events:{event:string;time:number}[]=[];
    if(powered)awaken(h);
    const offset=powered?.032:0;
    for(let i=1;i<=11*fps;i++)for(const event of h.update(1/fps,input([],{powered})))events.push({event,time:i/fps+offset});
    assert.deepEqual(events.map(e=>e.event),['warning','dark']);
    assert(Math.abs(events[0].time-7)<=1/fps+.00001);
    assert(Math.abs(events[1].time-10)<=1/fps+.00001);
  }
});

test('paused time does not advance the opening and a fresh run restarts its clock',()=>{
  const h=new HorrorDirector();h.update(9,input([]));const progress=h.blackout;
  for(let i=0;i<600;i++)assert.deepEqual(h.update(0,input([])),[]);
  assert.equal(h.blackout,progress);
  h.reset();h.update(6.9,input([]));assert.equal(h.phase,'quiet');assert.equal(h.blackout,0);
  assert.deepEqual(h.update(.1,input([])),['warning']);
});

test('candles extinguish from the altar to the entrance and never relight mid-wave',()=>{
  assert.equal(candleStrength(-14,0),1);assert.equal(candleStrength(12,0),1);
  assert.equal(candleStrength(-14,.3),0);assert.equal(candleStrength(12,.3),1);
  for(const z of [-14,-7,0,7,12]){
    let previous=1;
    for(let p=0;p<=1;p+=.01){const next=candleStrength(z,p);assert(next<=previous);assert(next>=0&&next<=1);previous=next;}
    assert.equal(candleStrength(z,1),0);
  }
});

test('checkpoint retry stays dark; a new game restores the whole sequence',()=>{
  const h=new HorrorDirector();h.reset(true);assert.equal(h.blackout,1);assert(h.aware);
  assert.deepEqual(h.update(.05,input([])),[]);
  h.reset();assert.equal(h.blackout,0);assert.equal(h.bpm,0);assert.equal(h.fear,0);
  assert.deepEqual(awaken(h),['realization']);
});
