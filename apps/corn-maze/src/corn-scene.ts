import type { GameSnapshot } from './game-types';

const W = 1280, H = 720;
const TAU = Math.PI * 2;
const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const cached = new Map<string, HTMLCanvasElement>();
type C = CanvasRenderingContext2D;

function oval(c: C, x: number, y: number, rx: number, ry: number) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function rounded(c: C, x: number, y: number, w: number, h: number, r: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function text(c: C, value: string, x: number, y: number, size: number, color = '#fff6d4', weight = 700, align: CanvasTextAlign = 'center', maxWidth?: number) {
  c.fillStyle = color; c.font = `${weight} ${size}px ui-rounded, 'Avenir Next', system-ui, sans-serif`; c.textAlign = align; c.textBaseline = 'middle';
  if (maxWidth) c.fillText(value, x, y, maxWidth); else c.fillText(value, x, y);
}
function star(c: C, x: number, y: number, r: number) { c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x + r * .18, y - r * .18, x + r, y); c.quadraticCurveTo(x + r * .18, y + r * .18, x, y + r); c.quadraticCurveTo(x - r * .18, y + r * .18, x - r, y); c.quadraticCurveTo(x - r * .18, y - r * .18, x, y - r); c.fill(); }

/** All artwork is drawn locally. A room is a shared play area, never an individual person's mask. */
export function drawCornBackground(c: C, time: number, game?: GameSnapshot, demo = false): void {
  const key = game?.room || 'welcome';
  let base = cached.get(key);
  if (!base) {
    base = document.createElement('canvas'); base.width = W; base.height = H;
    paintLandscape(base.getContext('2d')!, key);
    cached.set(key, base);
    if (cached.size > 9) cached.delete(cached.keys().next().value!);
  }
  c.save();
  const travel = game?.phase === 'travel' ? game.travelProgress : 0;
  const zoom = 1 + travel * .17;
  const turn = game?.travelDirection === 'left' ? 1 : game?.travelDirection === 'right' ? -1 : 0;
  c.translate(W / 2 + turn * Math.sin(travel * Math.PI) * 34, 290);
  c.scale(zoom, zoom); c.translate(-W / 2, -290);
  c.drawImage(base, 0, 0);
  // A few live edge stalks make the field breathe without rebuilding the whole landscape.
  for (let side = 0; side < 2; side++) for (let i = 0; i < 8; i++) {
    const x = side === 0 ? -18 + i * 22 : W + 18 - i * 22;
    stalk(c, x, 732 - i * 13, 1.22 - i * .066, side * 60 + i, Math.sin(time * .7 + i * .6) * .024);
  }
  c.restore();
  c.save();
  for (let i = 0; i < 20; i++) {
    const x = rand(i + 921) * W + Math.sin(time * .36 + i) * 24;
    const y = 294 + rand(i + 121) * 340 + Math.cos(time * .8 + i) * 15;
    c.globalAlpha = .22 + Math.pow((1 + Math.sin(time * 1.4 + i)) / 2, 2) * .7;
    c.fillStyle = '#fff4a6'; oval(c, x, y, 2.2, 2.2);
  }
  c.restore();
  if (demo && !game) {
    // The admin thumbnail has no camera or scoring state.
    c.save(); c.globalAlpha = .35; c.fillStyle = '#153b35'; oval(c, 640, 646, 240, 25); c.restore();
  }
}

