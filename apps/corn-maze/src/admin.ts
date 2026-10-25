import {SyncClient} from './sync';
import {HalloweenScene} from './scene';
import {DEFAULT_SETTINGS,type Settings,type PlayerStatus} from './types';
const icon=(name:string)=>({moon:'☾',spark:'✦',camera:'◉',screen:'▣',wand:'✧',leaf:'❧'}[name]??'✦');
export function mountAdmin(){
  document.title='Moonlight Motion · Control room';
  document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <div class="app-shell">
    <aside class="sidebar"><a class="brand" href="/"><span class="brand-mark">☾</span><span>moonlight<span class="brand-bottom">MOTION PLAYGROUND</span></span></a>
      <div class="side-label">YOUR PLAYGROUND</div><div class="nav-item selected">${icon('screen')} <span>Control room</span><span class="nav-dot"></span></div>
      <button class="nav-item" id="help-link">${icon('spark')} <span>Setup & field guide</span></button>
      <div class="side-art"><div class="little-moon">☾</div><span>A little movement.<br>A lot of magic.</span><div class="side-pumpkins">✦ &nbsp; ◒ &nbsp; ✦</div></div>
      <div class="local-card"><span class="green-dot"></span><strong>Made for this Mac</strong><p>Camera stays here.<br>No cloud. No recordings.</p></div><div class="sidebar-footer">HALLOWEEN EDITION <span>01</span></div>
    </aside>
    <main class="main"><header class="topbar"><div class="breadcrumb">PLAYGROUND <span>/</span> CONTROL ROOM</div><div class="connection-pill" id="connection">Connecting locally…</div></header>
    <section class="heading"><div><div class="eyebrow">LET THE GOOD SPOOKS BEGIN</div><h1>Your little world of <em>whoa.</em></h1><p>Pick a world, step into the frame, and make some magic.</p></div><button class="primary" id="open-player">Open player <span>↗</span></button></section>
    <div class="dashboard-grid"><section class="stage-card"><div class="section-top"><div><span class="live-dot"></span><strong>Stage monitor</strong><span class="muted small" id="monitor-label">Scene preview</span></div><button class="text-button" id="pause">Ⅱ Pause</button></div>
    <div class="monitor"><canvas id="preview" width="960" height="540"></canvas><img id="live-preview" alt="Live local player preview" hidden><div class="monitor-badge" id="monitor-badge">SCENE PREVIEW · CAMERA OFF</div><div class="monitor-footer"><span id="scene-label">01 / Pumpkin Hollow</span><span>✧ MOVE TO MAKE MAGIC</span></div></div>
    <div class="telemetry"><div><span class="metric" id="people">—</span><span>people in frame <small>/ 3 max</small></span></div><div><span class="metric" id="fps">—</span><span>stage fps</span></div><div><span class="metric" id="model-state">Standby</span><span id="model-detail">Local vision engine</span></div><span class="offline-tag">⌁ LOCAL ONLY</span></div></section>
    <section class="camera-card panel"><div class="section-top"><h2>Camera & stage</h2><span>${icon('camera')}</span></div><label for="camera-select">VIDEO INPUT</label><select id="camera-select"><option value="">Default camera</option></select><p class="field-note" id="camera-note">Start the camera to reveal available inputs.</p>
    <button class="primary full" id="camera-toggle">Start camera <span>↗</span></button><button class="secondary full" id="demo-toggle">Play scene demo</button>
    <div class="divider"></div><label for="mode">PEOPLE APPEARANCE</label><select id="mode"><option value="cutout">Magic cutout · combined mask</option><option value="camera">Camera overlay · reliable fallback</option><option value="silhouette">Glowing silhouettes</option></select>
    <label class="toggle-row"><span>Mirror camera</span><input id="mirror" type="checkbox" checked><span class="switch"></span></label><label class="toggle-row"><span>Movement effects</span><input id="motion" type="checkbox" checked><span class="switch"></span></label>
    <div class="field-row"><label for="quality">PERFORMANCE</label><select id="quality"><option value="balanced">Balanced</option><option value="performance">Lighter load</option></select></div>
    <div class="warning" id="status-note">Open the player to begin. It owns the camera and can stay fullscreen on your TV.</div></section>
    <section class="worlds"><div class="section-title"><h2>Choose your world</h2><span>04 WORLDS · 1 ADVENTURE</span></div><div class="scene-grid">
    <button class="scene-card game-scene-card" data-scene="cornmaze"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Corn Maze Quest <b class="game-tag">PLAY</b></strong><small>Grab, explore & escape together</small></span><span class="scene-check">✓</span></span></button>
    <button class="scene-card chosen" data-scene="pumpkin"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Pumpkin Hollow</strong><small>Golden skies & friendly frights</small></span><span class="scene-check">✓</span></span></button>
    <button class="scene-card" data-scene="enchanted"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Enchanted Grove</strong><small>A forest full of little wonders</small></span><span class="scene-check">✓</span></span></button>
    <button class="scene-card" data-scene="midnight"><canvas width="360" height="200"></canvas><span class="scene-text"><span><strong>Midnight Magic</strong><small>Moonbeams & wandering spirits</small></span><span class="scene-check">✓</span></span></button></div></section>
    <section class="game-panel panel" id="quest-panel" hidden><div class="quest-top"><div><div class="eyebrow">COOPERATIVE ADVENTURE</div><h2>Corn Maze Quest</h2><p>Gather six glowing ears of corn and find the way out.</p></div><div class="quest-progress"><strong id="quest-score">0 / 6</strong><span>TEAM HARVEST</span></div><button class="secondary" id="restart-game">↻ Restart round</button></div><div class="quest-instructions"><span><b>1</b> Reach & hold to grab</span><span><b>2</b> Carry to any basket</span><span><b>3</b> Reach for a path sign</span></div><div class="quest-bottom"><div><strong id="quest-room">Moonlit Gate</strong><p id="quest-hint">Open player, then start camera or turn on Mouse practice.</p></div><label class="toggle-row"><span>Mouse practice <small>no camera needed</small></span><input id="practice" type="checkbox"><span class="switch"></span></label></div><p class="quest-note">Hold your hand still for the ring to fill. Grabbing uses hand position, not a pinch or closed fist. If tracking loses a hand, its corn returns to its starting spot. Bonus boxes hide on side paths.</p></section>
    <section class="effects panel"><div class="section-title"><h2>A little extra magic</h2><span>INSTANT EFFECTS</span></div><div class="effects-grid"><button data-effect="candy"><span class="effect-icon candy">▱</span><strong>Candy shower</strong><small>Or try a little hop</small><kbd>1</kbd></button><button data-effect="bats"><span class="effect-icon bats">⌁</span><strong>Friendly bats</strong><small>Or raise both hands</small><kbd>2</kbd></button><button data-effect="magic"><span class="effect-icon magic">✧</span><strong>Magic burst</strong><small>Or wave hello</small><kbd>3</kbd></button></div><div class="sensitivity"><label for="sensitivity">Movement sensitivity</label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="1"><span id="sensitivity-value">1.0×</span></div></section>
    </div><footer class="bottom-note"><span>✦ Built for little monsters and big imaginations.</span><button class="text-button" id="guide-button">TV setup guide ↗</button></footer></main>
  </div><dialog id="guide"><button class="dialog-close" aria-label="Close guide">×</button><div class="eyebrow">READY, SET, BOO</div><h2>Bring your playground to life.</h2><ol><li><strong>Test on this screen.</strong> Open player, then start camera. Allow camera access in Chrome and macOS if asked. Place the windows side by side.</li><li><strong>Give everyone room.</strong> Stand back so 2–3 full bodies fit, with space between them. Wave for sparkles, lift both hands for bats, or hop for candy.</li><li><strong>Connect the TV.</strong> Use HDMI and choose an extended display in System Settings → Displays. Drag the player window onto the TV, then press its Fullscreen button or F.</li><li><strong>Keep controls here.</strong> Return to this admin window on the Mac. Effects and scene changes reach the TV without leaving fullscreen. Esc exits fullscreen.</li></ol><p class="guide-note">Cutouts use one combined foreground mask. Overlapping people, capes, masks, and fast motion can confuse tracking. Choose Camera overlay if anyone disappears. Demo characters are animated previews, not live people. Keep Chrome and the local launcher running; the app needs no internet.</p><p>Shortcuts: <b>1</b> candy · <b>2</b> bats · <b>3</b> magic · <b>Space</b> pause (admin) · <b>F</b> fullscreen (player).</p></dialog><div id="toast" role="status"></div>`;
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
    playerWindow=window.open('/?view=player','moonlight-player','popup=yes,width=1200,height=760');
    if(!playerWindow)toast('Allow pop-ups for this local app, then open the player again.');
  }
  $('open-player').onclick=openPlayer;
  $('camera-toggle').onclick=()=>{if(!sync.state.playerConnected&&!settings.cameraOn)openPlayer();patch({cameraOn:!settings.cameraOn,demo:false,paused:false,gamePractice:false});};
  $('demo-toggle').onclick=()=>{if(!sync.state.playerConnected)openPlayer();patch({demo:true,cameraOn:false,paused:false,gamePractice:false});};
  $('restart-game').onclick=()=>{patch({gameRound:settings.gameRound+1,paused:false});toast('New adventure started. Reach for glowing corn!');};
  $<HTMLInputElement>('practice').onchange=()=>{const practice=$<HTMLInputElement>('practice').checked;if(practice&&!sync.state.playerConnected)openPlayer();patch({gamePractice:practice,...(practice?{cameraOn:false,demo:false,paused:false}:{})});};
  $('pause').onclick=()=>patch({paused:!settings.paused});
  for(const id of ['mirror','motion'])$<HTMLInputElement>(id).onchange=()=>patch({[id]:$<HTMLInputElement>(id).checked});
  $<HTMLSelectElement>('camera-select').onchange=()=>patch({deviceId:$<HTMLSelectElement>('camera-select').value});
  $<HTMLSelectElement>('mode').onchange=()=>patch({mode:$<HTMLSelectElement>('mode').value as Settings['mode']});
  $<HTMLSelectElement>('quality').onchange=()=>patch({quality:$<HTMLSelectElement>('quality').value as Settings['quality']});
  $<HTMLInputElement>('sensitivity').oninput=()=>{$('sensitivity-value').textContent=Number($<HTMLInputElement>('sensitivity').value).toFixed(1)+'×';};
  $<HTMLInputElement>('sensitivity').onchange=()=>patch({sensitivity:Number($<HTMLInputElement>('sensitivity').value)});
  thumbs.forEach(({el})=>el.onclick=()=>patch({scene:el.dataset.scene as Settings['scene']}));
  const effect=(kind:'candy'|'bats'|'magic')=>{if(!sync.state.playerConnected){toast('Open the player to send an effect.');return;}if(!sync.effect(kind))toast('Reconnect the local player to send an effect.');};
  document.querySelectorAll<HTMLButtonElement>('[data-effect]').forEach(el=>el.onclick=()=>effect(el.dataset.effect as 'candy'|'bats'|'magic'));
  const guide=$<HTMLDialogElement>('guide');for(const id of ['help-link','guide-button'])$(id).onclick=()=>guide.showModal();guide.querySelector<HTMLButtonElement>('.dialog-close')!.onclick=()=>guide.close();
  window.onkeydown=e=>{if((e.target as HTMLElement).matches('input,select,textarea')||guide.open)return;if(['1','2','3'].includes(e.key))effect((['candy','bats','magic'] as const)[Number(e.key)-1]);if(e.code==='Space'){e.preventDefault();patch({paused:!settings.paused});}};
  function updateStatus(next:PlayerStatus|null){status=next;if(!status)return;
    $('people').textContent=String(status.people);$('fps').textContent=String(status.fps||'—');
    $('model-state').textContent=/ready/i.test(status.model)?'Ready':/load|init/i.test(status.model)?'Loading':'Standby';$('model-detail').textContent=status.inferenceMs?`${Math.round(status.inferenceMs)} ms / inference`:status.model||'Local vision engine';
    $('camera-note').textContent=status.camera||'Choose a camera input.';$('status-note').textContent=status.error||status.fallback||(settings.scene==='cornmaze'?(settings.gamePractice&&!settings.cameraOn?'Mouse practice is ready in the player. Start camera to play with your hands.':settings.cameraOn?'Maze ready. Keep hands visible and follow the glowing cursors.':'Start camera or enable Mouse practice below to begin the maze.'):settings.demo?'Scene demo is running. Start camera to step inside.':'All set. Keep full bodies visible and leave space between players.');
    const sel=$<HTMLSelectElement>('camera-select');const current=JSON.stringify(status.devices);if(sel.dataset.devices!==current){sel.dataset.devices=current;sel.replaceChildren(new Option('Default camera',''),...status.devices.map(d=>new Option(d.label||'Camera',d.deviceId)));}sel.value=settings.deviceId;
    if(status.preview)$<HTMLImageElement>('live-preview').src=status.preview;
    if(settings.scene==='cornmaze'&&status.game){$('quest-score').textContent=`${status.game.collected} / ${status.game.goal}`;$('quest-room').textContent=status.game.room+(status.game.bonus?` · ${status.game.bonus} bonus ${status.game.bonus===1?'star':'stars'}`:'');$('quest-hint').textContent=status.game.message;}
  }
  function updateSettings(){
    $('camera-toggle').innerHTML=settings.cameraOn?'Stop camera <span>■</span>':'Start camera <span>↗</span>';
    $('pause').textContent=settings.paused?'▶ Resume':'Ⅱ Pause';
    for(const id of ['mirror','motion'])$<HTMLInputElement>(id).checked=settings[id as 'mirror'|'motion'];
    $<HTMLSelectElement>('mode').value=settings.mode;$<HTMLSelectElement>('quality').value=settings.quality;$<HTMLSelectElement>('camera-select').value=settings.deviceId;
    $<HTMLInputElement>('sensitivity').value=String(settings.sensitivity);$('sensitivity-value').textContent=settings.sensitivity.toFixed(1)+'×';
    thumbs.forEach(({el})=>el.classList.toggle('chosen',el.dataset.scene===settings.scene));
    $('scene-label').textContent=({pumpkin:'01 / Pumpkin Hollow',enchanted:'02 / Enchanted Grove',midnight:'03 / Midnight Magic',cornmaze:'PLAY / Corn Maze Quest'})[settings.scene];
    $('quest-panel').hidden=settings.scene!=='cornmaze';$<HTMLInputElement>('practice').checked=settings.gamePractice;
    if(settings.scene==='cornmaze'){document.querySelectorAll('.effects-grid small').forEach(el=>el.textContent='Manual effect during game');$('quest-hint').textContent=settings.gamePractice?'Move the pointer inside the player. Hold over corn, then move to a basket.':'Use Start camera and reach for glowing corn. Keep hands in frame.';}else{document.querySelectorAll('.effects-grid small').forEach((el,i)=>el.textContent=['Or try a little hop','Or raise both hands','Or wave hello'][i]);}
    $('monitor-label').textContent=sync.state.playerConnected?'Player connected':'Scene preview';
    if(!sync.state.playerConnected){$('people').textContent='—';$('fps').textContent='—';$('model-state').textContent='Standby';$('status-note').textContent='Open the player to begin. It owns the camera and can stay fullscreen on your TV.';previewAt=0;}
  }
  sync.onState=state=>{settings=state.settings;updateSettings();if(state.playerConnected)updateStatus(state.status);};sync.onStatus=updateStatus;
  sync.onConnection=connected=>{$('connection').textContent=connected?'● Local connection ready':'Reconnecting to this Mac…';$('connection').classList.toggle('disconnected',!connected);if(!connected){previewAt=0;$('status-note').textContent='Connection lost. Keep the launcher running; controls reconnect automatically.';}};
  sync.onError=toast;sync.onEffect=event=>previewScene.trigger(event);sync.connect();
  let lastThumb=0;function render(t:number){const live=previewAt>0&&sync.connected&&sync.state.playerConnected&&t-previewAt<4000;$<HTMLImageElement>('live-preview').hidden=!live;$('preview').hidden=live;$('monitor-badge').textContent=live?(settings.scene==='cornmaze'&&settings.gamePractice?'LIVE PLAYER · MOUSE PRACTICE':settings.demo?'LIVE PLAYER · SCENE DEMO':settings.cameraOn?'LIVE PLAYER · CAMERA ON':'LIVE PLAYER · CAMERA OFF'):'SCENE PREVIEW · CAMERA OFF';
    if(!live)previewScene.render(t,settings,null,[],true);if(t-lastThumb>120){thumbs.forEach(({el,renderer})=>renderer.render(t,{...settings,scene:el.dataset.scene as Settings['scene']},null,[],false));lastThumb=t;}requestAnimationFrame(render);}requestAnimationFrame(render);
}
