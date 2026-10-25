import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,rm,readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const target=resolve(root,'work/portable-validation');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
const extracted=spawnSync('/usr/bin/ditto',['-x','-k',resolve(root,'../Simple Playground V1 - Mac.zip'),target],{stdio:'inherit'});assert.equal(extracted.status,0);
const app=resolve(target,'Simple Playground V1');
await assert.rejects(access(resolve(app,'node_modules/vite')));
await assert.rejects(access(resolve(app,'node_modules/@mediapipe')));
const child=spawn(resolve(app,'runtime/node'),['scripts/launch.mjs'],{cwd:app,env:{PATH:'/usr/bin:/bin',PLAYGROUND_PORT:'4348',PLAYGROUND_NO_BROWSER:'1'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
try{
 await new Promise((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Standalone runtime did not start: '+output)),10000);child.stdout.on('data',()=>{if(output.includes('Control room:')){clearTimeout(timeout);done();}});child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Runtime exited: '+code+' '+output));});});
 const origin='http://127.0.0.1:4348';const health=await fetch(origin+'/api/health').then(r=>r.json());assert.equal(health.offlineAssetsReady,true);assert.equal(health.edition,'simple-v1');assert.equal(health.version,'1.0.1');
 const manifest=await fetch(origin+'/models/manifest.json').then(r=>r.json());for(const file of manifest.files){const data=Buffer.from(await fetch(origin+'/'+file.path).then(r=>r.arrayBuffer()));assert.equal(data.length,file.bytes,file.path+' size');assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256,file.path+' hash');}
 const html=await fetch(origin).then(r=>r.text());assert.ok(html.includes('Moonlight Motion'));for(const [,path] of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g))assert.equal((await fetch(origin+path)).status,200);
 const state=await fetch(origin+'/api/state').then(r=>r.json());assert.equal(state.settings.cameraOn,false);assert.equal(state.settings.paused,false);
 console.log(JSON.stringify({passed:true,checks:['Fresh ZIP extraction','Bundled Mac ARM64 runtime starts with only system PATH','No development dependency installation','All model/WASM/runtime manifest hashes match','Built UI assets served','Camera-off/unpaused safe start'],offlineAssets:manifest.files.length},null,2));
}finally{const exited=new Promise(done=>child.once('exit',done));child.kill('SIGTERM');await exited;}
