import { random } from './world';
export class Soundscape {
  ctx:AudioContext|null=null;master:GainNode|null=null;reverb:ConvolverNode|null=null;muted=false;
  private noise:AudioBuffer|null=null;private drone:GainNode|null=null;private clips=new Map<string,AudioBuffer>();
  start(){
    if(this.ctx){void this.ctx.resume();return;}
    const c=this.ctx=new AudioContext();const rng=random(231);this.master=c.createGain();this.master.gain.value=this.muted?0:.7;this.master.connect(c.destination);
    const impulse=c.createBuffer(2,c.sampleRate*3.5,c.sampleRate);
    for(let k=0;k<2;k++){const data=impulse.getChannelData(k);for(let i=0;i<data.length;i++)data[i]=(rng()*2-1)*Math.pow(1-i/data.length,3.5);}
    this.reverb=c.createConvolver();this.reverb.buffer=impulse;const wet=c.createGain();wet.gain.value=.27;this.reverb.connect(wet);wet.connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate*4,c.sampleRate);const data=this.noise.getChannelData(0);let last=0;
    for(let i=0;i<data.length;i++){const white=rng()*2-1;last=(last+white*.02)/1.02;data[i]=last*3.5;}
    const rain=c.createBufferSource();rain.buffer=this.noise;rain.loop=true;const filter=c.createBiquadFilter();filter.type='highpass';filter.frequency.value=650;const gain=c.createGain();gain.gain.value=.23;rain.connect(filter);filter.connect(gain);gain.connect(this.master);rain.start();
    this.drone=c.createGain();this.drone.gain.value=.018;this.drone.connect(this.master);
    for(const f of [55,82.42,110.1]){const o=c.createOscillator();o.type='sine';o.frequency.value=f;o.connect(this.drone);o.start();}
    void Promise.all(['chapel-ambience','stone-scrape','iron-gate'].map(async name=>{
      try{const r=await fetch(`/assets/${name}.mp3`);if(!r.ok)return;const clip=await c.decodeAudioData(await r.arrayBuffer());this.clips.set(name,clip);
        if(name==='chapel-ambience'){const source=c.createBufferSource();source.buffer=clip;source.loop=true;const level=c.createGain();level.gain.value=.24;source.connect(level);level.connect(this.master!);source.start();gain.gain.setTargetAtTime(.055,c.currentTime,.8);}
      }catch{/* Procedural ambience stays available if an optional clip fails. */}
    }));
  }
  mute(v:boolean){this.muted=v;if(this.ctx&&this.master)this.master.gain.setTargetAtTime(v?0:.7,this.ctx.currentTime,.08);}
  pause(){if(this.ctx)void this.ctx.suspend();}
  tension(value:number){if(this.ctx&&this.drone)this.drone.gain.setTargetAtTime(.016+value*.045,this.ctx.currentTime,.4);}
  listener(x:number,z:number,dx:number,dz:number){if(!this.ctx)return;const l=this.ctx.listener;l.positionX.value=x;l.positionY.value=1.65;l.positionZ.value=z;l.forwardX.value=dx;l.forwardY.value=0;l.forwardZ.value=dz;l.upY.value=1;}
  noiseHit(duration:number,frequency:number,volume:number,x?:number,z?:number){
    if(!this.ctx||!this.noise||!this.master)return;const c=this.ctx,t=c.currentTime;
    const source=c.createBufferSource();source.buffer=this.noise;const filter=c.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.6;
    const gain=c.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);
    if(x!==undefined&&z!==undefined){const p=c.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=2;p.rolloffFactor=.6;p.positionX.value=x;p.positionY.value=.5;p.positionZ.value=z;gain.connect(p);p.connect(this.master);if(this.reverb)p.connect(this.reverb);}else{gain.connect(this.master);if(this.reverb)gain.connect(this.reverb);}
    source.start(t);source.stop(t+duration+.05);
  }
  tone(f:number,duration:number,volume:number,end=f){
    if(!this.ctx||!this.master)return;const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);if(this.reverb)g.connect(this.reverb);o.start();o.stop(t+duration+.1);
  }
  step(run=false){this.noiseHit(.14,180,run?.65:.4);this.tone(74,.12,run?.09:.055,35);}
  clip(name:string,volume:number,x?:number,z?:number){
    const buffer=this.clips.get(name);if(!this.ctx||!this.master||!buffer)return false;const c=this.ctx,source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;gain.gain.value=volume;source.connect(gain);
    if(x!==undefined&&z!==undefined){const p=c.createPanner();p.panningModel='HRTF';p.refDistance=2;p.rolloffFactor=.7;p.positionX.value=x;p.positionY.value=.8;p.positionZ.value=z;gain.connect(p);p.connect(this.master);if(this.reverb)p.connect(this.reverb);}else{gain.connect(this.master);if(this.reverb)gain.connect(this.reverb);}
    source.start();return true;
  }
  scrape(x:number,z:number){if(!this.clip('stone-scrape',.35,x,z))this.noiseHit(.65,550,.42,x,z);}
  gate(){if(!this.clip('iron-gate',.55))this.switch();}
  blink(){this.noiseHit(.1,1400,.08);}
  switch(){this.noiseHit(.18,850,.65);this.tone(110,.8,.07,55);}
  reveal(){this.tone(48,1.8,.16,39);this.tone(147,1.5,.065,94);this.noiseHit(.7,1600,.12);}
  death(){this.noiseHit(1.3,900,.7);this.tone(150,2,.23,26);}
  complete(){for(const [i,f]of [110,164.81,220,277.18].entries())setTimeout(()=>this.tone(f,4,.025),i*200);}
}
