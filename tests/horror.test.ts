import test from 'node:test';
import assert from 'node:assert/strict';
import { HorrorDirector,candleStrength,type HorrorInput,type Sighting } from '../src/horror.ts';

const angel=(overrides:Partial<Sighting>={}):Sighting=>({x:0,z:-10,pose:0,observed:true,active:true,distance:12,...overrides});
const input=(angels:Sighting[],overrides:Partial<HorrorInput>={}):HorrorInput=>({angels,running:false,inNave:true,powered:false,lightOn:false,...overrides});
function awaken(h:HorrorDirector){h.update(.016,input([angel()]));return h.update(.016,input([angel({z:-8,pose:1,distance:10})]));}

test('proximity alone does not give away an angel or start the heartbeat',()=>{
  const h=new HorrorDirector();
  for(let i=0;i<600;i++)h.update(.05,input([angel({distance:1})]));
  assert.equal(h.aware,false);assert.equal(h.bpm,0);assert.equal(h.fear,0);assert.equal(h.phase,'quiet');
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
    close.update(.05,input([angel({observed:false,distance:.5})],{inNave:false}));
    far.update(.05,input([angel({observed:false,distance:30})],{inNave:false}));
  }
  assert.equal(close.fear,far.fear);
});

test('fear rises quickly on seeing a close threat and recovers gradually',()=>{
  const h=new HorrorDirector();awaken(h);const initial=h.fear;
  for(let i=0;i<20;i++)h.update(.05,input([angel({z:-8,distance:1})],{inNave:false}));
  assert(h.fear>initial+.15);const peak=h.fear;
  h.update(.05,input([],{inNave:false}));assert(h.fear>peak-.01);
  for(let i=0;i<800;i++)h.update(.05,input([],{inNave:false}));
  assert(h.fear<.2);assert(h.bpm<75);
});

test('blackout waits for realization and the nave, then runs only once',()=>{
  const h=new HorrorDirector();awaken(h);const events:string[]=[];
  for(let i=0;i<160;i++)events.push(...h.update(.05,input([],{inNave:false})));
  assert.equal(h.phase,'quiet');assert.equal(events.length,0);
  assert.deepEqual(h.update(.05,input([])),['warning']);assert.equal(h.blackout,0);
  for(let i=0;i<200;i++)events.push(...h.update(.05,input([])));
  assert.equal(h.phase,'dark');assert.equal(h.blackout,1);assert.deepEqual(events,['dark']);
  for(let i=0;i<600;i++)assert.deepEqual(h.update(.05,input([])),[]);
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