function paintLandscape(c: C, room: string) {
  const seed = [...room].reduce((n, a) => n + a.charCodeAt(0), 0);
  const bend = room === 'grove' ? -54 : room === 'harvest' ? 59 : room === 'start' ? 18 : 0;
  const colors = room === 'grove' ? ['#3d8281', '#a0c2a0', '#dfd290'] : room === 'harvest' ? ['#659695', '#bec6a0', '#f4c17d'] : room === 'deadendA' ? ['#5d8598', '#b9c3ac', '#e6c78f'] : room === 'exit' ? ['#5b9aaa', '#bfd2ae', '#ffdc96'] : ['#428c9b', '#a8c4a8', '#f3ce8d'];
  const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, colors[0]); sky.addColorStop(.37, colors[1]); sky.addColorStop(.64, colors[2]); sky.addColorStop(1, '#e6a659');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  const sun = c.createRadialGradient(1005, 183, 5, 1005, 183, 240); sun.addColorStop(0, '#fff9d699'); sun.addColorStop(.23, '#ffeaba55'); sun.addColorStop(1, '#ffefb000'); c.fillStyle = sun; c.fillRect(760, 0, 520, 440);
  c.fillStyle = '#fff1be'; oval(c, 1005, 183, 47, 47);
  // Soft clouds, distant blue hills, and a tiny barn establish a sunny farm world.
  for (let i = 0; i < 7; i++) {
    c.fillStyle = '#f5e9cb36'; const x = 80 + i * 185; const y = 114 + rand(i + seed) * 91;
    oval(c, x, y, 100, 13); oval(c, x - 20, y - 11, 49, 18);
  }
  c.fillStyle = '#6a9280'; c.beginPath(); c.moveTo(0, 328); c.bezierCurveTo(130, 251, 270, 344, 440, 299); c.bezierCurveTo(650, 239, 820, 339, 1000, 292); c.quadraticCurveTo(1180, 238, 1280, 316); c.lineTo(1280, H); c.lineTo(0, H); c.fill();
  c.fillStyle = '#899962'; c.beginPath(); c.moveTo(0, 350); c.bezierCurveTo(320, 308, 440, 379, 670, 332); c.quadraticCurveTo(1080, 281, 1280, 353); c.lineTo(1280, H); c.lineTo(0, H); c.fill();
  c.save(); c.translate(1042, 321); c.scale(.55, .55); c.fillStyle = '#a7553d'; c.fillRect(-52, -52, 104, 65); c.beginPath(); c.moveTo(-64, -52); c.lineTo(0, -101); c.lineTo(64, -52); c.fill(); c.fillStyle = '#453e36'; c.fillRect(-17, -29, 34, 42); c.strokeStyle = '#eed7a6'; c.lineWidth = 4; c.strokeRect(-18, -30, 36, 43); c.beginPath(); c.moveTo(-18, -30); c.lineTo(18, 13); c.moveTo(18, -30); c.lineTo(-18, 13); c.stroke(); c.restore();
  // Wide winding path leaves the middle open for two or three real players.
  const dirt = c.createLinearGradient(0, 310, 0, H); dirt.addColorStop(0, '#cdad6c'); dirt.addColorStop(.5, '#bd9253'); dirt.addColorStop(1, '#88653c'); c.fillStyle = dirt; c.fillRect(0, 350, W, 370);
  c.fillStyle = '#dec08b'; c.beginPath(); c.moveTo(596 + bend, 331); c.bezierCurveTo(574 + bend, 377, 674 + bend * .5, 397, 644 + bend * .35, 438); c.bezierCurveTo(595, 503, 374, 519, 237, H); c.lineTo(1086, H); c.bezierCurveTo(864, 522, 746 + bend * .3, 463, 724 + bend * .4, 426); c.bezierCurveTo(689 + bend, 374, 633 + bend, 368, 656 + bend, 331); c.fill();
  c.strokeStyle = '#f8dca242'; c.lineWidth = 3; c.beginPath(); c.moveTo(617 + bend, 344); c.bezierCurveTo(594 + bend, 383, 713 + bend * .5, 394, 686 + bend * .4, 443); c.bezierCurveTo(656, 501, 505, 573, 454, 720); c.stroke();
  for (let i = 0; i < 95; i++) {
    const y = 382 + rand(i + 97) * 338; const scale = (y - 300) / 420; const x = 120 + rand(i + 414) * 1040;
    c.fillStyle = i % 3 ? '#6d532c13' : '#ffdfa32a'; oval(c, x, y, (2 + rand(i) * 7) * scale, (1 + rand(i + 12) * 2) * scale);
  }
  // Secret nooks have a corn wall across the far path; the open rooms bend differently.
  if (room.startsWith('deadend')) for (let i = 0; i < 14; i++) stalk(c, 488 + i * 24, 410, .48, seed + i * 13, 0);
  // Perspective corn walls: close leaves frame the players; the far rows make a maze corridor.
  for (let i = 0; i < 25; i++) {
    const z = i / 24; const y = 364 + z * z * 356; const s = .18 + z * z * 1.22;
    const left = 578 - z * 435 + bend * (1 - z) ** 2; const right = 712 + z * 430 + bend * (1 - z) ** 2;
    for (let j = 0; j < 3; j++) {
      stalk(c, left - j * (22 + z * 30), y + j * 8, s * (1 + j * .03), i * 9 + j + seed, 0);
      stalk(c, right + j * (22 + z * 30), y + j * 8, s * (1 + j * .03), 390 + i * 9 + j + seed, 0);
    }
  }
  if (room === 'deadendB') { scarecrow(c, 934, 510, .9); scarecrow(c, 340, 407, .37); }
  else scarecrow(c, room === 'grove' ? 926 : 337, 419, .44);
  if (room === 'harvest' || room === 'exit') {
    for (const [x, y, s] of [[214, 609, 1], [1080, 626, .9], [1130, 582, .65]]) {
      c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = '#a9532c'; oval(c, -15, 1, 24, 27); oval(c, 15, 1, 24, 27); c.fillStyle = '#d98237'; oval(c, 0, 0, 25, 31); c.strokeStyle = '#6d743b'; c.lineWidth = 7; c.beginPath(); c.moveTo(0, -28); c.lineTo(6, -42); c.stroke(); c.restore();
    }
  }
  // Sunlit dust sits behind, never on top of the people's foreground layer.
  const glow = c.createRadialGradient(670, 376, 20, 670, 376, 380); glow.addColorStop(0, '#ffe4a62b'); glow.addColorStop(1, '#ffe4a600'); c.fillStyle = glow; c.fillRect(240, 150, 800, 550);
  c.fillStyle = '#2a423a20'; c.fillRect(0, 0, W, 120);
}

