import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
for(const ownApp of [true,false])test(`launcher ${ownApp?'reuses Simple V1':'leaves a different app untouched'}`,async t=>{
  const health={ok:true,localOnly:true,offlineAssetsReady:true,version:ownApp?'1.0.1':'1.1.0',...(ownApp?{edition:'simple-v1'}:{})};
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(health));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(done=>server.close(done)));
  const port=server.address().port;
  const child=spawn(process.execPath,['scripts/launch.mjs'],{cwd:root,env:{...process.env,PLAYGROUND_PORT:String(port),PLAYGROUND_NO_BROWSER:'1'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const timeout=setTimeout(()=>child.kill('SIGTERM'),10000);
  const [code]=await once(child,'exit');clearTimeout(timeout);
  assert.equal(code,ownApp?0:1,output);
  assert.match(output,ownApp?/Simple Playground V1 is already running/:/different or incomplete app/);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(),health,'Existing app must remain running and unchanged');
});
