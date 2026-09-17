export type Sighting={x:number;z:number;pose:number;observed:boolean;active:boolean;distance:number};
export type HorrorInput={angels:readonly Sighting[];running:boolean;inNave:boolean;powered:boolean;lightOn:boolean};
export type HorrorEvent='realization'|'warning'|'dark';
export type BlackoutPhase='quiet'|'warning'|'snuffing'|'dark';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};

/** Shared by the flame shader, candle lights and their spatial extinguish cues. */
export function candleStrength(z:number,progress:number){
  const threshold=.08+clamp((z+14)/26)*.68;
  return 1-smooth((progress-threshold)/.16);
}

/** Player knowledge and encounter pacing, independent of rendering/audio clocks. */
export class HorrorDirector {
  aware=false;fear=0;phase:BlackoutPhase='quiet';phaseTime=0;awarenessTime=0;
  private sightings=new Map<number,{x:number;z:number;pose:number}>();
  private memory=0;
  reset(checkpoint=false){
    this.aware=checkpoint;this.fear=checkpoint?.25:0;this.phase=checkpoint?'dark':'quiet';
    this.phaseTime=0;this.awarenessTime=0;this.memory=0;this.sightings.clear();
  }
  get blackout(){return this.phase==='dark'?1:this.phase==='snuffing'?clamp(this.phaseTime/4.8):0;}
  get bpm(){return this.aware?Math.round(58+this.fear*78):0;}
  update(dt:number,input:HorrorInput):HorrorEvent[]{
    const events:HorrorEvent[]=[];
    let seenThreat=0;
    input.angels.forEach((angel,index)=>{
      if(!angel.observed)return;
      const previous=this.sightings.get(index);
      if(previous&&(Math.hypot(angel.x-previous.x,angel.z-previous.z)>.28||angel.pose!==previous.pose)){
        if(!this.aware){this.aware=true;events.push('realization');this.fear=Math.max(this.fear,.34);}
        this.memory=Math.max(this.memory,clamp(1-angel.distance/16));
      }
      this.sightings.set(index,{x:angel.x,z:angel.z,pose:angel.pose});
      if(angel.active)seenThreat=Math.max(seenThreat,clamp(1-angel.distance/12));
    });
    if(this.aware){
      this.awarenessTime+=dt;
      // Memory persists after looking away; hidden enemies are not a proximity radar.
      this.memory=Math.max(seenThreat,this.memory-dt*.045);
      const darkness=this.blackout*(input.lightOn?.08:.23);
      const target=clamp(.12+this.memory*.7+darkness+(input.running?.1:0)-(input.powered?.04:0));
      this.fear+=(target-this.fear)*(1-Math.exp(-dt/(target>this.fear?.65:7)));
    }
    if(this.phase==='quiet'&&this.aware&&this.awarenessTime>4&&input.inNave){
      this.phase='warning';this.phaseTime=0;events.push('warning');
    }else if(this.phase!=='quiet'){
      this.phaseTime+=dt;
      if(this.phase==='warning'&&this.phaseTime>=2.4){this.phase='snuffing';this.phaseTime=0;}
      else if(this.phase==='snuffing'&&this.phaseTime>=4.8){this.phase='dark';this.phaseTime=0;events.push('dark');}
    }
    return events;
  }
}