function stalk(c: C, x: number, y: number, s: number, seed: number, sway: number) {
  c.save(); c.translate(x, y); c.scale(s, s); c.rotate(sway + (rand(seed) - .5) * .08);
  const h = 280 + rand(seed + 2) * 38;
  c.strokeStyle = '#a48b35'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(9, -h * .5, -5, -h); c.stroke();
  for (let i = 0; i < 6; i++) {
    const y1 = -37 - i * 34; const side = i % 2 ? 1 : -1; const reach = 59 + rand(seed + i * 5) * 28;
    c.fillStyle = ['#6d7e35', '#8e953c', '#b4a544'][i % 3]; c.beginPath(); c.moveTo(2, y1); c.bezierCurveTo(side * 30, y1 - 28, side * reach, y1 - 48, side * (reach + 12), y1 - 22); c.bezierCurveTo(side * reach, y1 - 34, side * 42, y1 + 13, 2, y1); c.fill();
    c.strokeStyle = '#d4be5b80'; c.lineWidth = 1; c.beginPath(); c.moveTo(2, y1); c.quadraticCurveTo(side * 40, y1 - 18, side * (reach + 12), y1 - 22); c.stroke();
  }
  c.strokeStyle = '#ead38b'; c.lineWidth = 2;
  for (let i = 0; i < 7; i++) { const px = (i - 3) * 7; c.beginPath(); c.moveTo(-5, -h + 16); c.quadraticCurveTo(px, -h - 12, px * 1.2, -h - 28 + Math.abs(i - 3) * 6); c.stroke(); }
  c.save(); c.translate(-1, -120); c.rotate(-.3); c.fillStyle = '#d2ac47'; oval(c, -7, 0, 9, 28); c.fillStyle = '#768338'; c.beginPath(); c.moveTo(-12, 24); c.quadraticCurveTo(-29, 4, -21, -22); c.quadraticCurveTo(0, 0, -12, 24); c.fill(); c.restore();
  c.restore();
}

function scarecrow(c: C, x: number, y: number, s: number) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineCap = 'round'; c.strokeStyle = '#725338'; c.lineWidth = 9; c.beginPath(); c.moveTo(0, 100); c.lineTo(0, -102); c.moveTo(-90, -40); c.lineTo(90, -40); c.stroke();
  c.fillStyle = '#b26345'; c.beginPath(); c.moveTo(-26, -67); c.lineTo(-84, -55); c.lineTo(-76, -31); c.lineTo(-29, -37); c.lineTo(-37, 30); c.lineTo(35, 30); c.lineTo(26, -37); c.lineTo(79, -29); c.lineTo(86, -52); c.lineTo(24, -67); c.fill();
  c.strokeStyle = '#efd194'; c.lineWidth = 3; for (const a of [-1, 1]) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(a * 80, -48 + i * 5); c.lineTo(a * (99 + i % 2 * 6), -52 + i * 9); c.stroke(); }
  c.fillStyle = '#e5bf7c'; oval(c, 0, -89, 30, 32); c.fillStyle = '#774e38'; oval(c, -10, -92, 3, 4); oval(c, 10, -92, 3, 4); c.strokeStyle = '#80553a'; c.lineWidth = 3; c.beginPath(); c.arc(0, -87, 13, .2, Math.PI - .2); c.stroke();
  c.fillStyle = '#b68448'; c.beginPath(); c.moveTo(-25, -108); c.lineTo(-14, -148); c.lineTo(16, -145); c.lineTo(29, -107); c.fill(); c.fillStyle = '#72563a'; oval(c, 0, -108, 44, 9); c.fillStyle = '#e6ba68'; c.fillRect(-22, -119, 46, 7); c.fillStyle = '#dfb651'; c.beginPath(); c.moveTo(-14, -61); c.lineTo(0, -49); c.lineTo(15, -62); c.lineTo(8, -28); c.fill(); c.restore();
}

