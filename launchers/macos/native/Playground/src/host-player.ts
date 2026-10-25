import type {HostState,HostMessage,HostResult} from './types';

type Hooks = {
  send:(message:unknown)=>boolean;
  capture:()=>string|{image:string;ageMs:number}[]|undefined;
  play:(result:HostResult,volume:number,muted:boolean)=>Promise<boolean>;
  stopAudio:()=>void;
  audioTimings?:()=>{firstAudioMs?:number;speechMs?:number};
  flourish?:()=>void;
};

/** Explicitly started Auto observes fresh frames; only one remark can own playback. */
export class HostPerformer {
  caption=''; speaking=false; notice='Choose a session in the control room.';
  private host:HostState|undefined;
  private enabled=false;
  private pending=''; private pendingAt=0; private pendingPeople=0; private dryTurns=0; private generation=0; private serial=0;
  private lastRequest=-Infinity; private nextComment=Infinity;
  private waitingArrival=false; private waitingChange=false; private blocked=false;
  private absentSince:number|null=null;
  private warmupAt:number|null=null; private visualPresenceUntil=-Infinity; private changeAt=-Infinity;
  private seenCues=new Set<string>();
  private volume=.8; private muted=false;
  private clock=0;private playbackUntil=0;
  private delayedCue:{message:Extract<HostMessage,{type:'host-cue'}>;at:number}|null=null;
  private challenge:{id:string;kind:'wave'|'pose';until:number;neutral:boolean;raisedAt:number|null;responding:boolean}|null=null;
  constructor(private hooks:Hooks){}
  get thinking(){return !!this.pending;}
  get busy(){return !!this.pending||this.speaking||!!this.delayedCue;}
  configure(host:HostState|undefined,enabled:boolean,volume:number,muted:boolean){
    const changed=host?.sessionId!==this.host?.sessionId;
    const activating=enabled&&!this.enabled;
    if(changed||!enabled||!host?.active||host.phase==='error')this.cancel();
    if(changed){if(!host?.continuation)this.lastRequest=-Infinity;this.blocked=false;this.nextComment=Infinity;this.warmupAt=null;this.seenCues.clear();}
    if(changed&&host?.continuation)this.nextComment=this.clock+800;
    if(muted&&!this.muted){this.hooks.stopAudio();this.speaking=false;if(this.challenge){this.hooks.send({type:'host-challenge-ended',sessionId:host?.sessionId,challengeId:this.challenge.id});this.challenge=null;}}
    this.host=host;this.enabled=enabled;this.volume=volume;this.muted=muted;
    if(!host?.active)this.notice=host?.message||'Choose a session in the control room.';
    else if((changed||activating)&&!this.busy)this.notice=host.controlMode==='operator'?'Operator mode · press Speak in the control room':host.provider==='mock'?'Auto rehearsal · no images sent':'Auto AI on · fresh images sent to OpenAI';
  }
  cancel(){this.playbackUntil=0;this.generation++;this.delayedCue=null;this.challenge=null;this.pending='';this.caption='';this.speaking=false;this.nextComment=Infinity;this.waitingArrival=false;this.waitingChange=false;this.absentSince=null;this.visualPresenceUntil=-Infinity;this.hooks.stopAudio();}
  cue(message:Extract<HostMessage,{type:'host-cue'}>,people:number,now:number){
    if(!this.host?.active||message.sessionId!==this.host.sessionId||!message.cueId||this.seenCues.has(message.cueId))return false;
    this.seenCues.add(message.cueId);if(this.seenCues.size>128)this.seenCues.delete(this.seenCues.values().next().value!);
    if(message.delayMs&&message.delayMs>0){this.delayedCue={message,at:now+Math.min(3000,message.delayMs)};this.notice='Performance cue ready · allowing a short beat.';return true;}
    const sent=this.request('speak',people,now,message.cueId);
    if(!sent)this.hooks.send({type:'host-idle',sessionId:message.sessionId,cueId:message.cueId});
    return sent;
  }
  request(reason:'arrival'|'change'|'speak'|'comment'|'challenge-response',people:number,now:number,cueId?:string){
    if(!this.enabled||!this.host?.active||this.host.phase==='error'||this.busy)return false;
    if(this.host.quiet)return false;
    if(reason==='challenge-response'?!this.challenge:(reason==='speak'?!cueId:(this.host.controlMode!=='auto'||this.host.phase!=='ready')))return false;
    if((reason!=='speak'&&now<this.playbackUntil)||now-this.lastRequest<3000){this.notice='Give the oracle a moment between remarks.';return false;}
    const requestId=`host-${++this.serial}`;
    // Capturing is gated here as well as on the server. Mock mode never reads a frame.
    const image=this.host.provider==='openai'?this.hooks.capture():undefined;
    if(this.host.provider==='openai'&&!image){this.notice='Waiting for a fresh camera image. Start camera in the control room.';return false;}
    this.pending=requestId;this.pendingAt=now;this.pendingPeople=people;this.lastRequest=now;
    this.notice=this.host.provider==='mock'?'Preparing a little mischief…':'The oracle is pondering…';
    if(!this.hooks.send({type:'host-observe',sessionId:this.host.sessionId,requestId,...(cueId?{cueId}:{}),...(reason==='challenge-response'&&this.challenge?{challengeId:this.challenge.id,gesture:this.challenge.kind}:{}),people:Math.min(3,Math.max(0,people)),reason,...(Array.isArray(image)?{frames:image}:image?{image}:{})})){
      this.pending='';this.notice='Local connection lost. Restart the session when connected.';return false;
    }
    this.nextComment=this.host.controlMode==='auto'?now+3000:Infinity;
    return true;
  }
  tick(now:number,people:number,arrival:boolean,changed=false,gestures:{wave:boolean;pose:boolean}|null=null){
    this.clock=now;
    if(this.delayedCue){
      if(now<this.delayedCue.at)return;
      const message=this.delayedCue.message;this.delayedCue=null;
      if(!this.request('speak',people,now,message.cueId))this.hooks.send({type:'host-idle',sessionId:message.sessionId,cueId:message.cueId});
      return;
    }
    if(this.challenge){
      const challenge=this.challenge;
      if(arrival||now>=challenge.until){
        this.hooks.send({type:'host-challenge-ended',sessionId:this.host?.sessionId,challengeId:challenge.id,turnover:arrival});
        this.cancel();this.notice=arrival?'New arrivals · a fresh encounter.':'No clear response · moving on.';return;
      }
      if(!challenge.responding&&!this.busy){
        // Unknown/occluded landmarks cannot establish either a neutral or raised pose.
        if(gestures&&gestures[challenge.kind]===false){challenge.neutral=true;challenge.raisedAt=null;}
        else if(gestures?.[challenge.kind]&&challenge.neutral){
          challenge.raisedAt??=now;
          if(now-challenge.raisedAt>=450&&this.request('challenge-response',people,now))challenge.responding=true;
        }else {challenge.raisedAt=null;if(!gestures)challenge.neutral=false;}
      }
      return;
    }
    if((this.pending||this.speaking)&&arrival){
      this.hooks.send({type:'host-scene-invalidated',sessionId:this.host?.sessionId,turnover:true});
      this.cancel();this.notice='New arrivals · discarding the older observation.';return;
    }
    if(this.pending&&now-this.pendingAt>35000){this.hooks.send({type:'host-stop'});this.cancel();this.notice='The host timed out. Start a new session to try again.';return;}
    if(this.host?.controlMode!=='auto'||this.blocked)return;
    if(this.host.wrapped){this.waitingArrival||=arrival;if(this.waitingArrival&&!this.busy&&this.request('arrival',people,now))this.waitingArrival=false;return;}
    this.warmupAt??=now;
    // One fresh look after explicit Start covers guests missed by pose tracking.
    if(this.host.provider==='openai'&&!Number.isFinite(this.lastRequest)&&now-this.warmupAt>=650)this.waitingArrival=true;
    if(arrival&&this.enabled&&this.host?.active)this.waitingArrival=true;
    if(changed&&this.enabled&&this.host?.active){this.waitingChange=true;this.changeAt=now;}
    const present=people>0||now<this.visualPresenceUntil;
    if(!present){
      this.absentSince??=now;
      if(Number.isFinite(this.lastRequest))this.waitingArrival=false;
      if(now-this.changeAt>3000)this.waitingChange=false;
      if(now-this.absentSince>=1500){
        this.nextComment=Infinity;
        if(this.pending&&this.pendingPeople>0){this.hooks.send({type:'host-scene-invalidated',sessionId:this.host?.sessionId,turnover:true});this.cancel();return;}
      }
      if(!this.waitingArrival&&!this.waitingChange)return;
    }
    if(present){
      if(this.absentSince!==null&&now-this.absentSince>=1500&&Number.isFinite(this.lastRequest))this.nextComment=now+3000;
      this.absentSince=null;
    }
    if(this.waitingArrival&&!this.busy&&now-this.lastRequest>=3000&&this.request('arrival',people,now)){this.waitingArrival=false;this.waitingChange=false;}
    else if(this.waitingChange&&!this.busy&&now-this.lastRequest>=3000&&this.request('change',people,now))this.waitingChange=false;
    else if(present&&!this.waitingArrival&&now>=this.nextComment&&!this.busy)this.request('comment',people,now);
  }
  async receive(message:HostMessage){
    if(message.type==='host-cue')return;
    if(!this.enabled||!this.host?.active||message.sessionId!==this.host.sessionId||message.requestId!==this.pending)return;
    this.pending='';
    let played=false;
    const idle=()=>this.hooks.send({type:'host-idle',sessionId:message.sessionId,requestId:message.requestId,played,...(message.cueId?{cueId:message.cueId}:{})});
    if(message.type==='host-rejected'){this.notice=message.message;this.nextComment=Infinity;this.waitingArrival=false;this.waitingChange=false;this.blocked=true;idle();return;}
    if(message.stale){this.challenge=null;this.caption='';this.nextComment=this.clock+3000;this.notice='Reply arrived too late · waiting for a fresh moment.';idle();return;}
    if(message.silent){
      this.challenge=null;this.caption='';
      if(message.silentReason==='no-new-observation'){
        this.dryTurns++;this.nextComment=this.clock+Math.min(12000,3000*this.dryTurns);
        this.notice='Waiting for an unused detail · no recycled joke.';
      }else{this.visualPresenceUntil=-Infinity;this.nextComment=Infinity;this.notice='No clear visual response · watching quietly.';}
      idle();return;
    }
    this.dryTurns=0;
    if(message.performance==='challenge-payoff'&&this.challenge)this.challenge.until=Infinity;
    if(this.host.provider==='openai')this.visualPresenceUntil=this.pendingAt+30000;
    const generation=this.generation;
    this.caption=message.text.slice(0,500);this.speaking=true;
    try {
      played=await this.hooks.play(message,this.volume,this.muted);
      if(generation!==this.generation)return;
      if(message.performance==='challenge-payoff')this.challenge=null;
      if(played&&message.challenge&&this.waitingArrival){this.hooks.send({type:'host-challenge-ended',sessionId:message.sessionId,challengeId:message.challenge.id,turnover:true});this.cancel();return;}
      if(played&&message.challenge){this.challenge={...message.challenge,until:this.clock+10000,neutral:false,raisedAt:null,responding:false};this.waitingArrival=false;this.waitingChange=false;}
      if(played&&message.performance==='farewell')this.hooks.flourish?.();
      const audioTiming=this.hooks.audioTimings?.();
      const stages=message.timings?` · vision ${message.timings.visionMs}ms / review ${message.timings.moderationMs}ms / voice ${message.timings.speechMs}ms · ${message.effectiveMode||'family'} material`:'';
      const playback=audioTiming?.firstAudioMs===undefined?'':` · audio start ${audioTiming.firstAudioMs}ms / spoken ${audioTiming.speechMs||0}ms`;
      const timing=message.latencyMs===undefined?'':` · reply ready in ${(message.latencyMs/1000).toFixed(1)}s · ${message.frameCount||1} frame${message.frameCount===1?'':'s'}`;
      this.notice=played?(this.host.provider==='mock'?'Scripted demo · local voice':'AI-generated voice · session on'+timing+stages+playback):(this.muted?'Muted · captions in the control room':'Click the crystal ball on the TV once to enable voice');
      if(this.challenge&&!this.challenge.responding)this.notice='Challenge open · waiting for a clear new gesture.';
    } catch {if(generation===this.generation)this.notice='Voice unavailable · see the control room captions.';}
    finally {if(generation===this.generation){this.speaking=false;this.playbackUntil=this.clock+(played?800:0);this.nextComment=this.clock+(played?800:5000);}idle();}
  }
}
