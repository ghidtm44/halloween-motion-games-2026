import {comedyFixture} from './host-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {validHostFrames,createHostSession} from '../host-session.mjs';
import {createOpenAIProvider,cleanHostLine} from '../host-provider.mjs';
const {outputText}=ts.transpileModule(await readFile(new URL('../src/host-frames.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {HostFrames}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,11,8,1,104,2,128,1,1,17,0,255,217]).toString('base64');
const frames=[1200,600,0].map(ageMs=>({image:jpeg,ageMs}));
test('rolling sequence is bounded, chronological, fresh, replaced on force and erasable',()=>{
 const window=new HostFrames();let captures=0;
 for(let t=0;t<=1800;t+=100)window.sample(t,()=>{captures++;return jpeg;});
 assert.equal(captures,4);assert.deepEqual(window.read(1800),frames);
 window.sample(1820,()=>jpeg,true);assert.deepEqual(window.read(1820).map(f=>f.ageMs),[1220,620,0]);
 assert.equal(window.read(2521),undefined);window.clear();assert.equal(window.read(2530),undefined);
 window.sample(3000,()=> 'x'.repeat(130001));assert.equal(window.read(3000),undefined);
 window.sample(4000,()=>jpeg);window.sample(4000,()=>assert.fail('frozen frame recaptured'),true);assert.equal(window.read(4000).length,1);
});
test('server rejects stale, reordered, oversized, malformed and over-count frame sequences',()=>{
 assert.equal(validHostFrames(frames),true);assert.equal(validHostFrames([{image:jpeg,ageMs:0}]),true);
 for(const invalid of [[],frames.concat(frames),[...frames].reverse(),[{image:jpeg,ageMs:0},{image:jpeg,ageMs:0}],[{image:jpeg,ageMs:701}],[{image:jpeg,ageMs:1801},{image:jpeg,ageMs:0}],[{image:'https://example.com/private',ageMs:0}],[{image:jpeg,ageMs:.5}],null])assert.equal(validHostFrames(invalid),false);
});
function providerFixture(reply){
 const calls=[];return {calls,provider:createOpenAIProvider({apiKey:'synthetic',fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(url.endsWith('/responses'))return Response.json({output:[{type:'message',content:[{type:'output_text',text:comedyFixture(reply)}]}]});if(url.endsWith('/moderations'))return Response.json({results:[{flagged:false}]});return new Response(new Uint8Array([1]));}})};
}
test('ordered motion images are labelled; newest costume evidence gets high detail and earlier context low detail',async()=>{
 const f=providerFixture('That cape just applied for its own dressing room.');await f.provider({frames,people:1,reason:'change',signal:new AbortController().signal});
 const input=f.calls[0].body.input[0].content;
 assert.deepEqual(input.filter(x=>x.type==='input_image').map(x=>x.detail),['low','low','high']);
 assert.match(input[1].text,/Frame 1\/3, 1200 ms/);assert.match(input[5].text,/Frame 3\/3, 0 ms.*NEWEST/);
 assert.match(input[0].text,/observable action changes/);assert.match(input[0].text,/ordered frames/);
 assert.equal(f.calls[0].body.max_output_tokens,450);assert.equal(f.calls[2].body.speed,1.03);
});
test('adult language needs explicit opt-in plus an adult tag; family override rejects strong language before speech',async()=>{
 assert.throws(()=>cleanHostLine('Well, shit. Even the cape has an agent.'));
 assert.doesNotThrow(()=>cleanHostLine('Well, shit. Even the cape has an agent.',{adultMode:true}));
 for(const [adultMode,reply,allowed]of [[false,'[[ADULT]] Well, shit.',false],[true,'[[FAMILY]] Well, shit.',false],[true,'Well, shit.',false],[true,'[[ADULT]] Well, shit. The cape booked its own dressing room.',true],[true,'[[FAMILY]] That cape has booked its own dressing room.',true]]){
  const f=providerFixture(reply),promise=f.provider({frames,adultMode,people:2,reason:'comment',signal:new AbortController().signal});
  if(allowed){const result=await promise;assert.doesNotMatch(result.text,/\[\[/);assert.equal(f.calls.length,3);}else{await assert.rejects(promise);assert.equal(f.calls.length,1);}
  if(adultMode){assert.match(f.calls[0].body.instructions,/not age verification/);assert.match(f.calls[0].body.instructions,/children\/mixed\/uncertain/);assert.match(f.calls[0].body.instructions,/Explicit sexual content is forbidden/);}
 }
});
test('changing adults-only mode cancels pending generation and stale speech; Stop and restart restore family default',async()=>{
 let finish,now=0;const inputs=[],results=[];
 const h=createHostSession({options:{apiKey:'synthetic',now:()=>now,provider:input=>{inputs.push(input);return new Promise(r=>{finish=r;});}},onChange(){},onRejected(){},onResult:r=>results.push(r)});
 assert.equal(h.setAdultMode(true),false);h.start('openai','auto');assert.equal(h.state.adultMode,false);assert.equal(h.setAdultMode(true),true);
 const oldSession=h.state.sessionId;const pending=h.observe({sessionId:oldSession,requestId:'r',reason:'arrival',people:2,frames:structuredClone(frames)},true);assert.equal(inputs[0].adultMode,true);
 h.setAdultMode(false);assert.equal(inputs[0].signal.aborted,true);finish({text:'Late adults-only line.'});await pending;assert.equal(results.length,0);assert.equal(h.state.requestCount,1);
 h.setAdultMode(true);h.action('quiet');assert.equal(h.state.adultMode,false);h.action('resume','openai','auto',true);assert.equal(h.state.adultMode,false);h.stop();
});
test('three-second cadence sends only fresh sequences, reports measured readiness, and never stores frames in state',async()=>{
 let now=0;const results=[],inputs=[],rejected=[];
 const h=createHostSession({options:{apiKey:'synthetic',now:()=>now,provider:async input=>{inputs.push(input);now+=240;return {text:'Your cape is working harder than the fog machine.'};}},onChange(){},onRejected:r=>rejected.push(r),onResult:r=>results.push(r)});h.start('openai','auto');
 const request=()=>({sessionId:h.state.sessionId,requestId:'r'+inputs.length,reason:'change',people:1,frames:structuredClone(frames)});
 const first=request();await h.observe(first,true);assert.equal(results[0].latencyMs,240);assert.equal(results[0].frameCount,3);assert.equal('frames' in first,false);h.idle({sessionId:h.state.sessionId,requestId:'r0'});
 now=2999;await h.observe(request(),true);assert.equal(inputs.length,1);now=3000;await h.observe(request(),true);assert.equal(inputs.length,2);assert.equal(JSON.stringify(h.state).includes('data:image'),false);h.stop();
});

test('late completed generation is discarded before caption or audio playback',async()=>{
 let now=0;const results=[];const h=createHostSession({options:{apiKey:'synthetic',now:()=>now,provider:async()=>{now=12001;return {text:'An outdated action.',audio:{mime:'audio/wav',base64:'AA=='}};}},onChange(){},onRejected(){},onResult:r=>results.push(r)});
 h.start('openai','auto');await h.observe({sessionId:h.state.sessionId,requestId:'r',reason:'arrival',people:1,frames:structuredClone(frames)},true);
 assert.equal(results[0].stale,true);assert.equal(results[0].silent,true);assert.equal(results[0].text,'');assert.equal(results[0].audio,undefined);h.stop();
});
