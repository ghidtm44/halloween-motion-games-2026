import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createPlaygroundServer} from '../server.mjs';
test('legacy worlds migrate safely; motion edition has only three valid worlds and never starts host',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motion-edition-'));let app,ws,calls=0;
 try{
  for(const legacy of ['pumpkin','enchanted','midnight','spooky']){
   const stateFile=join(dir,'state.json');await writeFile(stateFile,JSON.stringify({scene:legacy,mirror:false,hostTone:25,cameraOn:true}));
   app=await createPlaygroundServer({port:0,stateFile,motionOnly:true,hostOptions:{apiKey:'unused-synthetic',provider:async()=>{calls++;return {text:'Never called'};}}});
   const base=`http://127.0.0.1:${app.port}`,state=()=>fetch(base+'/api/state').then(r=>r.json());let current=await state();
   assert.equal(current.settings.scene,'jungle');assert.equal(current.settings.mirror,false);assert.equal(current.settings.cameraOn,false);assert.equal(current.host.configured,false);assert.equal(current.motionOnly,true);
   const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.motionGames,true);assert.equal(health.spookyHost,false);
   ws=new WebSocket(base.replace('http:','ws:')+'/sync',{origin:base});await once(ws,'open');
   const exchange=async message=>{const response=once(ws,'message');ws.send(JSON.stringify(message));return JSON.parse((await response)[0].toString());};
   await exchange({type:'hello',role:'admin',clientId:'offline-test'});
   for(const patch of [{playDensity:-1},{playDensity:2},{musicVolume:2},{musicMuted:'yes'}])assert.equal((await exchange({type:'patch',patch})).type,'error');
   const atmosphere=await exchange({type:'patch',patch:{playDensity:.8,musicVolume:.4,musicMuted:true}});assert.equal(atmosphere.state.settings.playDensity,.8);assert.equal(atmosphere.state.settings.musicVolume,.4);assert.equal(atmosphere.state.settings.musicMuted,true);
   for(const scene of ['pumpkin','enchanted','midnight','spooky'])assert.equal((await exchange({type:'patch',patch:{scene}})).type,'error');
   for(const scene of ['jungle','depths','space']){const result=await exchange({type:'patch',patch:{scene}});assert.equal(result.state.settings.scene,scene);}
   for(const type of ['host-start','host-speak','host-action','host-observe'])assert.equal((await exchange({type,provider:'openai',action:'resume'})).type,'error');
   assert.equal(calls,0);ws.terminate();await app.close();ws=null;app=null;
  }
 }finally{ws?.terminate();await app?.close();await rm(dir,{recursive:true,force:true});}
});
