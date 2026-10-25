import type {PlayWorld} from './world-art';
type Bus={gain:GainNode;world:PlayWorld;retire:number};
type Voice={osc:OscillatorNode;gain:GainNode;end:number;bus:Bus};
const scores:Record<PlayWorld,{bpm:number;root:number;notes:number[];wave:OscillatorType}>={
 jungle:{bpm:100,root:60,notes:[0,-1,7,9,12,-1,9,7,4,-1,7,-1,2,4,7,-1,0,-1,4,7,9,-1,12,9,7,-1,4,-1,2,7,0,-1],wave:'triangle'},
 depths:{bpm:78,root:62,notes:[0,-1,-1,7,12,-1,9,-1,4,-1,2,-1,7,-1,-1,-1,9,-1,12,-1,7,-1,4,-1,2,-1,4,-1,0,-1,-1,-1],wave:'sine'},
 space:{bpm:108,root:57,notes:[0,7,-1,12,4,-1,9,7,0,-1,14,12,7,-1,4,-1,9,12,-1,16,14,-1,12,7,4,-1,7,2,0,-1,-1,-1],wave:'triangle'}
};
/** Original, entirely local score. No fetch, microphone, worklet or permanent timer. */
export class WorldMusic {
 private context:AudioContext|null=null;private master:GainNode|null=null;private limiter:DynamicsCompressorNode|null=null;
 private buses:Bus[]=[];private current:Bus|null=null;private voices=new Set<Voice>();
 private appliedVolume=-1;
 private world:PlayWorld='jungle';private volume=.3;private running=false;private muted=false;private next=0;private step=0;private accentAt=-10;private disposed=false;
 get enabled(){return this.context?.state==='running';}
 get resourceCounts(){return {voices:this.voices.size,buses:this.buses.length,contexts:this.context?1:0};}
 constructor(private makeContext:()=>AudioContext=()=>new AudioContext()){}
 async enable(){
  if(this.disposed)return false;
  try{if(!this.context){const ctx=this.context=this.makeContext();this.master=ctx.createGain();this.master.gain.value=0;this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=8;this.limiter.ratio.value=4;this.master.connect(this.limiter);this.limiter.connect(ctx.destination);}await this.context.resume();return this.enabled;}catch{return false;}
 }
 configure(world:PlayWorld,volume:number,muted:boolean,running:boolean){
  this.world=world;this.volume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):.3;this.muted=muted;this.running=running;
  if(!running||muted||this.volume===0){this.stop();return;}
  const ctx=this.context;if(!ctx||!this.master)return;
  if(this.appliedVolume!==this.volume){this.master.gain.setTargetAtTime(this.volume*.32,ctx.currentTime,.08);this.appliedVolume=this.volume;}
  if(this.current?.world!==world){
   if(this.current){this.current.gain.gain.cancelScheduledValues(ctx.currentTime);this.current.gain.gain.setTargetAtTime(0,ctx.currentTime,.12);this.current.retire=ctx.currentTime+.65;}
   const bus:Bus={gain:ctx.createGain(),world,retire:Infinity};bus.gain.gain.value=0;bus.gain.connect(this.master);bus.gain.gain.setTargetAtTime(1,ctx.currentTime,.12);this.buses.push(bus);while(this.buses.length>3){const old=this.buses.shift()!;old.gain.disconnect();for(const v of this.voices)if(v.bus===old){try{v.osc.stop();}catch{}v.osc.disconnect();v.gain.disconnect();this.voices.delete(v);}}this.current=bus;this.step=0;this.next=ctx.currentTime+.02;
  }
 }
 private note(note:number,at:number,length:number,level:number,bus:Bus,wave:OscillatorType){
  const ctx=this.context;if(!ctx||this.voices.size>=16)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),voice={osc,gain,end:at+length+.03,bus};
  osc.type=wave;osc.frequency.value=440*2**((note-69)/12);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.018);gain.gain.exponentialRampToValueAtTime(.0001,at+length);gain.gain.setValueAtTime(0,voice.end);
  osc.connect(gain);gain.connect(bus.gain);this.voices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(voice);};osc.start(at);osc.stop(voice.end);
 }
 tick(){
  const ctx=this.context;if(!ctx)return;
  // Prune retired buses even when a theme changes repeatedly or the tab pauses.
  for(const bus of this.buses)if(bus.retire<=ctx.currentTime)bus.gain.disconnect();this.buses=this.buses.filter(b=>b.retire>ctx.currentTime);
  if(!this.enabled||!this.running||this.muted||!this.volume||!this.current)return;
  if(this.next<ctx.currentTime-.15)this.next=ctx.currentTime+.02;
  const score=scores[this.world],stepTime=60/score.bpm/2;
  while(this.next<ctx.currentTime+.15){const n=score.notes[this.step%32];if(n>=0)this.note(score.root+n,this.next,this.world==='depths'?.75:.28,.2,this.current,score.wave);
   if(this.step%4===0)this.note(score.root-24+(this.step%16>=8?7:0),this.next,.4,.12,this.current,'sine');
   this.next+=stepTime;this.step++;
  }
 }
 celebrate(){const ctx=this.context;if(!ctx||!this.current||!this.enabled||!this.running||this.muted||!this.volume||ctx.currentTime-this.accentAt<.4)return;this.accentAt=ctx.currentTime;const bus=this.current;[0,4,7].forEach((n,i)=>this.note(scores[this.world].root+12+n,ctx.currentTime+i*.065,.23,.15,bus,'sine'));}
 stop(){
  const ctx=this.context;if(!ctx||(!this.current&&!this.voices.size&&this.appliedVolume<0))return;this.appliedVolume=-1;
  for(const voice of this.voices){try{voice.osc.stop();}catch{}voice.osc.disconnect();voice.gain.disconnect();}this.voices.clear();
  for(const bus of this.buses)bus.gain.disconnect();this.buses=[];this.current=null;this.next=0;
  if(this.master){this.master.gain.cancelScheduledValues(ctx.currentTime);this.master.gain.setValueAtTime(0,ctx.currentTime);}
 }
 dispose(){this.disposed=true;this.stop();this.master?.disconnect();this.limiter?.disconnect();void this.context?.close();this.context=null;this.master=null;this.limiter=null;}
}
