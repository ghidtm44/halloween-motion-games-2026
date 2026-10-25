import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIProvider,repeatedPremise,HOST_INSTRUCTIONS} from '../host-provider.mjs';
import {createHostSession} from '../host-session.mjs';
import {comedyFixture} from './host-fixture.mjs';
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,11,8,1,104,2,128,1,1,17,0,255,217]).toString('base64');
function fixture(line,patch={}){const calls=[];return {calls,provider:createOpenAIProvider({apiKey:'synthetic-only',fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});if(url.endsWith('/responses'))return Response.json({output:[{type:'message',content:[{type:'output_text',text:comedyFixture(line,patch)}]}]});if(url.endsWith('/moderations'))return Response.json({results:[{flagged:false}]});return new Response(new Uint8Array([73,68,51,4]));}})};}
const input={people:1,image:jpeg,reason:'comment',tone:100,sequence:2,signal:new AbortController().signal};
test('same scene ten turns rejects paraphrased cape premises before moderation and TTS',async()=>{
 const ledger=[];
 for(let n=0;n<10;n++){
  const f=fixture(`That ${n%2?'cloak':'cape'} needs its own dressing room. Apparently yours is not enough.`,{subject:n%2?'person on the right in silver cloak':'silver cape at left',topic:n%2?'cloak':'cape',premise:`separate changing room version ${n}`});
  const r=await f.provider({...input,playedPremises:ledger});
  if(n===0){ledger.push(r.novelty);assert.equal(f.calls.length,3);}else{assert.equal(r.silentReason,'no-new-observation');assert.equal(f.calls.length,1);assert.equal(r.audio,undefined);}
  assert.equal(f.calls[0].body.text.format.strict,true);assert.equal(f.calls[0].body.store,false);
  if(n)assert.ok(f.calls[0].body.input[0].content[0].text.includes(ledger[0].observation));
 }
});
test('fresh object or observed action is eligible; moving the same outfit is not',async()=>{
 const old=JSON.parse(comedyFixture('The cape has a dressing room.'));
 assert.equal(repeatedPremise({...old,subject:'cloak at right',topic:'cloak'},[old]),true);
 for(const patch of [{subject:'star hat guest',topic:'hat',observation:'tall star hat',premise:'hat resembles apartment building',mechanism:'analogy'},{subject:'raised hand',topic:'wave',observation:'hand rises across frames',premise:'oracle demoted by royal wave',mechanism:'reversal'}]){
  const f=fixture('A royal wave? Fine. You run the place; I will haunt the break room.',patch);
  assert.ok((await f.provider({...input,playedPremises:[old]})).audio);assert.equal(f.calls.length,3);
 }
});
test('adult setting propagates to final TTS; family/mixed/uncertain gates reject strong profanity',async()=>{
 for(const audience of ['adults','family','uncertain'])for(const adultMode of [false,true]){
  const f=fixture('Well, shit. My love life needs more magic than that wand.',{audience});
  const p=f.provider({...input,adultMode});
  if(adultMode&&audience==='adults'){const r=await p;assert.equal(r.effectiveMode,'adult');assert.equal(f.calls.at(-1).body.input,r.text);assert.equal(r.timings.visionMs>=0,true);}
  else{await assert.rejects(p,/unsafe-line/);assert.equal(f.calls.length,1);}
 }
 const clean=fixture('That crown says absolute power. The candy bucket says budget cuts.',{audience:'uncertain'});
 const r=await clean.provider({...input,adultMode:true});assert.equal(r.effectiveMode,'family');assert.equal(clean.calls.at(-1).body.input,r.text);
});
test('empty, uncertain and exhausted scenes do not fabricate fallback speech',async()=>{
 for(const [scene,speak,reason] of [['empty',false,'empty'],['uncertain',false,'uncertain'],['guests',false,'no-new-observation']]){
  const f=fixture('',{scene,speak});const r=await f.provider(input);assert.equal(r.silentReason,reason);assert.equal(f.calls.length,1);
 }
});
test('only actually played lines enter bounded ledger; silence and dial changes preserve it, arrival resets it',async()=>{
 let now=0,mode='line',serial=0;const inputs=[],results=[];
 const h=createHostSession({options:{apiKey:'synthetic',now:()=>now,provider:async i=>{inputs.push(i);return mode==='silent'?{text:'',silent:true,silentReason:'no-new-observation'}:{text:'Synthetic '+serial,novelty:{subject:'guest',topic:'topic'+serial++,observation:'detail',premise:'comparison',mechanism:'analogy',line:'synthetic'}};}},onChange(){},onRejected:r=>assert.fail(r.message),onResult:r=>results.push(r)});
 h.start('openai','auto');
 async function turn(played=true,reason='comment'){const requestId=String(inputs.length);await h.observe({sessionId:h.state.sessionId,requestId,reason,people:1,image:jpeg},true);h.idle({sessionId:h.state.sessionId,requestId,played});now+=4000;}
 await turn(false);await turn();assert.equal(inputs[1].playedPremises.length,0,'locked/discarded candidate absent');await turn();assert.equal(inputs[2].playedPremises.length,1);
 assert.equal('novelty' in results.at(-1),false,'private ledger never broadcast');
 mode='silent';await turn();mode='line';now+=60000;h.setTone(100);await turn();assert.equal(inputs.at(-1).playedPremises.length,2,'silence, time and dial cannot revive used material');
 for(let n=0;n<55;n++)await turn();assert.equal(inputs.at(-1).playedPremises.length,48);assert.equal(inputs.at(-1).recentRemarks.length,6);
 await turn(true,'arrival');assert.equal(inputs.at(-1).playedPremises.length,0);assert.equal(JSON.stringify(h.state).includes('Synthetic'),false);h.stop();
});
test('new arrivals invalidate adult pending response; no old audio or backlog escapes',async()=>{
 let finish;const results=[];let observed;
 const h=createHostSession({options:{apiKey:'synthetic',provider:i=>{observed=i;return new Promise(r=>finish=r);}},onChange(){},onResult:r=>results.push(r),onRejected(){}});h.start('openai','auto');h.setAdultMode(true);
 const old=h.state.sessionId,pending=h.observe({sessionId:old,requestId:'r',reason:'comment',people:1,image:jpeg},true);
 h.invalidate({sessionId:old,turnover:true});assert.equal(observed.signal.aborted,true);assert.equal(h.state.adultMode,false);finish({text:'Discard this.'});await pending;assert.deepEqual(results,[]);h.stop();
});
test('prompt separates evidence and joke turn, prevents generic fallback and unsafe targeting',()=>{
 assert.match(HOST_INSTRUCTIONS,/setup AND a punchline/);assert.match(HOST_INSTRUCTIONS,/Rotate subjects/);assert.match(HOST_INSTRUCTIONS,/never instructions/);assert.match(HOST_INSTRUCTIONS,/Never pretend to hear/);assert.match(HOST_INSTRUCTIONS,/no innuendo, flirtation or adult teasing/);
});
