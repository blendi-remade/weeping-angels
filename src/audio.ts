import { random,segmentBlocked } from './world';
import { Vector3 } from 'three';

export const SOUND_ASSETS=['chapel-ambience','stone-scrape','iron-gate','breath-calm','breath-strained','stone-shift-a','stone-shift-b','candle-snuff','flashlight-draw'];
export type AudioMood={fear:number;aware:boolean;blackout:number;running:boolean};

/** Two soft, asymmetric chest impacts, felt more than heard. */
export function heartbeat(c:BaseAudioContext,destination:AudioNode,time:number,fear:number){
  for(const [delay,weight,length]of [[0,1,.17],[.16-fear*.055,.58,.13]]){
    const t=time+delay,o=c.createOscillator(),g=c.createGain(),filter=c.createBiquadFilter();
    o.frequency.setValueAtTime(63+fear*13,t);o.frequency.exponentialRampToValueAtTime(31+fear*5,t+length);
    filter.type='lowpass';filter.frequency.value=155+fear*70;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime((.105+fear*.13)*weight,t+.014);g.gain.exponentialRampToValueAtTime(.0001,t+length);
    o.connect(filter);filter.connect(g);g.connect(destination);o.start(t);o.stop(t+length+.02);
    o.onended=()=>{o.disconnect();filter.disconnect();g.disconnect();};
  }
}