/** Foreground target circles use the same normalized horizontal radius as the game engine. */
export function drawCornForeground(c: C, time: number, game?: GameSnapshot, practice = false): void {
  c.save();
  if (!game) {
    c.save(); c.shadowColor = '#243b32a8'; c.shadowBlur = 18; text(c, 'THE GREAT', 640, 220, 20, '#f8e4b7', 800); text(c, 'Corn Maze', 640, 276, 68, '#fff1be', 900); c.restore();
    rounded(c, 409, 327, 462, 44, 22, '#183e36d9'); text(c, 'REACH · GRAB · EXPLORE TOGETHER', 640, 350, 17, '#fff2ca', 800);
    corn(c, 501, 479, .83, -.22); mysteryBox(c, 773, 483, .94, time);
    text(c, 'An autumn adventure for your whole crew', 640, 610, 22, '#fff0c4', 700);
    c.restore(); return;
  }
  for (const b of game.baskets) basket(c, b.x * W, b.y * H, b.radius * W, game.hands.some(h => h.holding && Math.hypot((h.x - b.x) * W, (h.y - b.y) * H) < b.radius * W));
  for (const item of game.items) {
    if (item.collected) continue;
    const x = item.x * W, y = item.y * H;
    const held = !!item.heldBy;
    const radius = item.radius * W;
    if (held) {
      const aura = c.createRadialGradient(x, y, 10, x, y, 95); aura.addColorStop(0, '#fff6b676'); aura.addColorStop(1, '#fff6b600'); c.fillStyle = aura; c.fillRect(x - 95, y - 95, 190, 190);
      c.fillStyle = '#fff6bd'; for (let k = 0; k < 4; k++) { const a = time * 2 + k * TAU / 4; star(c, x + Math.cos(a) * 62, y + Math.sin(a) * 51, 4); }
    } else {
      c.save(); c.fillStyle = '#183f3657'; oval(c, x, y, radius, radius); c.lineWidth = 2; c.strokeStyle = '#fff2c8b8'; c.setLineDash([3, 7]); c.beginPath(); c.arc(x, y, radius, 0, TAU); c.stroke(); c.restore();
      if (item.progress > 0) progressRing(c, x, y, radius + 4, item.progress, '#ffe084', 7);
    }
    if (item.kind === 'corn') corn(c, x, y, .88, held ? Math.sin(time * 4) * .08 : -.12);
    else mysteryBox(c, x, y, .9, time);
    if (!held && !item.progress) text(c, item.kind === 'corn' ? 'GRAB' : 'SURPRISE', x, y + radius + 19, 13, '#fff4d7', 850);
  }
  for (const t of game.targets) {
    const x = t.x * W, y = t.y * H, r = t.radius * W;
    c.fillStyle = '#143a35a8'; oval(c, x, y, r, r); c.strokeStyle = '#ffedb6'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    progressRing(c, x, y, r + 5, t.progress, '#ffdf77', 8);
    c.save(); c.translate(x, y - 13); if (t.direction === 'right') c.rotate(Math.PI); else if (t.direction === 'back') c.rotate(-Math.PI / 2);
    c.strokeStyle = '#fff2c4'; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(23, 0); c.lineTo(-23, 0); c.moveTo(-7, -16); c.lineTo(-23, 0); c.lineTo(-7, 16); c.stroke(); c.restore();
    text(c, t.label, x, y + 30, 15, '#fff1ca', 800);
  }
  for (const h of game.hands) {
    const x = h.x * W, y = h.y * H; const col = h.holding ? '#ffe486' : '#c6fff0';
    c.save(); c.shadowColor = '#123f35'; c.shadowBlur = 8; c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(x, y, h.holding ? 16 : 20, 0, TAU); c.stroke(); c.shadowBlur = 0; c.fillStyle = col; oval(c, x, y, 4, 4); c.restore();
    if (h.progress > 0) progressRing(c, x, y, 26, h.progress, '#fff1a5', 5);
  }
  hud(c, game, practice);
  if (game.phase === 'travel') {
    const fade = Math.sin(game.travelProgress * Math.PI);
    c.fillStyle = `rgba(255,235,180,${fade * .17})`; c.fillRect(0, 100, W, 570);
    rounded(c, 442, 280, 396, 92, 28, '#173e35ed');
    const arrow = game.travelDirection === 'left' ? '←' : game.travelDirection === 'right' ? '→' : '↶';
    text(c, `${arrow}  Through the corn…`, 640, 315, 25, '#fff0bb', 800);
    rounded(c, 491, 347, 298, 5, 3, '#ebd59b33'); rounded(c, 491, 347, Math.max(5, 298 * game.travelProgress), 5, 3, '#f6d477');
  }
  if (game.phase === 'won') victory(c, time, game);
  c.restore();
}

