import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
const base=process.env.PLAYGROUND_URL||'http://127.0.0.1:4317';
if((await fetch(base+'/api/health').then(r=>r.json())).playerConnected)throw new Error('Close the player before running this isolated smoke test.');
await new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http:','ws:')+'/sync',{origin:base});let sent=false;ws.on('open',()=>ws.send(JSON.stringify({type:'hello',role:'admin',clientId:'browser-test-setup'})));ws.on('error',reject);ws.on('message',data=>{const message=JSON.parse(data);if(message.type!=='state')return;if(!sent){sent=true;ws.send(JSON.stringify({type:'patch',patch:{deviceId:'',cameraOn:false,demo:true,scene:'pumpkin',mode:'cutout',paused:false,mirror:true,motion:true,sensitivity:1,quality:'balanced'}}));}else{ws.close();resolve();}});});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:1440,height:1050},permissions:['camera']});
const errors=[],external=[],checks=[];
await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(base)&&!url.startsWith('data:')&&!url.startsWith('blob:')){external.push(url);return route.abort();}return route.continue();});
context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
try{
 const admin=await context.newPage();await admin.goto(base);await expect(admin.locator('#connection')).toContainText('ready');checks.push('admin local connection');
 const playerOpened=context.waitForEvent('page');await admin.locator('#open-player').click();const player=await playerOpened;
 // window.open may have arrived before the event listener; discover by URL below.
 let stage=player||context.pages().find(p=>p!==admin);if(!stage)throw new Error('Player window did not open');await stage.waitForLoadState();await expect(stage.locator('#duplicate')).toBeHidden();
 await expect(admin.locator('#monitor-label')).toHaveText('Player connected');checks.push('separate player & live preview');
 await admin.locator('[data-scene="enchanted"]').click();await expect.poll(async()=>stage.evaluate(async()=> (await fetch('/api/state').then(r=>r.json())).settings.scene)).toBe('enchanted');
 await stage.locator('#fullscreen').click();await expect.poll(()=>stage.evaluate(()=>!!document.fullscreenElement)).toBe(true);await admin.locator('[data-effect="candy"]').click();await admin.locator('[data-scene="midnight"]').click();await expect.poll(()=>stage.evaluate(()=>!!document.fullscreenElement)).toBe(true);checks.push('scene/effect admin controls retain player fullscreen');
 await stage.evaluate(()=>document.exitFullscreen());await admin.locator('#camera-toggle').click();await expect(admin.locator('#camera-note')).toContainText('fake',{timeout:20000});await expect.poll(()=>admin.locator('#camera-select option').count()).toBeGreaterThan(1);checks.push('camera capture, permission, enumeration');
 const cameraId=await admin.locator('#camera-select option').nth(1).getAttribute('value');await admin.locator('#camera-select').selectOption(cameraId);await expect(admin.locator('#camera-note')).toContainText('fake',{timeout:20000});checks.push('device selection reopens camera');
 await admin.locator('#mode').selectOption('camera');await expect(admin.locator('#status-note')).toContainText('overlay',{timeout:15000});
 await admin.locator('#pause').click();await expect(admin.locator('#pause')).toContainText('Resume');await admin.locator('#pause').click();checks.push('explicit overlay fallback & pause/resume');
 await admin.reload();await expect(admin.locator('[data-scene="midnight"]')).toHaveClass(/chosen/);await expect(admin.locator('#camera-toggle')).toContainText('Stop camera');checks.push('admin reload restores authoritative settings');
 const standby=await context.newPage();await standby.goto(base+'/?view=player');await expect(standby.locator('#duplicate')).toBeVisible();await stage.close();await expect(standby.locator('#duplicate')).toBeHidden({timeout:10000});checks.push('one camera owner & player takeover');
 await admin.locator('#camera-toggle').click();await expect(admin.locator('#camera-note')).toHaveText('Camera off',{timeout:10000});await expect.poll(()=>standby.locator('#camera-video').evaluate(v=>v.srcObject===null)).toBe(true);checks.push('camera tracks released on stop');
 await admin.locator('#demo-toggle').click();await admin.locator('[data-scene="pumpkin"]').click();await expect(admin.locator('#live-preview')).toBeVisible({timeout:10000});
 await expect.poll(()=>admin.locator('#live-preview').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await mkdir('work',{recursive:true});await admin.screenshot({path:'work/admin-smoke.png',fullPage:true});await standby.screenshot({path:'work/player-smoke.png'});
 await expect(admin.locator('#guide')).not.toBeVisible();await admin.locator('#guide-button').click();await expect(admin.locator('#guide')).toBeVisible();await admin.locator('.dialog-close').click();checks.push('setup guide');
 if(external.length)throw new Error('External runtime requests: '+external.join(', '));if(errors.length)throw new Error('Browser errors: '+errors.join('; '));checks.push('no non-local runtime requests; no browser exceptions');
 const report={passed:true,checks,externalRequests:external,browserErrors:errors,limitations:'Synthetic webcam fixture does not contain people. Real model assertions are in vision-smoke.mjs. Physical HDMI and real 2–3 person sessions need in-person testing.'};await writeFile('work/browser-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