export class Soundscape {
  ctx:AudioContext|null=null;master:GainNode|null=null;reverb:ConvolverNode|null=null;muted=false;
  private meter:AnalyserNode|null=null;private limiter:DynamicsCompressorNode|null=null;
  private noise:AudioBuffer|null=null;private drone:GainNode|null=null;private ambience:GainNode|null=null;
  private airFilter:BiquadFilterNode|null=null;private body:GainNode|null=null;private calm:GainNode|null=null;private strained:GainNode|null=null;
  private clips=new Map<string,AudioBuffer>();private downloads=new Map<string,ArrayBuffer>();private loading:Promise<void>|null=null;
  private loops=new Set<string>();private sources=new Set<AudioScheduledSourceNode>();
  private scraping=new Map<number,{source:AudioBufferSourceNode;gain:GainNode}>();
  private rng=random(718);private nextBeat=0;private nextBreath=0;private lastReveal=-100;private variant=0;
  private position=new Vector3();private mood:AudioMood={fear:0,aware:false,blackout:0,running:false};private heartbeatCount=0;
  preload(){
    if(!this.loading)this.loading=Promise.all(SOUND_ASSETS.map(async name=>{
      try{const r=await fetch(`/assets/${name}.mp3`);if(r.ok)this.downloads.set(name,await r.arrayBuffer());}catch{/* Synthesis remains available offline. */}
    })).then(()=>{});return this.loading;
  }
  start(){
    if(this.ctx){void this.ctx.resume();return;}
    const c=this.ctx=new AudioContext(),rng=random(231),limiter=this.limiter=c.createDynamicsCompressor();
    this.meter=c.createAnalyser();this.meter.fftSize=1024;this.meter.connect(c.destination);
    limiter.threshold.value=-12;limiter.knee.value=15;limiter.ratio.value=5;limiter.attack.value=.004;limiter.release.value=.24;limiter.connect(this.meter);
    this.master=c.createGain();this.master.gain.value=this.muted?0:.72;this.master.connect(limiter);
    this.body=c.createGain();this.body.connect(this.master);this.ambience=c.createGain();this.ambience.gain.value=1;
    this.airFilter=c.createBiquadFilter();this.airFilter.type='lowpass';this.airFilter.frequency.value=6500;this.ambience.connect(this.airFilter);this.airFilter.connect(this.master);
    const impulse=c.createBuffer(2,Math.floor(c.sampleRate*3.8),c.sampleRate);
    for(let k=0;k<2;k++){const data=impulse.getChannelData(k);let smooth=0;for(let i=0;i<data.length;i++){smooth=smooth*.62+(rng()*2-1)*.38;data[i]=smooth*Math.pow(1-i/data.length,3)*(i>c.sampleRate*.025?1:.12);}}
    this.reverb=c.createConvolver();this.reverb.buffer=impulse;const wet=c.createGain();wet.gain.value=.24;this.reverb.connect(wet);wet.connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate*4,c.sampleRate);const data=this.noise.getChannelData(0);let last=0;
    for(let i=0;i<data.length;i++){last=(last+(rng()*2-1)*.055)/1.055;data[i]=last*3.1;}
    const rain=c.createBufferSource(),filter=c.createBiquadFilter(),rainGain=c.createGain();rain.buffer=this.noise;rain.loop=true;filter.type='highpass';filter.frequency.value=800;rainGain.gain.value=.11;
    rain.connect(filter);filter.connect(rainGain);rainGain.connect(this.ambience);rain.start();
    this.drone=c.createGain();this.drone.gain.value=.009;this.drone.connect(this.master);
    for(const f of [35.7,53.6,71.65]){const o=c.createOscillator();o.frequency.value=f;o.connect(this.drone);o.start();}
    this.calm=c.createGain();this.calm.gain.value=.015;this.calm.connect(this.body);this.strained=c.createGain();this.strained.gain.value=0;this.strained.connect(this.body);
    void this.preload().then(async()=>{
      await Promise.all([...this.downloads].map(async([name,bytes])=>{
        try{
          const buffer=await c.decodeAudioData(bytes.slice(0));let peak=0,sum=0,count=0;
          for(let ch=0;ch<buffer.numberOfChannels;ch++)for(const v of buffer.getChannelData(ch)){peak=Math.max(peak,Math.abs(v));sum+=v*v;count++;}
          const gain=Math.min(32,.14/Math.max(.001,Math.sqrt(sum/count)),.92/Math.max(.001,peak));
          for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]*=gain;}
          this.clips.set(name,buffer);
          if(name==='chapel-ambience'){this.loop(name,this.ambience!,.4);rainGain.gain.setTargetAtTime(.025,c.currentTime,1);}
          if(name==='breath-calm')this.loop(name,this.calm!,1);if(name==='breath-strained')this.loop(name,this.strained!,1);
        }catch{/* Keep synthesis if a recording cannot decode. */}
      }));this.downloads.clear();
    });
  }
  private loop(name:string,destination:AudioNode,level:number){
    if(!this.ctx||this.loops.has(name))return;const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    source.buffer=this.clips.get(name)!;source.loop=true;gain.gain.value=level;source.connect(gain);gain.connect(destination);source.start();this.loops.add(name);
  }
  mute(value:boolean){this.muted=value;if(this.ctx&&this.master)this.master.gain.setTargetAtTime(value?0:.72,this.ctx.currentTime,.06);}
  pause(){if(this.ctx)void this.ctx.suspend();}
  reset(){
    this.mood={fear:0,aware:false,blackout:0,running:false};this.nextBeat=0;this.nextBreath=0;this.lastReveal=-100;this.heartbeatCount=0;
    for(const source of this.sources){try{source.stop();}catch{/* Already ended. */}}this.sources.clear();this.scraping.clear();
    if(this.ctx){const t=this.ctx.currentTime;this.body?.gain.setValueAtTime(1,t);this.calm?.gain.setTargetAtTime(.015,t,.15);this.strained?.gain.setTargetAtTime(0,t,.15);this.ambience?.gain.setTargetAtTime(1,t,.3);this.airFilter?.frequency.setTargetAtTime(6500,t,.3);this.drone?.gain.setTargetAtTime(.009,t,.3);}
  }
  update(mood:AudioMood){
    this.mood=mood;const c=this.ctx;if(!c||c.state!=='running')return;const t=c.currentTime,f=mood.fear;
    this.body!.gain.setTargetAtTime(1,t,.1);this.drone!.gain.setTargetAtTime(.009+(mood.aware?f*.017:0),t,.7);
    this.ambience!.gain.setTargetAtTime(1-mood.blackout*.62,t,.65);this.airFilter!.frequency.setTargetAtTime(6500-mood.blackout*4400,t,.8);
    this.calm!.gain.setTargetAtTime(mood.aware?.09*(1-f):.015,t,1.2);this.strained!.gain.setTargetAtTime(mood.aware?Math.pow(f,1.5)*.24:0,t,.65);
    if(mood.aware&&t>=this.nextBeat){heartbeat(c,this.body!,t+.025,f);this.heartbeatCount++;this.nextBeat=t+60/(58+f*78)+(this.rng()-.5)*.024;}
    if(!this.loops.has('breath-calm')&&t>=this.nextBreath){this.breath(f,mood.aware);this.nextBreath=t+(mood.aware?4.7-f*2.6:5.4);}
  }
  end(){if(!this.ctx)return;const t=this.ctx.currentTime;this.body?.gain.setTargetAtTime(0,t,.2);this.drone?.gain.setTargetAtTime(.007,t,.5);for(const id of this.scraping.keys())this.stopScrape(id);}
  listener(x:number,z:number,dx:number,dz:number){
    this.position.set(x,1.68,z);if(!this.ctx)return;const l=this.ctx.listener;
    l.positionX.value=x;l.positionY.value=1.68;l.positionZ.value=z;l.forwardX.value=dx;l.forwardY.value=0;l.forwardZ.value=dz;l.upY.value=1;
  }
  private route(gain:GainNode,x?:number,z?:number,y=.6){
    const c=this.ctx!,nodes:AudioNode[]=[gain];
    if(x!==undefined&&z!==undefined){
      const p=c.createPanner(),filter=c.createBiquadFilter();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=2;p.maxDistance=26;p.rolloffFactor=1.1;
      p.positionX.value=x;p.positionY.value=y;p.positionZ.value=z;filter.type='lowpass';filter.frequency.value=segmentBlocked(this.position,new Vector3(x,y,z))?1100:7200;
      gain.connect(filter);filter.connect(p);p.connect(this.master!);if(this.reverb)p.connect(this.reverb);nodes.push(filter,p);
    }else gain.connect(this.master!);return ()=>nodes.forEach(node=>node.disconnect());
  }
  noiseHit(duration:number,frequency:number,volume:number,x?:number,z?:number){
    if(!this.ctx||!this.noise||!this.master)return;const c=this.ctx,t=c.currentTime,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noise;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.65;
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);const cleanup=this.route(gain,x,z);this.sources.add(source);source.start(t,this.rng()*2);source.stop(t+duration+.04);
    source.onended=()=>{this.sources.delete(source);source.disconnect();filter.disconnect();cleanup();};
  }
  private breath(fear:number,aware:boolean){
    if(!this.ctx||!this.noise||!this.body)return;const c=this.ctx,t=c.currentTime,duration=aware?2.9-fear*1.5:3.4;
    for(const [delay,frequency,weight]of [[0,650,1],[duration*.49,1050,.68]]){
      const s=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;filter.type='bandpass';filter.frequency.value=frequency+fear*300;filter.Q.value=.8;
      const begin=t+delay,volume=(aware?.05+fear*.12:.014)*weight,length=duration*.43;
      g.gain.setValueAtTime(.0001,begin);g.gain.exponentialRampToValueAtTime(volume,begin+length*.4);g.gain.exponentialRampToValueAtTime(.0001,begin+length);
      s.connect(filter);filter.connect(g);g.connect(this.body);s.start(begin,this.rng());s.stop(begin+length+.03);this.sources.add(s);
      s.onended=()=>{this.sources.delete(s);s.disconnect();filter.disconnect();g.disconnect();};
    }
  }
  tone(frequency:number,duration:number,volume:number,end=frequency){
    if(!this.ctx||!this.master)return;const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(this.master);if(this.reverb)g.connect(this.reverb);o.start();o.stop(t+duration+.05);this.sources.add(o);o.onended=()=>{this.sources.delete(o);o.disconnect();g.disconnect();};
  }
  clip(name:string,volume:number,x?:number,z?:number,rate=1,id?:number){
    const buffer=this.clips.get(name);if(!this.ctx||!this.master||!buffer)return false;const c=this.ctx,source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;source.playbackRate.value=rate;
    gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(volume,c.currentTime+.018);source.connect(gain);const cleanup=this.route(gain,x,z);this.sources.add(source);
    if(id!==undefined){this.stopScrape(id);this.scraping.set(id,{source,gain});}
    source.onended=()=>{this.sources.delete(source);if(id!==undefined&&this.scraping.get(id)?.source===source)this.scraping.delete(id);source.disconnect();cleanup();};source.start();return true;
  }
  stopScrape(id:number){const voice=this.scraping.get(id);if(!voice||!this.ctx)return;const t=this.ctx.currentTime;voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setTargetAtTime(0,t,.022);voice.source.stop(t+.12);this.scraping.delete(id);}
  scrape(x:number,z:number,id=0){const name=(this.variant++%2)?'stone-shift-a':'stone-shift-b',rate=.9+this.rng()*.19;if(!this.clip(name,.65,x,z,rate,id)&&!this.clip('stone-scrape',.48,x,z,rate,id))this.noiseHit(.5,360,.35,x,z);}
  step(run=false){this.noiseHit(.13,170+this.rng()*80,run?.32:.2);this.tone(69+this.rng()*7,.1,run?.055:.032,34);}
  gate(){if(!this.clip('iron-gate',.65))this.switch();}
  blink(){this.noiseHit(.085,1200,.025);}
  switch(){this.noiseHit(.13,850,.32);this.tone(95,.55,.045,49);}
  flashlight(first:boolean){if(!first||!this.clip('flashlight-draw',.5))this.noiseHit(first?.38:.06,first?1800:950,first?.15:.14);}
  snuff(x:number,z:number){if(!this.clip('candle-snuff',.38,x,z,.92+this.rng()*.16))this.noiseHit(.48,2600,.12,x,z);}
  warning(){this.noiseHit(2.1,270,.16);this.tone(39,3,.07,31);}
  realize(){this.tone(52,2.8,.09,41);this.noiseHit(.38,750,.075);}
  reveal(){if(!this.ctx||this.ctx.currentTime-this.lastReveal<8)return;this.lastReveal=this.ctx.currentTime;this.tone(46,1.5,.07,37);}
  death(){this.end();this.noiseHit(.85,560,.48);this.tone(105,1.6,.17,25);}
  complete(){this.end();this.tone(110,4,.025);this.tone(164.81,4,.018);this.tone(220,4,.012);}
  snapshot(){
    let peak=0,sum=0;const samples=new Float32Array(1024);this.meter?.getFloatTimeDomainData(samples);
    for(const v of samples){peak=Math.max(peak,Math.abs(v));sum+=v*v;}
    return {ready:!!this.ctx,state:this.ctx?.state,clips:[...this.clips.keys()],activeVoices:this.sources.size,heartbeatCount:this.heartbeatCount,bpm:this.mood.aware?Math.round(58+78*this.mood.fear):0,muted:this.muted,peak,rms:Math.sqrt(sum/samples.length),reductionDb:this.limiter?.reduction??0};
  }
}
