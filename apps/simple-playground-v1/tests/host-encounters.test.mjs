import {comedyFixture} from './host-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createHostSession} from '../host-session.mjs';
import {createOpenAIProvider} from '../host-provider.mjs';
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL('../src/'+name,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const {HostPerformer}=await load('host-player.ts'),{challengeGestures}=await load('host-challenge.ts');
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,11,8,1,104,2,128,1,1,17,0,255,217]).toString('base64');
function session(t,provider){
 let now=1000;const results=[],inputs=[],rejected=[];
 const h=createHostSession({options:{apiKey:'synthetic-fixture',now:()=>now,provider:async input=>{inputs.push(input);return provider?provider(input):{text:'A synthetic costume line.'};}},onChange:()=>{},onResult:r=>results.push(r),onRejected:r=>rejected.push(r)});
 h.start('openai','auto');t.after(()=>h.stop());
 const cue=kind=>h.action(kind,'openai','auto',true);
 const observe=(c,extra={})=>h.observe({sessionId:h.state.sessionId,requestId:'r'+inputs.length,people:2,image:jpeg,reason:'speak',cueId:c?.cueId,...extra},true);
 const idle=played=>{const r=results.at(-1);return h.idle({sessionId:r.sessionId,requestId:r.requestId,cueId:r.cueId,played});};
 return {h,results,inputs,rejected,cue,observe,idle,time:n=>{now=n;}};
}
test('challenge has one paid response only after heard invitation, matching token, fresh image and cooldown',async t=>{
 const f=session(t);await f.observe(f.cue('challenge'));const challenge=f.results[0].challenge;assert.ok(challenge);assert.equal(f.inputs[0].intent,'challenge-invite');f.idle(true);
 await f.observe(null,{reason:'challenge-response',challengeId:challenge.id,gesture:challenge.kind});assert.equal(f.inputs.length,1,'three-second guard');
 f.time(7000);await f.observe(null,{reason:'challenge-response',challengeId:'wrong',gesture:challenge.kind});assert.equal(f.inputs.length,1);
 await f.observe(null,{reason:'challenge-response',challengeId:challenge.id,gesture:challenge.kind});assert.equal(f.inputs.length,2);assert.equal(f.inputs[1].intent,'challenge-payoff');assert.equal(f.inputs[1].image,jpeg);f.idle(true);
 f.time(14000);await f.observe(null,{reason:'challenge-response',challengeId:challenge.id,gesture:challenge.kind});assert.equal(f.inputs.length,2,'token is single-use');
});
test('locked/muted invitation does not arm a challenge; timeout and new group clear context',async t=>{
 const f=session(t);await f.observe(f.cue('challenge'));let ch=f.results.at(-1).challenge;f.idle(false);f.time(8000);
 await f.observe(null,{reason:'challenge-response',challengeId:ch.id,gesture:ch.kind});assert.equal(f.inputs.length,1);
 await f.observe(f.cue('challenge'));ch=f.results.at(-1).challenge;f.idle(true);
 assert.equal(f.h.endChallenge({sessionId:f.h.state.sessionId,challengeId:ch.id,turnover:true}),true);
 f.time(15000);await f.observe(null,{reason:'arrival'});assert.deepEqual(f.inputs.at(-1).recentRemarks,[]);
});
test('rescue cue cancels in-flight work, preserves budget and waits out cooldown; Quiet cancels queued cue until Resume',async t=>{
 let finish;const f=session(t,()=>new Promise(resolve=>{finish=resolve;}));const pending=f.observe(f.cue('welcome'));assert.equal(f.inputs.length,1);
 f.time(2000);const replacement=f.cue('farewell');assert.equal(replacement.delayMs,2000);assert.equal(f.inputs[0].signal.aborted,true);finish({text:'Stale line'});await pending;assert.equal(f.results.length,0);
 assert.equal(f.h.state.requestCount,1);f.h.action('quiet');assert.equal(f.h.state.quiet,true);assert.equal(f.h.state.active,false);
 f.time(9000);await f.observe(replacement);assert.equal(f.inputs.length,1);assert.match(f.h.cue('openai','operator',true).error,/Resume/);
 f.h.action('resume','openai','auto',true);assert.equal(f.h.state.active,true);assert.equal(f.h.state.requestCount,1);assert.equal(f.h.state.quiet,false);
});
test('farewell is once per group; lingering changes cannot repeat it; Welcome/arrival reset',async t=>{
 const f=session(t);await f.observe(f.cue('farewell'));f.idle(true);assert.equal(f.h.state.wrapped,true);assert.match(f.cue('farewell').error,/already/);
 f.time(8000);await f.observe(null,{reason:'change'});assert.equal(f.inputs.length,1);await f.observe(null,{reason:'arrival'});assert.equal(f.h.state.wrapped,false);f.idle(true);
 f.time(15000);await f.observe(f.cue('farewell'));f.idle(true);f.time(22000);await f.observe(f.cue('welcome'));assert.equal(f.h.state.wrapped,false);assert.deepEqual(f.inputs.at(-1).recentRemarks,[]);
});
test('group turnover aborts a challenge payoff in flight and ignores its late result',async t=>{
 let finish;const f=session(t,input=>input.intent==='challenge-payoff'?new Promise(r=>{finish=r;}):{text:'Raise a hand, if you fancy it.'});
 await f.observe(f.cue('challenge'));const ch=f.results.at(-1).challenge;f.idle(true);f.time(7000);
 const pending=f.observe(null,{reason:'challenge-response',challengeId:ch.id,gesture:ch.kind});
 f.h.endChallenge({sessionId:f.h.state.sessionId,challengeId:ch.id,turnover:true});assert.equal(f.inputs.at(-1).signal.aborted,true);
 finish({text:'Late payoff'});await pending;assert.equal(f.results.length,1);assert.equal(f.h.state.active,true);
});
function player(){
 const sent=[],played=[],flourishes=[];let finish;
 const p=new HostPerformer({send:m=>{sent.push(m);return true;},capture:()=>jpeg,play:r=>{played.push(r);return new Promise(r=>{finish=r;});},stopAudio:()=>finish?.(false),flourish:()=>flourishes.push(1)});
 let state={active:true,provider:'openai',controlMode:'auto',phase:'ready',sessionId:'one',requestCount:0,limit:50};p.configure(state,true,1,false);
 const respond=async(extra={},heard=true)=>{const r=sent.filter(m=>m.type==='host-observe').at(-1);const promise=p.receive({...r,type:'host-result',text:'Synthetic line',...extra});finish?.(heard);await promise;};
 return {p,sent,played,flourishes,respond,get observations(){return sent.filter(m=>m.type==='host-observe');},configure:patch=>{state={...state,...patch};p.configure(state,true,1,false);}};
}
const invitation={performance:'challenge-invite',challenge:{id:'challenge',kind:'wave'}};
test('challenge requires a neutral-to-raised transition held 450ms; uncertain/brief gestures do not count',async()=>{
 const h=player();h.p.request('arrival',1,0);await h.respond(invitation);h.p.tick(6100,1,false,false,{wave:true,pose:false});assert.equal(h.observations.length,1,'already raised is not a response');
 h.p.tick(6200,1,false,false,null);h.p.tick(6300,1,false,false,{wave:false,pose:false});h.p.tick(6400,1,false,false,{wave:true,pose:false});h.p.tick(6600,1,false,false,{wave:false,pose:false});assert.equal(h.observations.length,1);
 h.p.tick(6700,1,false,false,{wave:true,pose:false});h.p.tick(7200,1,false,false,{wave:true,pose:false});assert.equal(h.observations.length,2);assert.equal(h.observations[1].reason,'challenge-response');assert.equal(h.observations[1].challengeId,'challenge');
 await h.respond({performance:'challenge-payoff'});h.p.tick(7300,1,false,false,{wave:true,pose:false});assert.equal(h.observations.length,2);
});
test('challenge timeout/turnover makes no response claim; audio lock never starts response capture',async()=>{
 for(const kind of ['timeout','turnover','locked']){
  const h=player();h.p.request('arrival',1,0);await h.respond(invitation,kind!=='locked');
  h.p.tick(kind==='timeout'?10001:3000,1,kind==='turnover',false,null);
  assert.equal(h.observations.length,1);assert.equal(h.played.length,1);
  assert.equal(h.sent.some(m=>m.type==='host-challenge-ended'),kind!=='locked');h.p.cancel();
 }
});
test('Quiet invalidates delayed cues and stale speech; farewell flourish requires completed audible line',async()=>{
 const h=player();h.p.cue({type:'host-cue',sessionId:'one',cueId:'later',delayMs:5000},1,0);h.configure({active:false,quiet:true,sessionId:''});h.p.tick(10000,3,true);assert.equal(h.observations.length,0);
 h.configure({active:true,quiet:false,sessionId:'two'});h.p.request('arrival',1,11000);await h.respond({performance:'farewell'},false);assert.equal(h.flourishes.length,0);
 h.p.request('comment',1,18000);await h.respond({performance:'farewell'},true);assert.equal(h.flourishes.length,1);
 h.configure({wrapped:true});h.p.tick(40000,2,false,true);assert.equal(h.observations.length,2);h.p.tick(41000,3,true);assert.equal(h.observations.length,3);
});
test('local gesture geometry rejects masks/occlusion/low confidence and never invents guests',()=>{
 const pose=()=>({id:0,landmarks:Array.from({length:33},(_,i)=>({x:.5,y:i===0?.2:i===11||i===12?.4:.7,visibility:1}))});
 assert.equal(challengeGestures([]),null);const p=pose();assert.deepEqual(challengeGestures([p]),{wave:false,pose:false});p.landmarks[15].y=.1;assert.deepEqual(challengeGestures([p]),{wave:true,pose:false});p.landmarks[16].y=.1;assert.deepEqual(challengeGestures([p]),{wave:true,pose:true});p.landmarks[0].visibility=.2;assert.equal(challengeGestures([p]),null);
});
test('provider directions ground group jokes, challenge confirmation and farewell without identity claims',async()=>{
 for(const intent of ['comment','challenge-invite','challenge-payoff','farewell','welcome']){
  const bodies=[];const provider=createOpenAIProvider({apiKey:'synthetic',fetchImpl:async(url,options)=>{bodies.push(JSON.parse(options.body));if(url.endsWith('/responses'))return Response.json({output:[{type:'message',content:[{type:'output_text',text:comedyFixture(intent==='challenge-payoff'?'[[WAIT]]':'That silver cape has its own lighting department.')}]}]});if(url.endsWith('/moderations'))return Response.json({results:[{flagged:false}]});return new Response(new Uint8Array([1]));}});
  const result=await provider({people:2,image:jpeg,reason:'comment',sequence:5,intent,gesture:'wave',tone:100,signal:new AbortController().signal});
  const prompt=bodies[0].input[0].content[0].text;assert.match(bodies[0].instructions,/Two guests can share a joke/);assert.match(bodies[0].instructions,/Never guess relationships/);assert.match(bodies[0].instructions,/audience is uncertain/);
  if(intent==='challenge-payoff'){assert.equal(result.silent,true);assert.equal(bodies.length,1);assert.match(prompt,/Confirm it in the newest frame/);}
  if(intent==='farewell')assert.match(prompt,/No new challenge/);
 }
});
