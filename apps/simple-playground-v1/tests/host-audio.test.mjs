import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const {outputText:effectsText}=ts.transpileModule(await readFile(new URL('../src/host-voice-effects.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const effectsUrl='data:text/javascript;base64,'+Buffer.from(effectsText).toString('base64');
const {outputText}=ts.transpileModule(await readFile(new URL('../src/host-audio.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {HostAudio}=await import('data:text/javascript;base64,'+Buffer.from(outputText.replace('./host-voice-effects',effectsUrl)).toString('base64'));
function setup(t){
 const descriptors=new Map(),sounds=[],utterances=[],revoked=[],created=[];let local=true,cancels=0;
 const install=(k,v)=>{descriptors.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});};
 class Audio {volume=1;src='';onended=null;onerror=null;playCalls=0;pauses=0;constructor(){sounds.push(this);}async play(){this.playCalls++;}pause(){this.pauses++;}load(){}removeAttribute(){this.src='';}}
 install('Audio',Audio);install('SpeechSynthesisUtterance',class{constructor(text){this.text=text;}});
 install('window',{setTimeout,clearTimeout,speechSynthesis:{cancel(){cancels++;},getVoices(){return [{lang:'en-US',localService:local}];},speak(u){utterances.push(u);}}});
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{const u=`blob:fixture-${created.length}`;created.push({blob,u});return u;};URL.revokeObjectURL=url=>revoked.push(url);
 const audio=new HostAudio();
 t.after(()=>{audio.stop();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;for(const[k,d]of descriptors){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 return {audio,sounds,utterances,revoked,created,setLocal:x=>{local=x;},get cancels(){return cancels;}};
}
const line={type:'host-result',text:'A friendly pumpkin welcome!',sessionId:'s',requestId:'r'};
test('voice starts only after player activation; mock accepts only installed local voices',async t=>{
 const h=setup(t);assert.equal(await h.audio.play(line,.8,false),false);assert.equal(h.utterances.length,0);
 await h.audio.enable();h.setLocal(false);assert.equal(await h.audio.play(line,.8,false),false);assert.equal(h.utterances.length,0);
 h.setLocal(true);const p=h.audio.play(line,.5,false);assert.equal(h.utterances.length,1);assert.equal(h.utterances[0].volume,.5);h.utterances[0].onend();assert.equal(await p,true);
});
test('mute and zero volume produce captions only; changing media volume is immediate',async t=>{
 const h=setup(t);await h.audio.enable();assert.equal(await h.audio.play(line,.8,true),false);assert.equal(await h.audio.play(line,0,false),false);assert.equal(h.utterances.length,0);
 h.audio.setVolume(.2);assert.equal(h.sounds[0].volume,.2);
});
test('lowering volume during local speech cancels it, including a change to zero',async t=>{
 const h=setup(t);await h.audio.enable();const speaking=h.audio.play(line,.8,false);assert.equal(h.utterances.length,1);
 h.audio.setVolume(0);assert.equal(await speaking,false);assert.equal(h.sounds[0].volume,0);
});
test('one utterance replaces another and stop revokes audio data and resolves playback',async t=>{
 const h=setup(t);await h.audio.enable();const audioLine={...line,audio:{base64:'SUQzAA==',mime:'audio/mpeg'}};
 const first=h.audio.play(audioLine,.8,false);const source=h.sounds[0].src;assert.ok(source.startsWith('blob:'));
 const second=h.audio.play(audioLine,.6,false);assert.equal(await first,false);assert.ok(h.revoked.includes(source));
 h.audio.stop();assert.equal(await second,false);assert.equal(h.sounds[0].src,'');assert.ok(h.revoked.includes(h.created.at(-1).u));
});
test('invalid audio payload is rejected without media playback',async t=>{
 const h=setup(t);await h.audio.enable();const plays=h.sounds[0].playCalls;
 assert.equal(await h.audio.play({...line,audio:{mime:'text/html',base64:'AA=='}},.8,false),false);
 assert.equal(h.sounds[0].playCalls,plays);
});