function progressRing(c: C, x: number, y: number, r: number, amount: number, color: string, line: number) {
  if (!amount) return; c.save(); c.strokeStyle = color; c.lineWidth = line; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, amount)); c.stroke(); c.restore();
}

function corn(c: C, x: number, y: number, s: number, rotation = 0) {
  c.save(); c.translate(x, y); c.rotate(rotation); c.scale(s, s); c.fillStyle = '#173d3340'; oval(c, 2, 57, 35, 9);
  c.strokeStyle = '#fff2b8'; c.lineWidth = 6; c.fillStyle = '#df9b28'; c.beginPath(); c.ellipse(0, -4, 26, 54, 0, 0, TAU); c.fill(); c.stroke();
  for (let row = 0; row < 11; row++) for (let col = 0; col < 4; col++) {
    const ky = -48 + row * 8.5; const kx = -17 + col * 11 + (row % 2 ? 1 : 0);
    if (Math.pow(kx / 25, 2) + Math.pow((ky + 4) / 54, 2) < .9) { c.fillStyle = col < 2 ? '#ffe384' : '#f8c24d'; oval(c, kx, ky, 4.4, 3.6); }
  }
  c.fillStyle = '#4e8a49'; c.beginPath(); c.moveTo(1, 61); c.bezierCurveTo(-43, 34, -53, -5, -40, -30); c.quadraticCurveTo(-15, -4, 1, 61); c.fill(); c.fillStyle = '#81a64f'; c.beginPath(); c.moveTo(0, 61); c.bezierCurveTo(43, 26, 51, -3, 37, -28); c.quadraticCurveTo(13, -3, 0, 61); c.fill();
  c.strokeStyle = '#bad378'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 54); c.quadraticCurveTo(17, 11, 37, -23); c.moveTo(-4, 52); c.quadraticCurveTo(-26, 13, -38, -23); c.stroke(); c.restore();
}

function mysteryBox(c: C, x: number, y: number, s: number, time: number) {
  c.save(); c.translate(x, y); c.rotate(Math.sin(time * 1.5) * .025); c.scale(s, s); c.fillStyle = '#183b3540'; oval(c, 2, 53, 52, 11);
  rounded(c, -48, -36, 96, 82, 9, '#9855a3'); c.fillStyle = '#b970b7'; c.beginPath(); c.moveTo(-48, -36); c.lineTo(-34, -50); c.lineTo(35, -50); c.lineTo(48, -36); c.fill();
  c.strokeStyle = '#edbaeb'; c.lineWidth = 3; c.beginPath(); c.roundRect(-48, -36, 96, 82, 9); c.stroke(); c.fillStyle = '#e9b258'; c.fillRect(-7, -49, 14, 95); c.fillRect(-47, -6, 94, 13); rounded(c, -19, -27, 38, 47, 10, '#ffdf8a'); text(c, '?', 0, -3, 33, '#77468c', 900);
  c.strokeStyle = '#ffdc86'; c.lineWidth = 6; c.beginPath(); c.ellipse(-13, -54, 15, 10, .5, 0, TAU); c.ellipse(13, -54, 15, 10, -.5, 0, TAU); c.stroke(); c.restore();
}

