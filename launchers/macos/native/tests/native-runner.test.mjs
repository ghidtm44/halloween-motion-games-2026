import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from '../Playground/node_modules/ws/wrapper.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const playground=resolve(root,'Playground');
const runtime=resolve(playground,'runtime/node');
const reports=[];
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function until(check,timeout=10000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const result=check();if(result)return result;await pause(15);}
  throw new Error('Timed out waiting for local runner lifecycle event.');
}
async function fixture(t){const directory=await mkdtemp(resolve(tmpdir(),'playground-native-runner-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
function launch(t,directory,env={}){
  const child=spawn(runtime,['scripts/native-runner.mjs'],{cwd:playground,env:{...process.env,PORT:'0',PLAYGROUND_STATE_FILE:resolve(directory,'state.json'),...env},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',pending='',closed=null;
  const messages=[];
  child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{stdout+=chunk;pending+=chunk;let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);try{messages.push(JSON.parse(line));}catch{}}});
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.on('error',error=>{stderr+=error.message;});
  const exited=new Promise(done=>child.once('close',(code,signal)=>{closed={code,signal};done(closed);}));
  t.after(async()=>{if(!closed){child.stdin.end();try{await until(()=>closed,1200);}catch{child.kill('SIGKILL');await exited;}}});
  return {child,messages,exited,output:()=>({stdout,stderr}),closed:()=>closed,
    ready:()=>until(()=>{const result=messages.find(message=>message.type==='ready');if(result)return result;if(closed)throw new Error('Runner exited before readiness: '+stderr);}),
    exit:()=>until(()=>closed,7000)};
}
async function assertClosedPort(url){await assert.rejects(fetch(url+'/api/health',{signal:AbortSignal.timeout(500)}));}
async function statePatch(url,patch){
  const ws=new WebSocket(url.replace(/^http/,'ws')+'/sync');
  let response=null,error=null,sent=false;
  ws.on('error',caught=>{error=caught;});
  ws.on('open',()=>ws.send(JSON.stringify({type:'hello',role:'admin',clientId:'native-runner-lifecycle-test'})));
  ws.on('message',data=>{const message=JSON.parse(data);if(message.type!=='state')return;if(!sent){sent=true;ws.send(JSON.stringify({type:'patch',patch}));}else response=message.state;});
  try{return await until(()=>{if(error)throw error;return response;},2000);}finally{ws.close();}
}

test('bundled runner reports identity/assets and camera-off state; stdin EOF flushes state and closes',async t=>{
  const directory=await fixture(t);
  await writeFile(resolve(directory,'state.json'),JSON.stringify({cameraOn:true,demo:false,paused:true,scene:'depths'}));
  const running=launch(t,directory),ready=await running.ready();
  assert.equal(ready.pid,running.child.pid);assert.ok(ready.port>0);assert.equal(ready.url,`http://127.0.0.1:${ready.port}`);
  assert.equal(ready.edition,'simple-v1');assert.equal(ready.version,'1.0.1');assert.equal(ready.localOnly,true);assert.equal(ready.offlineAssetsReady,true);assert.equal(ready.cameraOn,false);
  const health=await fetch(ready.url+'/api/health').then(response=>response.json());
  assert.equal(health.edition,ready.edition);assert.equal(health.offlineAssetsReady,true);assert.equal(health.spookyHost,process.env.PLAYGROUND_EDITION!=='motion');
  const state=await fetch(ready.url+'/api/state').then(response=>response.json());
  assert.equal(state.settings.cameraOn,false);assert.equal(state.settings.demo,true);assert.equal(state.settings.paused,false);assert.equal(state.settings.scene,'depths');
  await statePatch(ready.url,{scene:'space'});
  const began=Date.now();running.child.stdin.end();assert.deepEqual(await running.exit(),{code:0,signal:null});
  await assertClosedPort(ready.url);
  const saved=JSON.parse(await readFile(resolve(directory,'state.json'),'utf8'));assert.equal(saved.scene,'space');assert.equal(saved.cameraOn,false);
  reports.push({test:'readiness-and-parent-EOF',passed:true,pid:ready.pid,port:ready.port,shutdownMs:Date.now()-began,checks:['bundled runtime','edition/version','local assets','camera-off startup','settings flush','listener closed']});
});

test('parent EOF during a blocked startup closes after initialization without announcing readiness',async t=>{
  const directory=await fixture(t),fifo=resolve(directory,'pending-state.fifo');
  assert.equal(spawnSync('/usr/bin/mkfifo',[fifo]).status,0);
  const running=launch(t,directory,{PLAYGROUND_STATE_FILE:fifo});
  await pause(150);
  assert.equal(running.messages.length,0);assert.equal(running.closed(),null);
  running.child.stdin.end();await pause(75);
  assert.equal(running.closed(),null,'Runner waits for bounded startup cleanup instead of abandoning it');
  const writer=await open(fifo,constants.O_WRONLY|constants.O_NONBLOCK);
  try{await writer.writeFile('{}');}finally{await writer.close();}
  const began=Date.now();assert.deepEqual(await running.exit(),{code:0,signal:null});
  assert.equal(running.messages.some(message=>message.type==='ready'),false);
  reports.push({test:'parent-EOF-during-startup',passed:true,shutdownAfterUnblockMs:Date.now()-began,readyEmitted:false});
});

for(const signal of ['SIGTERM','SIGINT'])test(`${signal} performs orderly shutdown`,async t=>{
  const directory=await fixture(t),running=launch(t,directory),ready=await running.ready();
  const began=Date.now();running.child.kill(signal);assert.deepEqual(await running.exit(),{code:0,signal:null});
  await assertClosedPort(ready.url);reports.push({test:signal,passed:true,shutdownMs:Date.now()-began});
});

test('port collision fails without stopping or changing the existing server',async t=>{
  const firstDirectory=await fixture(t),secondDirectory=await fixture(t);
  const first=launch(t,firstDirectory),ready=await first.ready();
  await statePatch(ready.url,{scene:'space'});
  const second=launch(t,secondDirectory,{PORT:String(ready.port)});
  assert.deepEqual(await second.exit(),{code:1,signal:null});assert.equal(second.messages.some(message=>message.type==='ready'),false);
  assert.match(second.output().stderr,/already in use/);
  assert.equal(first.closed(),null);
  const state=await fetch(ready.url+'/api/state').then(response=>response.json());assert.equal(state.settings.scene,'space');assert.equal(state.settings.cameraOn,false);
  first.child.stdin.end();assert.deepEqual(await first.exit(),{code:0,signal:null});
  reports.push({test:'port-collision',passed:true,existingPid:ready.pid,existingSettingsPreserved:true});
});

test('missing offline assets fail readiness and release the listener',async t=>{
  const directory=await fixture(t),dist=resolve(directory,'empty-dist');await mkdir(dist);
  const running=launch(t,directory,{PLAYGROUND_DIST:dist});assert.deepEqual(await running.exit(),{code:1,signal:null});
  assert.equal(running.messages.some(message=>message.type==='ready'),false);assert.match(running.output().stderr,/Offline vision assets are missing/);
  reports.push({test:'missing-assets',passed:true,readyEmitted:false});
});

test('parent EOF with permanently blocked startup is bounded',async t=>{
  const directory=await fixture(t),fifo=resolve(directory,'blocked-state.fifo');
  assert.equal(spawnSync('/usr/bin/mkfifo',[fifo]).status,0);
  const running=launch(t,directory,{PLAYGROUND_STATE_FILE:fifo});await pause(100);
  const began=Date.now();running.child.stdin.end();assert.deepEqual(await running.exit(),{code:null,signal:'SIGKILL'});
  const shutdownMs=Date.now()-began;assert.ok(shutdownMs>=4500&&shutdownMs<6500);assert.match(running.output().stderr,/within 5 seconds/);
  reports.push({test:'blocked-startup-deadline',passed:true,shutdownMs,readyEmitted:false});
});

after(async()=>{await mkdir(resolve(root,'evidence'),{recursive:true});await writeFile(resolve(root,'evidence/native-runner-lifecycle.json'),JSON.stringify({completedAt:new Date().toISOString(),runtime,realCameraUsed:false,tests:reports},null,2)+'\n');});
