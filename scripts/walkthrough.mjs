import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});
try{
  await page.goto('http://127.0.0.1:4187/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__game?.snapshot().ready,{timeout:90000});await page.click('#begin');
  await page.evaluate(()=>{window.__game.setGrace(1000);window.__game.setAutoBlink(false);});
  for(const [x,z]of [[12,-7],[-11.5,7],[0,13.9]]){
    await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
    const result=await page.evaluate(async({x,z})=>{
      const {pathfind}=await import('/src/navigation.ts');const p=window.__game.snapshot().player;const path=pathfind({x:p[0],z:p[2]},{x,z});if(!path.length)throw new Error('No level route');
      let index=0,lastAdvance=performance.now();const start=performance.now();
      return await new Promise((resolve,reject)=>{
        function frame(){
          const state=window.__game.snapshot();if(state.mode!=='playing'){reject(new Error('Unexpected mode '+state.mode));return;}
          let target=path[index],dx=target.x-state.player[0],dz=target.z-state.player[2];
          if(Math.hypot(dx,dz)<.17){index++;lastAdvance=performance.now();if(index===path.length){resolve({seconds:(performance.now()-start)/1000,position:state.player,steps:path.length});return;}target=path[index];dx=target.x-state.player[0];dz=target.z-state.player[2];}
          if(performance.now()-lastAdvance>5000){reject(new Error('Collision blocked route at '+JSON.stringify({target,player:state.player})));return;}
          window.__game.teleport(state.player[0],state.player[2],Math.atan2(-dx,-dz),0);requestAnimationFrame(frame);
        }requestAnimationFrame(frame);
      });
    },{x,z});
    await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');assert(Math.hypot(result.position[0]-x,result.position[2]-z)<.4);console.log('Walked',x,z,result);
  }
  console.log('PASS: complete navigation loop using actual keyboard movement, no position warps.');
}finally{await browser.close();}
