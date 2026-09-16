import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('output',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:4187/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__game?.snapshot().ready,{timeout:90000});
  await page.screenshot({path:'output/title.png'});
  await page.click('#begin');await page.waitForFunction(()=>window.__game.snapshot().mode==='playing');
  await page.evaluate(()=>{window.__game.setAutoBlink(false);window.__game.setGrace(1000);});
  await page.screenshot({path:'output/entrance.png'});
  console.log('Ready',await page.evaluate(()=>window.__game.snapshot()));
  // Freeze under direct observation; move only after a genuine look away.
  await page.evaluate(()=>{window.__game.teleport(0,-2,0,0);window.__game.setAngel(0,0,-7);window.__game.setGrace(0);});
  await page.waitForTimeout(600);
  const frozen=await page.evaluate(()=>window.__game.snapshot().angels[0]);assert.equal(frozen.observed,true);assert.deepEqual(frozen.position,[0,0,-7]);
  await page.keyboard.press('Space');await page.waitForTimeout(650);
  const afterBlink=await page.evaluate(()=>window.__game.snapshot());assert.equal(afterBlink.blinkCount,1);assert(afterBlink.angels[0].position[2]>-7,'Blinking should release the statue');
  await page.evaluate(()=>window.__game.setAngel(0,0,-7));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__game.snapshot().mode==='paused');
  const paused=await page.evaluate(()=>window.__game.snapshot());await page.waitForTimeout(400);const still=await page.evaluate(()=>window.__game.snapshot());assert.equal(still.elapsed,paused.elapsed);assert.deepEqual(still.angels,paused.angels);await page.click('#resume');
  await page.evaluate(()=>{window.__game.teleport(0,-2,Math.PI,0);window.__game.setGrace(0);});await page.waitForTimeout(600);
  const moved=await page.evaluate(()=>window.__game.snapshot().angels[0]);assert(moved.position[2]>-7,'Unobserved angel should approach');
  await page.evaluate(()=>{window.__game.setGrace(1000);window.__game.teleport(0,-5,0,0);window.__game.setAngel(0,0,-8,false);});
  await page.screenshot({path:'output/encounter.png'});
  // Actual keyboard interactions, including their hold durations.
  await page.evaluate(()=>window.__game.teleport(12,-7,-Math.PI/2,-.12));
  await page.waitForTimeout(150);await page.keyboard.down('KeyE');await page.waitForFunction(()=>window.__game.snapshot().powered,{timeout:10000});await page.keyboard.up('KeyE');
  assert.equal(await page.evaluate(()=>window.__game.snapshot().powered),true,'Power interaction');
  await page.evaluate(()=>{window.__game.setGrace(1000);window.__game.teleport(-11.5,7,Math.PI/2,-.35);});
  await page.waitForTimeout(150);await page.keyboard.down('KeyE');await page.waitForFunction(()=>window.__game.snapshot().hasKey,{timeout:10000});await page.keyboard.up('KeyE');
  assert.equal(await page.evaluate(()=>window.__game.snapshot().hasKey),true,'Key interaction');
  // Retry restores the earned checkpoint in the archive, not at the exit.
  await page.evaluate(()=>{window.__game.teleport(0,0,Math.PI,0);window.__game.setAngel(0,0,-.7,true);window.__game.setGrace(0);});
  await page.waitForFunction(()=>window.__game.snapshot().mode==='dead',{timeout:5000});await page.click('#retry');
  const restored=await page.evaluate(()=>window.__game.snapshot());assert(restored.powered&&restored.hasKey);assert(restored.player[0]<-10,'Archive checkpoint position');
  await page.evaluate(()=>{window.__game.setGrace(1000);window.__game.teleport(0,13.9,Math.PI,0);});
  await page.waitForTimeout(150);await page.keyboard.down('KeyE');await page.waitForFunction(()=>window.__game.snapshot().mode==='won',{timeout:10000});await page.keyboard.up('KeyE');
  assert.equal(await page.evaluate(()=>window.__game.snapshot().mode),'won','Game completion');await page.screenshot({path:'output/completion.png'});
  // Starting again through the title must clear the previous run's checkpoint.
  await page.click('#ending-menu');await page.click('#begin');await page.evaluate(()=>{window.__game.setAutoBlink(false);window.__game.teleport(0,0,Math.PI,0);window.__game.setAngel(0,0,-.7,true);window.__game.setGrace(0);});
  await page.waitForFunction(()=>window.__game.snapshot().mode==='dead',{timeout:5000});assert.equal(await page.evaluate(()=>window.__game.snapshot().mode),'dead','Contact must cause failure');await page.screenshot({path:'output/failure.png'});
  await page.click('#retry');const fresh=await page.evaluate(()=>window.__game.snapshot());assert(!fresh.powered&&!fresh.hasKey,'New run must not inherit the previous checkpoint');assert.equal(fresh.player[0],0);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: observation, offscreen movement, power, key, exit, capture; no browser errors.');
}catch(e){await page.screenshot({path:'output/test-failure.png'});console.error('Browser errors',errors);throw e;}finally{await browser.close();}
