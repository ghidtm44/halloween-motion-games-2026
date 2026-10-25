import type {HostResult} from './types';
import {HostVoiceEffects} from './host-voice-effects';

/** Audio remains in memory; only one utterance can own the player. */
export class HostAudio {
  private audio=new Audio();
  private effects=new HostVoiceEffects(this.audio);
  private url=''; private finish:(played:boolean)=>void=()=>{};
  private timer=0; private tailTimer=0; private epoch=0;
  private utterance:SpeechSynthesisUtterance|null=null;
  timings:{firstAudioMs?:number;speechMs?:number}={};
  private wordAt=-Infinity;
  enabled=false;
  get level(){return this.utterance?Math.max(0,1-(performance.now()-this.wordAt)/170)*.65:this.effects.level;}
  setEffects(intensity:number,bypass:boolean){this.effects.set(intensity,bypass);}
  setVolume(volume:number){
    this.audio.volume=Math.max(0,Math.min(1,volume));
    // Browsers need not honor changes to an utterance already being spoken.
    if(this.utterance&&this.utterance.volume!==this.audio.volume)this.stop();
  }
  async enable(){
    this.stop();
    const epoch=this.epoch;this.enabled=false;
    // Unlock the same media element on a real player click with a short local WAV.
    const bytes=new ArrayBuffer(844),view=new DataView(bytes);
    const tag=(offset:number,s:string)=>[...s].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
    tag(0,'RIFF');view.setUint32(4,836,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,800,true);
    this.url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));this.audio.src=this.url;
    try {
      // Invoke both while still inside the user's click; neither waits for the other.
      await Promise.all([this.effects.unlock(),this.audio.play()]);
      if(epoch!==this.epoch)return false;
      this.enabled=this.effects.ready;return this.enabled;
    }catch{if(epoch===this.epoch)this.stop();return false;}
  }
  stop(){
    this.epoch++;clearTimeout(this.timer);clearTimeout(this.tailTimer);this.audio.pause();this.audio.onended=null;this.audio.onerror=null;this.audio.onplaying=null;
    this.effects.stop();
    this.audio.removeAttribute('src');this.audio.load();
    if(this.url){URL.revokeObjectURL(this.url);this.url='';}
    this.wordAt=-Infinity;this.utterance=null;window.speechSynthesis?.cancel();this.finish(false);this.finish=()=>{};
  }
  dispose(){this.stop();this.effects.dispose();this.enabled=false;}
  play(result:HostResult,volume:number,muted:boolean):Promise<boolean>{
    this.stop();if(!this.effects.ready)this.enabled=false;
    if(!this.enabled||muted||volume===0)return Promise.resolve(false);
    const epoch=this.epoch,started=performance.now();this.timings={};
    return new Promise(resolve=>{
      this.finish=resolve;
      const done=(ok:boolean)=>{if(epoch!==this.epoch)return;this.finish=()=>{};this.stop();resolve(ok);};
      this.timer=window.setTimeout(()=>done(false),22000);
      if(result.audio){
        if(!['audio/mpeg','audio/mp3','audio/wav'].includes(result.audio.mime)||result.audio.base64.length>3_000_000){done(false);return;}
        try {
          this.effects.begin();
          const bytes=Uint8Array.from(atob(result.audio.base64),c=>c.charCodeAt(0));
          this.url=URL.createObjectURL(new Blob([bytes],{type:result.audio.mime}));this.audio.src=this.url;this.audio.volume=Math.max(0,Math.min(1,volume));
          this.audio.onplaying=()=>{this.timings.firstAudioMs=Math.round(performance.now()-started);};
          this.audio.onended=()=>{this.timings.speechMs=Math.round(performance.now()-started)-(this.timings.firstAudioMs||0);const tail=this.effects.tailSeconds;if(tail)this.tailTimer=window.setTimeout(()=>done(true),tail*1000);else done(true);};
          this.audio.onerror=()=>done(false);void this.audio.play().catch(()=>done(false));
        }catch{done(false);}
      }else{
        // Only installed local voices are eligible; never route mock speech to a remote voice.
        const voice=window.speechSynthesis?.getVoices().find(v=>v.localService&&v.lang.startsWith('en'));
        if(!voice){done(false);return;}
        const utterance=this.utterance=new SpeechSynthesisUtterance(result.text);utterance.voice=voice;utterance.rate=.88;utterance.pitch=.56;utterance.volume=volume;
        utterance.onboundary=()=>{this.wordAt=performance.now();};utterance.onstart=()=>{this.wordAt=performance.now();};
        utterance.onend=()=>done(true);utterance.onerror=()=>done(false);window.speechSynthesis.speak(utterance);
      }
    });
  }
}
