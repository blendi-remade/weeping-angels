import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:900}});
await page.goto('http://127.0.0.1:4187/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__game?.snapshot().ready,{timeout:90000});
const gpu=await page.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable';});
for(const quality of ['high','performance']){
  if(quality==='performance')await page.click('#quality-menu');
  await page.waitForTimeout(1000);
  const times=await page.evaluate(()=>new Promise(resolve=>{const frames=[];let last=performance.now();function step(now){frames.push(now-last);last=now;if(frames.length<100)requestAnimationFrame(step);else resolve(frames);}requestAnimationFrame(step);}));
  times.sort((a,b)=>a-b);console.log(JSON.stringify({quality,gpu,medianMs:times[50],p95Ms:times[95],snapshot:await page.evaluate(()=>window.__game.snapshot())}));
  await page.screenshot({path:`output/optimized-${quality}.png`});
}
await browser.close();
