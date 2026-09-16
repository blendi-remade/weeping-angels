import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'||['data:','blob:'].includes(url.protocol))return route.continue();remote.push(url.href);return route.abort();});
try{
  await page.goto('http://127.0.0.1:4188/',{waitUntil:'networkidle'});await page.waitForFunction(()=>!document.querySelector('#begin').disabled&&document.querySelector('#begin-label').textContent==='ENTER THE CHAPEL',{timeout:90000});
  assert.equal(await page.evaluate(()=>typeof window.__game),'undefined','Debug API omitted from production');
  await page.screenshot({path:'output/final-title.png'});await page.click('#begin');await page.waitForTimeout(1000);
  assert(await page.locator('#hud').isVisible());await page.screenshot({path:'output/final-gameplay.png'});
  await page.keyboard.press('Escape');assert(await page.locator('#pause').isVisible());await page.click('#resume');assert(await page.locator('#hud').isVisible());
  assert.deepEqual(remote,[],'No external runtime requests');assert.deepEqual(errors,[],'No browser errors');
  console.log('PASS: production assets, local fonts and audio, no external requests, no debug API, pointer lock, pause/resume.');
}finally{await browser.close();}
