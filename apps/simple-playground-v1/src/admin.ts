import {SyncClient} from './sync';
import {HalloweenScene} from './scene';
import {DEFAULT_SETTINGS,type Settings,type PlayerStatus} from './types';
const icon=(name:string)=>({moon:'☾',spark:'✦',camera:'◉',screen:'▣',wand:'✧',leaf:'❧'}[name]??'✦');
export function mountAdmin(){
  document.title='Simple Playground V1 · Control room';
  document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <div class="app-shell">
    <aside class="sidebar"><a class="brand" href="/"><span class="brand-mark">☾</span><span>moonlight<span class="brand-bottom">MOTION PLAYGROUND</span></span></a>
      <div class="side-label">YOUR PLAYGROUND</div><div class="nav-item selected">${icon('screen')} <span>Control room</span><span class="nav-dot"></span></div>
      <button class="nav-item" id="help-link">${icon('spark')} <span>Setup & field guide</span></button>
      <div class="side-art"><div class="little-moon">☾</div><span>A little movement.<br>A lot of magic.</span><div class="side-pumpkins">✦ &nbsp; ◒ &nbsp; ✦</div></div>
      <div class="local-card"><span class="green-dot"></span><strong>Made for this Mac</strong><p>Offline worlds stay local.<br>Host AI starts only when you choose.</p></div><div class="sidebar-footer">HALLOWEEN EDITION <span>01</span></div>
    </aside>
    <main class="main"><header class="topbar"><div class="breadcrumb">SIMPLE PLAYGROUND V1 <span>/</span> CONTROL ROOM</div><div class="connection-pill" id="connection">Connecting locally…</div></header>
    <section class="heading"><div><div class="eyebrow">LET THE GOOD SPOOKS BEGIN</div><h1>Your little world of <em>whoa.</em></h1><p>Pick a world, step into the frame, and make some magic.</p></div><button class="primary" id="open-player">Open player <span>↗</span></button></section>
    <div class="dashboard-grid"><section class="stage-card"><div class="section-top"><div><span class="live-dot"></span><strong>Stage monitor</strong><span class="muted small" id="monitor-label">Scene preview</span></div><button class="text-button" id="pause">Ⅱ Pause</button></div>
    <div class="monitor"><canvas id="preview" width="960" height="540"></canvas><img id="live-preview" alt="Live local player preview" hidden><div class="monitor-badge" id="monitor-badge">SCENE PREVIEW · CAMERA OFF</div><div class="monitor-footer"><span id="scene-label">01 / Escape from Monkey Island</span><span>✧ MOVE TO MAKE MAGIC</span></div></div>
    <div class="telemetry"><div><span class="metric" id="people">—</span><span>people in frame <small>/ 3 max</small></span></div><div><span class="metric" id="fps">—</span><span>stage fps</span></div><div><span class="metric" id="model-state">Standby</span><span id="model-detail">Local vision engine</span></div><span class="offline-tag" id="network-tag">⌁ LOCAL ONLY</span></div></section>
    <section class="camera-card panel"><div class="section-top"><h2>Camera & stage</h2><span>${icon('camera')}</span></div><label for="camera-select">VIDEO INPUT</label><select id="camera-select"><option value="">Default camera</option></select><p class="field-note" id="camera-note">Start the camera to reveal available inputs.</p>
    <button class="primary full" id="camera-toggle">Start camera <span>↗</span></button><button class="secondary full" id="demo-toggle">Run background only</button>
    <div class="divider"></div><label for="mode">PEOPLE APPEARANCE</label><select id="mode"><option value="cutout">Magic cutout · combined mask</option><option value="camera">Camera overlay · reliable fallback</option><option value="silhouette">Glowing silhouettes</option></select>
    <label class="toggle-row"><span>Mirror camera</span><input id="mirror" type="checkbox" checked><span class="switch"></span></label><label class="toggle-row"><span>Tracked interactions</span><input id="motion" type="checkbox" checked><span class="switch"></span></label>
    <div class="field-row"><label for="quality">PERFORMANCE</label><select id="quality"><option value="balanced">Balanced</option><option value="performance">Lighter load</option></select></div>
    <div class="warning" id="status-note">Open the player to begin. It owns the camera and can stay fullscreen on your TV.</div></section>
    <section class="worlds"><div class="section-title"><h2>Choose your world</h2><span>04 WORLDS TO EXPLORE</span></div><div class="scene-grid">
    <button class="scene-card chosen" data-scene="jungle"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Escape from Monkey Island</strong><small>A jungle trail of playful challenges</small></span><span class="scene-check">✓</span></span></button>
    <button class="scene-card" data-scene="depths"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Escape from Shark Depths</strong><small>Travel the reef · pearls & playful sharks</small></span><span class="scene-check">✓</span></span></button>
    <button class="scene-card" data-scene="space"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Alien Attack</strong><small>A cosmic road of crystals & surprises</small></span><span class="scene-check">✓</span></span></button>
    <button class="scene-card" data-scene="spooky"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Spooky Host</strong><small>A crystal ball with personality</small></span><span class="scene-check">✓</span></span></button></div></section>
    <section class="panel" id="world-atmosphere"><div class="section-title"><h2>Bring the world to life</h2><span>LIVE CONTROLS</span></div><label for="play-density">Challenge pace · <span id="density-label">Playful</span></label><input id="play-density" type="range" min="0" max="1" step="0.1" value="0.5"><p class="host-note">Relaxed to lively. One clear challenge at a time; changes apply to the next challenge.</p><label for="music-volume">WORLD MUSIC</label><input id="music-volume" type="range" min="0" max="1" step="0.05" value="0.3"><label class="toggle-row"><span>Mute music & musical rewards</span><input id="music-muted" type="checkbox"><span class="switch"></span></label><p class="host-note" id="music-note">Click once inside the player to enable music. Sound follows the Mac’s selected output.</p></section>
    <section class="host-panel panel" id="host-panel" hidden>
      <div class="host-heading"><div><div class="eyebrow">AN AUDIENCE WITH THE ORACLE</div><h2>Professor Bumblespook</h2><p>The resident oracle of the neighborhood. A little spellbinding attention.</p></div><span class="host-status" id="host-status" role="status">Session off</span></div>
      <div class="host-columns"><div><label for="host-control-mode">HOST CONTROL</label><select id="host-control-mode"><option value="operator">Operator · speak on click</option><option value="auto">Auto · watch & interact</option></select><p class="host-note" id="host-mode-note">You choose every moment. Each Speak click produces one remark.</p><label for="host-provider">THE PERFORMANCE</label><select id="host-provider"><option value="mock">Scripted rehearsal · offline</option><option value="openai">AI host · OpenAI</option></select><p id="host-provider-note" class="host-note">Try the character with scripted lines. No camera or API key needed.</p>
      <p class="host-consent" id="host-consent" hidden>Starting an AI session sends occasional camera images to OpenAI to notice costumes and make gentle jokes. The voice is AI-generated. No microphone is used. The app does not record images or conversations; OpenAI’s data policies apply.</p>
      <div class="host-actions"><button class="primary" id="host-start" hidden>Start automatic</button><button class="primary" id="host-speak">Speak ✦</button><button class="secondary" id="host-stop" disabled>Stop session</button></div><div class="host-rescue"><label>DIRECT THE ENCOUNTER</label><div class="host-rescue-buttons"><button class="secondary" id="host-welcome">Welcome this group</button><button class="secondary" id="host-challenge">Give them a challenge</button><button class="secondary" id="host-farewell">Wrap it up</button><button class="secondary" id="host-quiet">Quiet now</button><button class="primary" id="host-resume" hidden>Resume host</button></div><p class="host-note">Cues replace the current line. Challenges wait for a clear new gesture. Wrap it up gives one farewell, then waits for new arrivals. Quiet now stays quiet until Resume.</p></div><p class="host-note" id="host-note">Open the player first. Click the crystal ball once for sound and fullscreen.</p></div>
      <div class="host-sound"><label for="host-tone">PERFORMANCE TONE</label><div class="host-tone-label" id="host-tone-label">Little monsters</div><input id="host-tone" type="range" min="0" max="100" step="1" value="0" aria-describedby="host-tone-note"><div class="host-tone-ends"><span>Kid magic</span><span>After dark</span></div><p class="host-note" id="host-tone-note">Gentle wonder for the early crowd. Change this any time.</p><label class="toggle-row"><span>NSFW · adults-only comedy</span><input id="host-adult-mode" type="checkbox"><span class="switch"></span></label><p class="host-note">By enabling, I confirm this is an adult-only audience. Allows strong language and non-graphic innuendo, never sexual remarks about visitors. Children, mixed or uncertain groups get clean material. Resets each new session. Turn off for safe mode, or use Quiet now.</p><label for="host-effects">VOICE MAGIC · <span id="host-effects-label">40%</span></label><input id="host-effects" type="range" min="0" max="1" step="0.05" value="0.4" aria-describedby="host-effects-note"><label class="toggle-row"><span>Dry voice · bypass effects</span><input id="host-effects-bypass" type="checkbox"><span class="switch"></span></label><p class="host-note" id="host-effects-note">A short ethereal echo and spacious reverb on the AI voice. Adjust live; 0% is dry. Scripted rehearsal uses your Mac’s local voice without these effects.</p><label for="host-volume">HOST VOLUME</label><input id="host-volume" type="range" min="0" max="1" step="0.05" value="0.8"><label class="toggle-row"><span>Mute voice</span><input id="host-muted" type="checkbox"><span class="switch"></span></label><label class="toggle-row"><span>Control-room captions</span><input id="host-captions" type="checkbox" checked><span class="switch"></span></label><p class="host-note">The face follows up to three detected guests. The TV always shows the crystal ball, never the camera picture. Start camera to enable gaze tracking. Click the ball in the player once to enable sound and fullscreen. The TV stays free of text.</p><p class="host-note" id="host-audio-note" role="status"></p><p class="host-transcript" id="host-transcript" aria-live="polite"></p></div></div>
    </section>
    <section class="effects panel"><div class="section-title"><h2>A little extra magic</h2><span>INSTANT EFFECTS</span></div><div class="effects-grid"><button data-effect="candy"><span class="effect-icon candy">▱</span><strong>Confetti shower</strong><small>Operator celebration</small><kbd>1</kbd></button><button data-effect="bats"><span class="effect-icon bats">⌁</span><strong>Color burst</strong><small>Operator celebration</small><kbd>2</kbd></button><button data-effect="magic"><span class="effect-icon magic">✧</span><strong>Firework sparkle</strong><small>Operator celebration</small><kbd>3</kbd></button></div><div class="sensitivity"><label for="sensitivity">Movement sensitivity</label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="1"><span id="sensitivity-value">1.0×</span></div></section>
    </div><footer class="bottom-note"><span>✦ Built for little monsters and big imaginations.</span><button class="text-button" id="guide-button">TV setup guide ↗</button></footer></main>
  </div><dialog id="guide"><button class="dialog-close" aria-label="Close guide">×</button><div class="eyebrow">READY, SET, BOO</div><h2>Bring your playground to life.</h2><ol><li><strong>Test on this screen.</strong> Open player, then start camera. Allow camera access in Chrome and macOS if asked. Place the windows side by side.</li><li><strong>Give everyone room.</strong> Stand back so 2–3 full bodies fit, with space between them. Reach for the large glowing collectibles. Gentle ducks, side-steps or a small rise from a knee bend can earn a sparkle. No running or high jumps are needed.</li><li><strong>Connect the TV.</strong> Use HDMI and choose an extended display in System Settings → Displays. Drag the player window onto the TV, then click the player for fullscreen, or press F (the crystal ball also unlocks host sound).</li><li><strong>Keep controls here.</strong> Return to this admin window on the Mac. Effects and scene changes reach the TV without leaving fullscreen. Esc exits fullscreen.</li></ol><p class="guide-note">Cutouts use one combined foreground mask. Overlapping people, capes, masks, and fast motion can confuse tracking. Choose Camera overlay if anyone disappears. The road keeps moving when nobody is present; one large challenge appears at a time, with breathing room between them. Keep Chrome and the local launcher running; the three motion worlds and scripted host rehearsal need no internet. The explicitly started AI host uses OpenAI.</p><p>Shortcuts: <b>1</b> confetti · <b>2</b> color burst · <b>3</b> sparkles · <b>Space</b> pause (admin) · <b>F</b> fullscreen (player).</p></dialog><div id="toast" role="status"></div>`;
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const sync=new SyncClient('admin');let settings:Settings={...DEFAULT_SETTINGS};let playerWindow:Window|null=null;let status:PlayerStatus|null=null;let previewAt=0;
  const previewScene=new HalloweenScene($<HTMLCanvasElement>('preview'));
  $<HTMLImageElement>('live-preview').onload=()=>{previewAt=performance.now();};
  $<HTMLImageElement>('live-preview').onerror=()=>{previewAt=0;};
  const thumbs=[...document.querySelectorAll<HTMLButtonElement>('[data-scene]')].map(el=>({el,renderer:new HalloweenScene(el.querySelector('canvas')!)}));
  const toast=(message:string)=>{$('toast').textContent=message;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),3500);};
  const patch=(p:Partial<Settings>)=>{if(!sync.patch(p))toast('Local connection is reconnecting. Please try again.');};
  function openPlayer(){
    if(sync.state.playerConnected){if(playerWindow&&!playerWindow.closed)playerWindow.focus();else toast('A player is already connected. Find its window to move it to the TV.');return;}
    playerWindow=window.open('/?view=player',`moonlight-player-${location.port}`,'popup=yes,width=1200,height=760');
    if(!playerWindow)toast('Allow pop-ups for this local app, then open the player again.');
  }
  $('open-player').onclick=openPlayer;
  $('camera-toggle').onclick=()=>{if(!sync.state.playerConnected&&!settings.cameraOn)openPlayer();patch({cameraOn:!settings.cameraOn,demo:false,paused:false});};
  $('demo-toggle').onclick=()=>{if(!sync.state.playerConnected)openPlayer();patch({demo:true,cameraOn:false,paused:false});};
  $<HTMLInputElement>('play-density').oninput=()=>patch({playDensity:Number($<HTMLInputElement>('play-density').value)});
  $<HTMLInputElement>('music-volume').oninput=()=>patch({musicVolume:Number($<HTMLInputElement>('music-volume').value)});
  $<HTMLInputElement>('music-muted').onchange=()=>patch({musicMuted:$<HTMLInputElement>('music-muted').checked});
  $('pause').onclick=()=>patch({paused:!settings.paused});
  for(const id of ['mirror','motion'])$<HTMLInputElement>(id).onchange=()=>patch({[id]:$<HTMLInputElement>(id).checked});
  $<HTMLSelectElement>('camera-select').onchange=()=>patch({deviceId:$<HTMLSelectElement>('camera-select').value});
  $<HTMLSelectElement>('mode').onchange=()=>patch({mode:$<HTMLSelectElement>('mode').value as Settings['mode']});
  $<HTMLSelectElement>('quality').onchange=()=>patch({quality:$<HTMLSelectElement>('quality').value as Settings['quality']});
  $<HTMLInputElement>('sensitivity').oninput=()=>{$('sensitivity-value').textContent=Number($<HTMLInputElement>('sensitivity').value).toFixed(1)+'×';};
  $<HTMLInputElement>('sensitivity').onchange=()=>patch({sensitivity:Number($<HTMLInputElement>('sensitivity').value)});
  thumbs.forEach(({el})=>el.onclick=()=>patch({scene:el.dataset.scene as Settings['scene']}));
  const provider=$<HTMLSelectElement>('host-provider');let providerChosen=false;
  const toneLabel=(tone:number)=>tone<25?'Little monsters':tone<50?'Family mischief':tone<75?'Twilight mischief':'After dark';
  function showTone(tone:number){$('host-tone-label').textContent=toneLabel(tone);$<HTMLInputElement>('host-tone').setAttribute('aria-valuetext',toneLabel(tone));$('host-tone-note').textContent=tone<25?'Clean, quick costume snark with an obvious playful wink.':tone<50?'Playful costume roasts and pretend rivalry for the whole family.':tone<75?'Sharper dry wit, costume challenges and mock-grand judgments.':'Bolder, sharper costume roasts. Strong language and non-graphic innuendo require the separate adults-only switch; uncertain audiences stay clean.';}
  function showVoice(){const s=status;$('host-audio-note').textContent=s?.hostVoiceEnabled?(s.hostNotice||'Voice enabled'):'For sound: click the crystal ball in the player once. This also enters fullscreen.';$('host-transcript').hidden=!settings.hostCaptions;$('host-transcript').textContent=s?.hostCaption||'';}
  function updateHost(){
    const host=sync.state.host,active=!!host?.active,isHost=settings.scene==='spooky';
    $('host-panel').hidden=!isHost;
    if(active)provider.value=host!.provider;
    else if(!providerChosen&&host?.configured){provider.value='openai';providerChosen=true;}
    const online=provider.value==='openai',automatic=settings.hostControlMode==='auto';provider.disabled=active;
    $<HTMLSelectElement>('host-control-mode').value=settings.hostControlMode;
    $('host-mode-note').textContent=automatic?'Start Auto once: arrivals and scene changes prompt fresh observations, with fresh short frame sequences and follow-ups about every 5 seconds while guests remain. Remarks never overlap; at least 3 seconds between requests.':'You choose every moment. Each Speak click uses up to three recent frames for one remark. Arrivals and timers never make it speak.';
    $('host-consent').hidden=!online;
    $('host-consent').textContent=(automatic?'Starting Auto sends sequences of up to 3 recent camera frames to OpenAI throughout the performance (up to about 20 observations per minute, usually fewer). More images and frequent turns increase API usage.':'Pressing Speak sends up to 3 recent camera frames to OpenAI for a specific observation.')+' The voice is AI-generated. No microphone is used. The app does not record images or conversations; OpenAI’s data policies apply.';
    $('host-provider-note').textContent=online?(host?.configured?'AI is configured. Start camera, click the ball on the TV for sound, then Start watching.':'AI needs a server-side key before it can run. Scripted rehearsal is available now.'):'Scripted lines, with an installed local voice when available. No images are sent.';
    $('host-status').textContent=active?(host!.phase==='thinking'?'Pondering…':online?'AI session on':'Rehearsal on'):'Session off';
    $('host-status').classList.toggle('active',active);
    $('host-start').hidden=!automatic;
    $('host-start').textContent=active?'Watching guests':'Start watching';
    $('host-speak').textContent=host?.phase==='thinking'?'Working…':active?'Speak now ✦':'Speak ✦';
    const unavailable=!sync.connected||!sync.state.playerConnected||settings.paused||(online&&(!host?.configured||!settings.cameraOn));
    $<HTMLButtonElement>('host-start').disabled=unavailable||active;
    $<HTMLButtonElement>('host-speak').disabled=unavailable||(automatic&&!active)||host?.phase==='thinking';
    $<HTMLButtonElement>('host-stop').disabled=!active;
    for(const name of ['welcome','challenge','farewell'])$<HTMLButtonElement>('host-'+name).disabled=unavailable||!active||!!host?.quiet||(name!=='welcome'&&!!host?.wrapped);
    $<HTMLButtonElement>('host-quiet').disabled=!sync.connected||!!host?.quiet;
    $('host-resume').hidden=!host?.quiet;$<HTMLButtonElement>('host-resume').disabled=unavailable;
    if(host?.quiet){$<HTMLButtonElement>('host-speak').disabled=true;$('host-start').hidden=true;}
    if(host?.wrapped)$<HTMLButtonElement>('host-speak').disabled=true;
    $('host-note').textContent=!sync.state.playerConnected?'Open the player first. Click the crystal ball once for sound and fullscreen.':(online&&!settings.cameraOn?'Start camera before requesting a fresh image.':(host?.message||'Ready when you are.')+` · ${host?.requestCount||0} / ${host?.limit||1200} observations this session.`);
    $('network-tag').textContent=active&&host?.provider==='openai'?'✦ AI SESSION ON':'⌁ LOCAL ONLY';
    if(document.activeElement!==$('host-tone'))$<HTMLInputElement>('host-tone').value=String(settings.hostTone);
    showTone(Number($<HTMLInputElement>('host-tone').value));showVoice();
    if(document.activeElement!==$('host-effects'))$<HTMLInputElement>('host-effects').value=String(settings.hostEffects);
    $('host-effects-label').textContent=Math.round(Number($<HTMLInputElement>('host-effects').value)*100)+'%';
    $<HTMLInputElement>('host-effects-bypass').checked=settings.hostEffectsBypass;
    $<HTMLInputElement>('host-volume').value=String(settings.hostVolume);
    $<HTMLInputElement>('host-muted').checked=settings.hostMuted;
    $<HTMLInputElement>('host-adult-mode').checked=settings.hostAdultMode;
    $<HTMLInputElement>('host-adult-mode').disabled=!active||!!host?.quiet;
    $<HTMLInputElement>('host-captions').checked=settings.hostCaptions;
    $<HTMLSelectElement>('mode').disabled=isHost;
    if(isHost)$('status-note').textContent='Camera tracking directs the oracle’s gaze. Camera pictures never appear on this stage.';
  }
  provider.onchange=()=>{providerChosen=true;updateHost();};
  $<HTMLInputElement>('host-tone').oninput=()=>showTone(Number($<HTMLInputElement>('host-tone').value));
  $<HTMLInputElement>('host-tone').onchange=()=>patch({hostTone:Number($<HTMLInputElement>('host-tone').value)});
  $<HTMLSelectElement>('host-control-mode').onchange=()=>patch({hostControlMode:$<HTMLSelectElement>('host-control-mode').value as Settings['hostControlMode']});
  $('host-start').onclick=()=>{if(!sync.send({type:'host-start',provider:provider.value}))toast('Reconnect to start the host.');};
  for(const name of ['welcome','challenge','farewell','quiet','resume'])$('host-'+name).onclick=()=>sync.send({type:'host-action',action:name,provider:provider.value});
  $('host-stop').onclick=()=>sync.send({type:'host-stop'});
  $('host-speak').onclick=()=>{if(!sync.send({type:'host-speak',provider:provider.value}))toast('Reconnect to speak.');};
  $<HTMLInputElement>('host-effects').oninput=()=>{const value=Number($<HTMLInputElement>('host-effects').value);$('host-effects-label').textContent=Math.round(value*100)+'%';patch({hostEffects:value});};
  $<HTMLInputElement>('host-effects-bypass').onchange=()=>patch({hostEffectsBypass:$<HTMLInputElement>('host-effects-bypass').checked});
  $<HTMLInputElement>('host-volume').oninput=()=>patch({hostVolume:Number($<HTMLInputElement>('host-volume').value)});
  $<HTMLInputElement>('host-adult-mode').onchange=()=>patch({hostAdultMode:$<HTMLInputElement>('host-adult-mode').checked});
  $<HTMLInputElement>('host-muted').onchange=()=>patch({hostMuted:$<HTMLInputElement>('host-muted').checked});
  $<HTMLInputElement>('host-captions').onchange=()=>patch({hostCaptions:$<HTMLInputElement>('host-captions').checked});
  const effect=(kind:'candy'|'bats'|'magic')=>{if(!sync.state.playerConnected){toast('Open the player to send an effect.');return;}if(!sync.effect(kind))toast('Reconnect the local player to send an effect.');};
  document.querySelectorAll<HTMLButtonElement>('[data-effect]').forEach(el=>el.onclick=()=>effect(el.dataset.effect as 'candy'|'bats'|'magic'));
  const guide=$<HTMLDialogElement>('guide');for(const id of ['help-link','guide-button'])$(id).onclick=()=>guide.showModal();guide.querySelector<HTMLButtonElement>('.dialog-close')!.onclick=()=>guide.close();
  window.onkeydown=e=>{if((e.target as HTMLElement).matches('input,select,textarea')||guide.open)return;if(['1','2','3'].includes(e.key))effect((['candy','bats','magic'] as const)[Number(e.key)-1]);if(e.code==='Space'){e.preventDefault();patch({paused:!settings.paused});}};
  function updateStatus(next:PlayerStatus|null){status=next;if(!status)return;showVoice();
    $('music-note').textContent=status.musicReady?'Music enabled. Mute and volume apply immediately; Pause also silences music.':'Click once inside the player to enable music. Sound follows the Mac’s selected output.';
    $('people').textContent=String(status.people);$('fps').textContent=String(status.fps||'—');
    $('model-state').textContent=/ready/i.test(status.model)?'Ready':/load|init/i.test(status.model)?'Loading':'Standby';$('model-detail').textContent=status.inferenceMs?`${Math.round(status.inferenceMs)} ms / inference`:status.model||'Local vision engine';
    $('camera-note').textContent=status.camera||'Choose a camera input.';$('status-note').textContent=status.error||status.fallback||(settings.demo?'Scene demo is running. Start camera to step inside.':'All set. Keep full bodies visible and leave space between players.');
    const sel=$<HTMLSelectElement>('camera-select');const current=JSON.stringify(status.devices);if(sel.dataset.devices!==current){sel.dataset.devices=current;sel.replaceChildren(new Option('Default camera',''),...status.devices.map(d=>new Option(d.label||'Camera',d.deviceId)));}sel.value=settings.deviceId;
    if(status.preview&&status.scene===settings.scene)$<HTMLImageElement>('live-preview').src=status.preview;
  }
  function updateSettings(){
    const motionOnly=sync.state.motionOnly===true;
    document.body.classList.toggle('motion-games-admin',motionOnly);
    document.querySelector<HTMLButtonElement>('[data-scene="spooky"]')!.hidden=motionOnly;
    document.querySelector('.worlds .section-title>span')!.textContent=motionOnly?'03 WORLDS · ONE CONTINUOUS ADVENTURE':'03 WORLDS + SPOOKY HOST';
    if(motionOnly){document.title='Simple Playground Motion Games · Control room';document.querySelector('.local-card p')!.textContent='Entirely offline. Camera processing stays on this Mac.';document.querySelector('.heading .eyebrow')!.textContent='THREE WORLDS · ENDLESS PLAY';document.querySelector('#guide .guide-note')!.textContent='Cutouts use one combined foreground mask. Overlapping people, costumes and fast motion can confuse tracking. Choose Camera overlay if anyone disappears. The road keeps moving with nobody present. One large challenge appears at a time. This Motion Games app works entirely offline and never uses an API key.';}

    $('world-atmosphere').hidden=settings.scene==='spooky';
    $<HTMLInputElement>('play-density').value=String(settings.playDensity);$('density-label').textContent=settings.playDensity<.3?'Relaxed':settings.playDensity>.7?'Lively':'Playful';
    $<HTMLInputElement>('music-volume').value=String(settings.musicVolume);$<HTMLInputElement>('music-muted').checked=settings.musicMuted;
    $('camera-toggle').innerHTML=settings.cameraOn?'Stop camera <span>■</span>':'Start camera <span>↗</span>';
    $('pause').textContent=settings.paused?'▶ Resume':'Ⅱ Pause';
    for(const id of ['mirror','motion'])$<HTMLInputElement>(id).checked=settings[id as 'mirror'|'motion'];
    $<HTMLSelectElement>('mode').value=settings.mode;$<HTMLSelectElement>('quality').value=settings.quality;$<HTMLSelectElement>('camera-select').value=settings.deviceId;
    $<HTMLInputElement>('sensitivity').value=String(settings.sensitivity);$('sensitivity-value').textContent=settings.sensitivity.toFixed(1)+'×';
    thumbs.forEach(({el})=>el.classList.toggle('chosen',el.dataset.scene===settings.scene));
    $('scene-label').textContent=({jungle:'01 / Escape from Monkey Island',depths:'02 / Escape from Shark Depths',space:'03 / Alien Attack',spooky:'04 / Spooky Host'})[settings.scene];
    $('monitor-label').textContent=sync.state.playerConnected?'Player connected':'Scene preview';
    if(!sync.state.playerConnected){$('people').textContent='—';$('fps').textContent='—';$('model-state').textContent='Standby';$('status-note').textContent='Open the player to begin. It owns the camera and can stay fullscreen on your TV.';previewAt=0;}
  }
  sync.onState=state=>{if(state.settings.scene!==settings.scene){previewAt=0;$<HTMLImageElement>('live-preview').removeAttribute('src');}settings=state.settings;updateSettings();updateHost();if(state.playerConnected)updateStatus(state.status);};sync.onStatus=updateStatus;
  sync.onConnection=connected=>{updateHost();$('connection').textContent=connected?'● Local connection ready':'Reconnecting to this Mac…';$('connection').classList.toggle('disconnected',!connected);if(!connected){previewAt=0;$('status-note').textContent='Connection lost. Keep the launcher running; controls reconnect automatically.';}};
  sync.onError=toast;sync.onEffect=event=>previewScene.trigger(event);sync.connect();
  let lastThumb=0;function render(t:number){const live=previewAt>0&&sync.connected&&sync.state.playerConnected&&t-previewAt<4000;$<HTMLImageElement>('live-preview').hidden=!live;$('preview').hidden=live;$('monitor-badge').textContent=live?(settings.demo?'LIVE PLAYER · SCENE DEMO':settings.cameraOn?'LIVE PLAYER · CAMERA ON':'LIVE PLAYER · CAMERA OFF'):'SCENE PREVIEW · CAMERA OFF';
    if(!live)previewScene.render(t,settings,null,[],true);if(t-lastThumb>120){thumbs.forEach(({el,renderer})=>!el.hidden&&renderer.render(t,{...settings,scene:el.dataset.scene as Settings['scene']},null,[],false));lastThumb=t;}requestAnimationFrame(render);}requestAnimationFrame(render);
}
