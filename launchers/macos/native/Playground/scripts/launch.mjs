import {createPlaygroundServer} from '../server.mjs';
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const port=Number(process.env.PLAYGROUND_PORT||4318);
const url=`http://127.0.0.1:${port}`;
const open=()=>{if(process.env.PLAYGROUND_NO_BROWSER==='1')return;const proc=spawn('/usr/bin/open',['-a','Google Chrome',url],{stdio:'ignore'});proc.on('error',()=>console.log(`Open ${url} in Google Chrome.`));};
try{
  await access(fileURLToPath(new URL('../dist/index.html',import.meta.url)));
  await access(fileURLToPath(new URL('../dist/models/pose_landmarker_lite.task',import.meta.url)));
  let existing=null;try{existing=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200)}).then(r=>r.json());}catch{}
  if(existing){
    if(existing.edition!=='simple-v1'||existing.version!=='1.0.1'||!existing.ok||!existing.localOnly||!existing.offlineAssetsReady)throw new Error(`Port ${port} is occupied by a different or incomplete app. This launcher has left it running.`);
    console.log('Simple Playground V1 is already running. Opening your control room.');open();
  }
  else {
    const app=await createPlaygroundServer({port});
    console.log(`\nSIMPLE PLAYGROUND V1\n\nControl room: ${url}\n\nKeep this window open while you play.\nPress Control-C here to stop the local app.\nNo internet connection is needed.\n`);open();
    const shutdown=async()=>{await app.close();process.exit(0);};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  }
}catch(error){console.error(`Could not start Simple Playground V1: ${error.message}\nKeep the entire app folder together. If port ${port} is in use, close the other local app and try again.`);process.exitCode=1;}
