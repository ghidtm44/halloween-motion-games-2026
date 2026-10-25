// Real Web Audio DSP and media playback; synthetic PCM only, no camera/mic/API calls.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const asUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const effectsUrl=asUrl(await readFile(new URL('../src/host-voice-effects.ts',import.meta.url),'utf8'));
const audioUrl=asUrl((await readFile(new URL('../src/host-audio.ts',import.meta.url),'utf8')).replace("'./host-voice-effects'",JSON.stringify(effectsUrl)));
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'}),headless:true});
const errors=[],external=[],checks=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{external.push(r.request().url());return r.abort();});
 const renders=await page.evaluate(async url=>{
  const {VoiceEffectsGraph,voiceImpulse}=await import(url);const results=[];
  for(const [intensity,bypass]of [[0,false],[.4,false],[1,false],[1,true]]){
   const rate=48000,context=new OfflineAudioContext(2,rate,rate),source=context.createBufferSource(),input=context.createBuffer(1,rate/10,rate);
   const samples=input.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.sign(Math.sin(i*2*Math.PI*187/rate));source.buffer=input;
   const graph=new VoiceEffectsGraph(context,source,voiceImpulse(context),intensity,bypass);source.start();
   const output=await context.startRendering();let peak=0,tail=0,late=0,dryError=0;
   for(let ch=0;ch<2;ch++)for(let i=0;i<rate;i++){
    const value=output.getChannelData(ch)[i];peak=Math.max(peak,Math.abs(value));
    if(i>rate*.11&&i<rate*.55)tail+=value*value;
    if(i>rate*.58)late=Math.max(late,Math.abs(value));
    if(!intensity||bypass)dryError=Math.max(dryError,Math.abs(value-.9*(samples[i]||0)));
   }
   graph.dispose();results.push({intensity,bypass,peak,tail,late,dryError});
  }
  // Stop discards active reflection state; rebuilding a graph cannot resurrect it.
  const rate=48000,context=new OfflineAudioContext(2,rate,rate),source=context.createBufferSource(),input=context.createBuffer(1,rate/10,rate);
  input.getChannelData(0).fill(.5);source.buffer=input;let graph=new VoiceEffectsGraph(context,source,voiceImpulse(context),1,false);source.start();
  const stopped=context.suspend(.12).then(()=>{graph.dispose();graph=new VoiceEffectsGraph(context,source,voiceImpulse(context),1,false);return context.resume();});
  const output=await context.startRendering();await stopped;let stoppedPeak=0;
  for(let ch=0;ch<2;ch++)for(let i=Math.ceil(rate*.14);i<rate;i++)stoppedPeak=Math.max(stoppedPeak,Math.abs(output.getChannelData(ch)[i]));
  graph.dispose();return {results,stoppedPeak};
 },effectsUrl);
 for(const r of renders.results){assert.ok(r.peak<=.90001,JSON.stringify(r));assert.ok(r.late<1e-6);if(r.intensity&&!r.bypass)assert.ok(r.tail>1);else {assert.ok(r.dryError<1e-6);assert.equal(r.tail,0);}}
 assert.ok(renders.stoppedPeak<1e-6);checks.push('Offline render: audible wet tail, dry bypass, full-scale headroom, bounded tail, Stop discards reflections');
 await page.setContent('<button id="unlock">Enable synthetic audio</button>');
 await page.evaluate(async url=>{
  window.__contexts=[];window.__mediaSources=0;window.__ended=[];
  const NativeContext=window.AudioContext,NativeAudio=window.Audio;
  window.AudioContext=class extends NativeContext{constructor(){super();window.__contexts.push(this);}createMediaElementSource(audio){window.__mediaSources++;return super.createMediaElementSource(audio);}};
  window.Audio=class extends NativeAudio{constructor(){super();this.addEventListener('ended',()=>window.__ended.push(performance.now()));}};
  const {HostAudio}=await import(url);window.__hostAudio=new HostAudio();
  document.querySelector('#unlock').onclick=()=>{window.__unlocked=window.__hostAudio.enable();};
  const rate=16000,count=4000,bytes=new ArrayBuffer(44+count*2),v=new DataView(bytes);
  const tag=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,count*2,true);
  for(let i=0;i<count;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/rate)*8000*Math.min(1,i/200,(count-i)/200),true);
  window.__line={text:'Synthetic audio.',audio:{mime:'audio/wav',base64:btoa(String.fromCharCode(...new Uint8Array(bytes)))}};
 },audioUrl);
 assert.equal(await page.evaluate(()=>window.__hostAudio.play(window.__line,1,false)),false);
 await page.locator('#unlock').click();assert.equal(await page.evaluate(()=>window.__unlocked),true);
 const playback=await page.evaluate(async()=>{
  const h=window.__hostAudio,results=[];let maxLevel=0;const meter=setInterval(()=>{maxLevel=Math.max(maxLevel,h.level);},8);
  for(let i=0;i<3;i++){
   h.setEffects(i===1?1:.4,i===2);const ok=await h.play(window.__line,1,false);
   results.push({ok,tailMs:performance.now()-window.__ended.at(-1)});
  }
  const speaking=h.play(window.__line,.8,false);setTimeout(()=>h.setEffects(1,false),40);setTimeout(()=>h.setEffects(.2,true),80);
  results.push({ok:await speaking,changedDuringSpeech:true});
  const stopped=h.play(window.__line,1,false);h.stop();results.push({stopped:await stopped});
  const replaced=h.play(window.__line,1,false),replacement=h.play(window.__line,1,false);
  results.push({replaced:await replaced,replacement:await replacement});
  h.setEffects(1,false);const tailStopped=h.play(window.__line,1,false);
  await new Promise(resolve=>setTimeout(resolve,400));h.stop();results.push({tailStopped:await tailStopped});
  const muted=await h.play(window.__line,1,true);const quietLevel=h.level;clearInterval(meter);h.dispose();
  return {results,muted,maxLevel,quietLevel,contexts:window.__contexts.length,sources:window.__mediaSources};
 });
 assert.deepEqual(playback.results.slice(0,3).map(x=>x.ok),[true,true,true]);
 assert.ok(playback.results[0].tailMs>=450);assert.ok(playback.results[1].tailMs>=450);assert.ok(playback.results[2].tailMs<100);
 assert.equal(playback.results[3].ok,true);assert.equal(playback.results[4].stopped,false);assert.deepEqual(playback.results[5],{replaced:false,replacement:true});assert.equal(playback.results[6].tailStopped,false);
 assert.ok(playback.maxLevel>.1,'actual PCM drives jaw meter');assert.equal(playback.quietLevel,0);assert.equal(playback.muted,false);assert.equal(playback.contexts,1);assert.equal(playback.sources,1);
 await expect.poll(()=>page.evaluate(()=>window.__contexts.every(c=>c.state==='closed'))).toBe(true);
 checks.push('Real Chrome: click unlock, repeated PCM playback, adjustable effects, dry bypass, muted/Stop/replacement cancellation, one source/context, context closes');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 const report={passed:true,checks,renders,playback,externalRequests:external,browserErrors:errors,limitations:'Synthetic PCM and actual Web Audio rendering; no live voice quality, physical speakers, API calls or media capture tested.'};
 await mkdir('work',{recursive:true});await writeFile('work/host-voice-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