function basket(c: C, x: number, y: number, radius: number, active: boolean) {
  c.save(); c.translate(x, y);
  // The softly filled disc, not the basket illustration, is the complete drop area.
  c.fillStyle = active ? '#fff2ad44' : '#263e354a'; oval(c, 0, 0, radius, radius); c.strokeStyle = active ? '#fff3bc' : '#fff0bd88'; c.lineWidth = active ? 4 : 2; c.setLineDash([4, 7]); c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.stroke(); c.setLineDash([]);
  const w = Math.min(70, radius * .81); const h = Math.min(48, radius * .58);
  c.strokeStyle = '#d3aa68'; c.lineWidth = 8; c.beginPath(); c.ellipse(0, -10, w * .64, h, 0, Math.PI, TAU); c.stroke(); c.fillStyle = '#a77740'; c.beginPath(); c.moveTo(-w, -15); c.lineTo(-w * .75, h); c.quadraticCurveTo(0, h + 10, w * .75, h); c.lineTo(w, -15); c.closePath(); c.fill();
  c.strokeStyle = '#e0b474'; c.lineWidth = 3;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * w * .22, -11); c.lineTo(i * w * .17, h); c.stroke(); }
  for (let i = 0; i < 4; i++) { const yy = 2 + i * h * .22; c.beginPath(); c.moveTo(-w + yy * .28, yy); c.quadraticCurveTo(0, yy + 9, w - yy * .28, yy); c.stroke(); }
  c.fillStyle = '#e2b87b'; oval(c, 0, -15, w, 9); c.fillStyle = '#785632'; oval(c, 0, -17, w - 6, 5); rounded(c, -35, 3, 70, 25, 8, '#fff0c5'); text(c, active ? 'DROP!' : 'BASKET', 0, 16, 11, '#715236', 850); c.restore();
}

function hud(c: C, game: GameSnapshot, practice: boolean) {
  // Three compact top panels and a low instruction ribbon keep the center stage available.
  rounded(c, 24, 22, 302, 70, 18, '#173d34ee'); text(c, 'THE GREAT CORN MAZE', 44, 44, 12, '#cfca91', 850, 'left'); text(c, game.roomName, 44, 70, 23, '#fff1c7', 850, 'left', 262);
  rounded(c, 884, 22, 372, 70, 18, '#173d34ee'); text(c, `${game.collected} / ${game.goal} CORN`, 903, 43, 13, '#fff0c2', 850, 'left');
  for (let i = 0; i < game.goal; i++) { const x = 911 + i * 30; c.save(); c.globalAlpha = i < game.collected ? 1 : .25; corn(c, x, 71, .16, -.2); c.restore(); }
  text(c, `★ ${game.bonus}`, 1225, 58, 22, '#ffde86', 850, 'right');
  if (practice) { rounded(c, 533, 25, 214, 30, 15, '#ffebaf'); text(c, 'POINTER PRACTICE', 640, 41, 12, '#37513b', 850); }
  const copy = game.phase === 'won' ? 'You found all the corn and the way out. Amazing teamwork!' : game.message;
  rounded(c, 160, 670, 960, 36, 18, '#143a32f2'); text(c, copy, 640, 689, 16, '#fff0ca', 750);
}

function victory(c: C, time: number, game: GameSnapshot) {
  c.save(); c.fillStyle = '#173d3455'; c.fillRect(0, 105, W, 550);
  for (let i = 0; i < 40; i++) {
    const x = rand(i + 25) * W; const y = 112 + ((rand(i + 52) * 530 + time * (20 + rand(i) * 30)) % 530);
    c.save(); c.translate(x, y); c.rotate(time + i); c.fillStyle = ['#ffe7a3', '#f1a365', '#b8d786', '#d8a9df'][i % 4]; c.fillRect(-4, -7, 8, 14); c.restore();
  }
  rounded(c, 329, 192, 622, 286, 32, '#153d34f2'); c.strokeStyle = '#dfc67b'; c.lineWidth = 2; c.beginPath(); c.roundRect(339, 202, 602, 266, 26); c.stroke();
  text(c, 'GREAT TEAMWORK!', 640, 241, 16, '#e5cc86', 900); text(c, 'You escaped!', 640, 302, 60, '#fff1c5', 900); text(c, `${game.goal} corn collected · ${game.bonus} surprise stars`, 640, 362, 24, '#e8e5b6', 750); text(c, 'Start a new adventure from the admin console.', 640, 424, 17, '#a9c6a5', 650); c.restore();
}
