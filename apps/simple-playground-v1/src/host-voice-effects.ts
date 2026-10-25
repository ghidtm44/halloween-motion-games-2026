const clamp=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
export const VOICE_TAIL_SECONDS=.48;

/** Short stereo reflections, generated locally. Each channel's absolute sum is <= 1. */
export function voiceImpulse(context:BaseAudioContext){
  const impulse=context.createBuffer(2,Math.ceil(context.sampleRate*VOICE_TAIL_SECONDS),context.sampleRate);
  const taps=[[.019,.24],[.037,.20],[.061,.16],[.093,.13],[.137,.10],[.189,.07],[.263,.05],[.373,.03],[.43,.02]];
  for(let channel=0;channel<2;channel++){
    const samples=impulse.getChannelData(channel);
    for(let i=0;i<taps.length;i++){
      const [time,gain]=taps[i];
      samples[Math.round((time+channel*.007)*context.sampleRate)]=gain*(i%3===2?-1:1);
    }
  }
  return impulse;
}

/** Feed-forward only: no feedback, pitch shifting, recording, or network requests. */
export class VoiceEffectsGraph {
  private dry:GainNode; private wet:GainNode; private echo:GainNode;
  private reverb:ConvolverNode; private delay:DelayNode; private master:GainNode;
  constructor(private context:BaseAudioContext,private source:AudioNode,impulse:AudioBuffer,intensity:number,bypass:boolean){
    this.dry=context.createGain();this.wet=context.createGain();this.echo=context.createGain();this.master=context.createGain();
    this.reverb=context.createConvolver();this.reverb.normalize=false;this.reverb.buffer=impulse;
    this.delay=context.createDelay(.2);this.delay.delayTime.value=.113;
    this.master.gain.value=.9;
    source.connect(this.dry).connect(this.master);
    source.connect(this.reverb).connect(this.wet).connect(this.master);
    source.connect(this.delay).connect(this.echo).connect(this.master);
    this.master.connect(context.destination);this.set(intensity,bypass,true);
  }
  set(intensity:number,bypass:boolean,immediate=false){
    const amount=bypass?0:clamp(intensity);
    // Dry + wet + echo = 1; normalized reflections and 10% headroom bound peaks.
    for(const [parameter,value]of [[this.dry.gain,1-.55*amount],[this.wet.gain,.4*amount],[this.echo.gain,.15*amount]] as const){
      parameter.cancelScheduledValues(this.context.currentTime);
      if(immediate)parameter.value=value;
      else parameter.setTargetAtTime(value,this.context.currentTime,.015);
    }
  }
  dispose(){
    this.source.disconnect();
    for(const node of [this.dry,this.wet,this.echo,this.reverb,this.delay,this.master])node.disconnect();
    this.reverb.buffer=null;
  }
}

/** One context/source per media element; discard all delay state between lines and on Stop. */
export class HostVoiceEffects {
  private context:AudioContext|null=null;private source:MediaElementAudioSourceNode|null=null;
  private graph:VoiceEffectsGraph|null=null;private impulse:AudioBuffer|null=null;
  private analyser:AnalyserNode|null=null;private samples=new Float32Array(256);
  private intensity=.4;private bypass=false;
  constructor(private audio:HTMLAudioElement){}
  set(intensity:number,bypass:boolean){this.intensity=clamp(intensity);this.bypass=bypass;this.graph?.set(this.intensity,bypass);}
  unlock():Promise<void>{
    if(!window.AudioContext)return Promise.resolve();
    if(!this.context){
      this.context=new AudioContext();this.source=this.context.createMediaElementSource(this.audio);this.impulse=voiceImpulse(this.context);
    }
    this.begin();return this.context.resume();
  }
  get level(){if(!this.analyser)return 0;this.analyser.getFloatTimeDomainData(this.samples);let sum=0;for(const v of this.samples)sum+=v*v;return Math.min(1,Math.sqrt(sum/this.samples.length)*6);}
  get ready(){return !this.context||this.context.state==='running';}
  get tailSeconds(){return this.graph&&!this.bypass&&this.intensity>0?VOICE_TAIL_SECONDS:0;}
  begin(){
    this.stop();
    if(this.context&&this.source&&this.impulse){this.graph=new VoiceEffectsGraph(this.context,this.source,this.impulse,this.intensity,this.bypass);
      if(this.context.createAnalyser){this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.source.connect(this.analyser);}
    }
  }
  stop(){this.graph?.dispose();this.graph=null;this.analyser?.disconnect();this.analyser=null;}
  dispose(){this.stop();if(this.context)void this.context.close().catch(()=>{});this.context=null;this.source=null;this.impulse=null;}
}
