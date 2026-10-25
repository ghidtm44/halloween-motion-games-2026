import {createPlaygroundServer} from '../server.mjs';
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const url='http://127.0.0.1:4317';
const open=()=>{const proc=spawn('/usr/bin/open',['-a','Google Chrome',url],{stdio:'ignore'});proc.on('error',()=>console.log(`Open ${url} in Google Chrome.`));};
try{
  await access(fileURLToPath(new URL('../dist/index.html',import.meta.url)));
  await access(fileURLToPath(new URL('../dist/models/pose_landmarker_lite.task',import.meta.url)));
  let existing=null;try{existing=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200)}).then(r=>r.json());}catch{}
  if(existing?.ok&&existing?.localOnly&&existing?.offlineAssetsReady){
    if(existing.version!=='1.1.0')throw new Error('An older Moonlight Motion server is still running. Press Control-C in its launcher window, then open this launcher again.');
    console.log('Moonlight Motion is already running. Opening your control room.');open();}
  else {
    const app=await createPlaygroundServer({port:4317});
    console.log(`\nMOONLIGHT MOTION\n\nControl room: ${url}\n\nKeep this window open while you play.\nPress Control-C here to stop the local app.\nNo internet connection is needed.\n`);open();
    const shutdown=async()=>{await app.close();process.exit(0);};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  }
}catch(error){console.error(`Could not start Moonlight Motion: ${error.message}\nKeep the entire app folder together. If port 4317 is in use, close the other local app and try again.`);process.exitCode=1;}
