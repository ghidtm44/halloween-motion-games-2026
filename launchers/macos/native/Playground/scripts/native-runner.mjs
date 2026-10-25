import {writeSync} from 'node:fs';
import {createPlaygroundServer} from '../server.mjs';

// The native app owns stdin's write end. Losing it must never leave a server behind.
const SHUTDOWN_TIMEOUT_MS=5000;
let app=null,startupDone=false,stopping=false,closing=false,exitCode=0,deadline=null;
const error=message=>{try{writeSync(2,JSON.stringify({type:'error',message})+'\n');}catch{}};
function finish(){clearTimeout(deadline);process.exit(exitCode);}
async function close(){
  if(closing||!startupDone)return;
  closing=true;
  try{await app?.close();}
  catch{exitCode=1;error('The local server could not shut down cleanly.');}
  finish();
}
function stop(){
  if(stopping)return;
  stopping=true;
  // process.exit can itself wait on a blocked filesystem worker; the hard deadline
  // must also cover stuck startup I/O after the native owner has disappeared.
  deadline=setTimeout(()=>{error('The local server did not finish shutting down within 5 seconds.');process.kill(process.pid,'SIGKILL');},SHUTDOWN_TIMEOUT_MS);
  if(startupDone)void close();
}
process.stdin.once('end',stop);
process.stdin.once('error',stop);
process.once('SIGINT',stop);
process.once('SIGTERM',stop);
process.stdin.resume();

let ready=null;
try{
  const portText=process.env.PORT??'4318';
  if(!/^\d+$/.test(portText)||Number(portText)>65535)throw new Error('PORT must be an integer from 0 to 65535.');
  const port=Number(portText);
  app=await createPlaygroundServer({port,stateFile:process.env.PLAYGROUND_STATE_FILE||undefined});
  if(!stopping){
    const url=`http://127.0.0.1:${app.port}`;
    const [health,state]=await Promise.all([
      fetch(url+'/api/health',{signal:AbortSignal.timeout(3000)}).then(response=>response.json()),
      fetch(url+'/api/state',{signal:AbortSignal.timeout(3000)}).then(response=>response.json()),
    ]);
    if(!health.ok||health.edition!=='simple-v1'||(process.env.PLAYGROUND_EDITION==='motion'?!health.motionGames:!health.spookyHost)||!health.localOnly)throw new Error('The local server did not report the expected Spooky Host Simple Playground identity.');
    if(!health.offlineAssetsReady)throw new Error('Offline vision assets are missing. Keep the complete app bundle together.');
    if(state.settings?.cameraOn!==false)throw new Error('The local server did not start with the camera off.');
    ready={type:'ready',pid:process.pid,port:app.port,url,edition:health.edition,version:health.version,localOnly:health.localOnly,offlineAssetsReady:health.offlineAssetsReady,cameraOn:false};
  }
}catch(caught){
  exitCode=1;
  if(caught?.code==='EADDRINUSE')error(`Port ${process.env.PORT??'4318'} is already in use. The existing server was left running.`);
  else error(String(caught?.message||'The local server could not start.').replace(/[\r\n]+/g,' ').slice(0,400));
  stop();
}
startupDone=true;
if(stopping)await close();
else{
  try{writeSync(1,JSON.stringify(ready)+'\n');}
  catch{exitCode=1;stop();}
}
