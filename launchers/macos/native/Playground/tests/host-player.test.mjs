import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/host-player.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {HostPerformer}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
// Existing automatic behavior is selected explicitly; production presents Auto, but still requires explicit Start.
const state=(provider='mock',sessionId='one',controlMode='auto')=>({active:true,provider,controlMode,configured:true,phase:'ready',message:'',sessionId,requestCount:0,limit:20});
function harness({image='small-fixture'}={}){
 const sent=[],played=[];let captures=0,stops=0,finish;
 const player=new HostPerformer({send:m=>{sent.push(m);return true;},capture:()=>{captures++;return image;},play:(r,v,m)=>{played.push({r,v,m});return new Promise(resolve=>{finish=resolve;});},stopAudio:()=>{stops++;finish?.(false);}});
 return {player,sent,played,get captures(){return captures;},get stops(){return stops;},get observations(){return sent.filter(m=>m.type==='host-observe');},finish:ok=>finish?.(ok)};
}
const result=m=>({type:'host-result',sessionId:m.sessionId,requestId:m.requestId,...(m.cueId?{cueId:m.cueId}:{}),text:'A very grand pumpkin parade!'});
const cue=(cueId='click-one',sessionId='one')=>({type:'host-cue',sessionId,cueId});
test('disabled host, pause and mock rehearsal never capture/upload camera pixels',()=>{
 const h=harness();assert.equal(h.player.request('arrival',2,0),false);
 h.player.configure(state('openai'),false,.8,false);assert.equal(h.player.request('arrival',2,0),false);
 h.player.configure(state(),true,.8,false);assert.equal(h.player.request('arrival',0,0),true);
 assert.equal(h.captures,0);assert.equal('image' in h.observations[0],false);
});
test('automatic mode allows one observation/utterance in flight and enforces image cadence',async()=>{
 const h=harness();h.player.configure(state('openai'),true,.4,true);
 assert.equal(h.player.request('arrival',3,1000),true);assert.equal(h.player.request('comment',3,1001),false);assert.equal(h.captures,1);
 const completion=h.player.receive(result(h.observations[0]));assert.equal(h.player.caption,'A very grand pumpkin parade!');assert.equal(h.player.speaking,true);
 assert.equal(h.player.request('comment',3,10000),false);assert.deepEqual([h.played[0].v,h.played[0].m],[.4,true]);
 h.finish(false);await completion;assert.equal(h.player.speaking,false);
 assert.ok(h.sent.some(m=>m.type==='host-idle'&&m.requestId===h.observations[0].requestId),'Playback completion releases server reservation');
 assert.equal(h.player.request('comment',3,3999),false);assert.equal(h.player.request('comment',3,10000),true);assert.equal(h.captures,2);
});
test('stop, scene change and disconnect invalidate results and clear caption/audio',async()=>{
 for(const boundary of ['stop','scene','disconnect']){
  const h=harness();h.player.configure(state(),true,.8,false);h.player.request('arrival',1,1000);const response=result(h.observations[0]);
  if(boundary==='stop')h.player.configure({...state(),active:false,sessionId:''},true,.8,false);else h.player.configure(state(),false,.8,false);
  await h.player.receive(response);assert.equal(h.played.length,0);assert.equal(h.player.caption,'');assert.equal(h.player.speaking,false);
 }
});
test('restart rejects prior-session response, cancel interrupts speaking and clears contents',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.request('arrival',0,0);const old=result(h.observations[0]);
 h.player.configure(state('mock','two'),true,.8,false);h.player.request('arrival',0,1000);await h.player.receive(old);assert.equal(h.played.length,0);
 const playing=h.player.receive(result(h.observations[1]));assert.equal(h.player.speaking,true);h.player.configure(undefined,false,.8,false);await playing;
 assert.equal(h.player.caption,'');assert.equal(h.player.speaking,false);assert.ok(h.stops>0);
});
test('request timeout ends session without retry and does not accept late reply',async()=>{
 const h=harness();h.player.configure(state('openai'),true,.8,false);h.player.request('arrival',2,0);
 h.player.tick(35001,2,false);assert.ok(h.sent.some(m=>m.type==='host-stop'));await h.player.receive(result(h.observations[0]));assert.equal(h.played.length,0);assert.equal(h.captures,1);
});
test('auto continues beyond two follow-ups but stops when guests leave',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.tick(0,2,true);
 for(const now of [12000,24000,36000,48000]){const p=h.player.receive(result(h.observations.at(-1)));h.finish(true);await p;h.player.tick(now,2,false);}
 assert.equal(h.observations.length,5,'one greeting and ongoing fresh observations');
 const p=h.player.receive(result(h.observations.at(-1)));h.finish(true);await p;
 h.player.tick(50000,0,false);h.player.tick(52000,0,false);h.player.tick(120000,0,false);assert.equal(h.observations.length,5);
});
test('brief tracking dropout does not permanently silence Auto',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.tick(0,1,true);
 const p=h.player.receive(result(h.observations[0]));h.finish(true);await p;
 h.player.tick(10000,0,false);h.player.tick(10200,1,false);h.player.tick(12000,1,false);
 assert.equal(h.observations.length,2);assert.equal(h.observations[1].reason,'comment');
});
test('scene changes coalesce during speech and respect the three-second minimum',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.tick(0,1,true);
 const p=h.player.receive(result(h.observations[0]));
 for(let t=1000;t<3000;t+=1000)h.player.tick(t,2,false,true);
 assert.equal(h.observations.length,1);h.finish(true);await p;
 h.player.tick(2999,2,false);assert.equal(h.observations.length,1);
 h.player.tick(3000,2,false);assert.equal(h.observations.length,2);assert.equal(h.observations[1].reason,'change');
});
test('server rejection clears pending work and prevents automatic retry',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.request('arrival',0,0);
 await h.player.receive({...result(h.observations[0]),type:'host-rejected',message:'Limit reached'});h.player.tick(50000,2,false);
 assert.equal(h.observations.length,1);assert.equal(h.player.busy,false);assert.equal(h.player.notice,'Limit reached');
});
test('new arrivals cancel playing output and discard stale queued output before a fresh session',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.request('arrival',1,0);const speaking=h.player.receive(result(h.observations[0]));
 h.player.tick(10000,2,true);await speaking;assert.equal(h.player.speaking,false);assert.equal(h.player.caption,'');assert.ok(h.sent.some(m=>m.type==='host-scene-invalidated'&&m.turnover));
 h.player.configure({...state('mock','two'),continuation:true},true,.8,false);h.player.tick(11000,2,false);assert.equal(h.observations.length,2);assert.equal(h.observations[1].sessionId,'two');
});
test('cadence waits 800ms after actual playback completion, even with coalesced scene changes',async()=>{
 const h=harness();h.player.configure(state(),true,.8,false);h.player.tick(0,1,true);
 const speaking=h.player.receive(result(h.observations[0]));h.player.tick(5000,1,false,true);h.finish(true);await speaking;
 h.player.tick(5799,1,false,true);assert.equal(h.observations.length,1);h.player.tick(5800,1,false,true);assert.equal(h.observations.length,2);
});
test('operator mode ignores arrivals and timers until one valid Speak cue arrives',async()=>{
 const h=harness();h.player.configure(state('openai','one','operator'),true,.8,false);
 for(let now=0;now<120000;now+=1000)h.player.tick(now,3,now%12000===0);
 assert.equal(h.captures,0);assert.equal(h.observations.length,0);
 assert.equal(h.player.request('arrival',3,120000),false);assert.equal(h.player.request('comment',3,120000),false);
 h.player.cue(cue('old','old-session'),3,120000);assert.equal(h.captures,0);
 h.player.cue(cue(),3,120000);assert.equal(h.captures,1);assert.equal(h.observations.length,1);assert.equal(h.observations[0].reason,'speak');assert.equal(h.observations[0].cueId,'click-one');
 h.player.cue(cue(),3,120001);assert.equal(h.captures,1,'Duplicate delivery while pending does not recapture');
 const done=h.player.receive(result(h.observations[0]));h.finish(true);await done;
 assert.ok(h.sent.some(m=>m.type==='host-idle'&&m.cueId==='click-one'));
 h.player.cue(cue(),3,140000);assert.equal(h.captures,1,'A consumed cue cannot replay after completion');
 for(let now=141000;now<200000;now+=1000)h.player.tick(now,3,true);
 assert.equal(h.observations.length,1,'Playback never schedules follow-up in operator mode');
 h.player.cue(cue('click-two'),2,200000);assert.equal(h.captures,2);assert.equal(h.observations.length,2);
});
test('operator no-image path releases the cue and makes no generation request',()=>{
 const h=harness({image:null});h.player.configure(state('openai','one','operator'),true,.8,false);h.player.cue(cue(),1,0);
 assert.equal(h.captures,1);assert.equal(h.observations.length,0);assert.equal(h.player.busy,false);
 assert.ok(h.sent.some(m=>m.type==='host-idle'&&m.cueId==='click-one'&&m.sessionId==='one'));
});
test('operator scripted Speak remains image-free and mode switching drops pending speech',async()=>{
 const h=harness();h.player.configure(state('mock','one','operator'),true,.8,false);h.player.cue(cue(),0,0);
 assert.equal(h.captures,0);assert.equal(h.observations.length,1);assert.equal('image' in h.observations[0],false);
 const old=result(h.observations[0]);h.player.configure({...state('mock','','auto'),active:false},true,.8,false);await h.player.receive(old);
 assert.equal(h.played.length,0);assert.equal(h.player.caption,'');
});
test('Auto sees guests missed by poses, follows up, and stays quiet after an empty view',async()=>{
 const h=harness();h.player.configure(state('openai'),true,.8,false);h.player.tick(0,0,false);h.player.tick(1200,0,false);
 assert.equal(h.observations.length,1,'explicit Start takes one fresh look');
 let p=h.player.receive(result(h.observations[0]));h.finish(true);await p;
 h.player.tick(1300,0,false);h.player.tick(13200,0,false);assert.equal(h.observations.length,2,'image-confirmed guests keep Auto alive without poses');
 await h.player.receive({...result(h.observations[1]),text:'',silent:true});
 for(let t=14000;t<60000;t+=1000)h.player.tick(t,0,false);
 assert.equal(h.observations.length,2,'empty view makes no timed calls or speech');assert.equal(h.played.length,1);
 h.player.tick(61000,0,false,true);assert.equal(h.observations.length,3,'new local scene change triggers one new look');
});

test('explicit Speak can replace the post-playback pause without losing its one-use cue',async()=>{
 const h=harness();h.player.configure(state('mock','one','operator'),true,.8,false);h.player.cue(cue('first'),1,0);
 const playing=h.player.receive(result(h.observations[0]));h.player.tick(6000,1,false);h.finish(true);await playing;
 assert.equal(h.player.cue(cue('second'),1,6001),true);assert.equal(h.observations.length,2);assert.equal(h.observations[1].cueId,'second');
});
