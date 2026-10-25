import type { EffectEvent, Pose, SceneId, Settings } from './types';
import type { GameSnapshot } from './game-types';
import { drawCornBackground, drawCornForeground } from './corn-scene';

const W = 1280;
const H = 720;
type Palette = { sky: string[]; glow: string; hill: string; near: string; ink: string; accent: string; moon: string; fog: string; title: string; subtitle: string };
const PALETTES: Record<Exclude<SceneId, 'cornmaze'>, Palette> = {
  pumpkin: { sky: ['#17172e', '#48314b', '#bc705e'], glow: '#ffbc71', hill: '#372941', near: '#201f34', ink: '#181b2b', accent: '#ffbb74', moon: '#ffe7ac', fog: '#dfadc7', title: 'Pumpkin Hollow', subtitle: 'A little movement. A little magic.' },
  enchanted: { sky: ['#122137', '#274c61', '#788380'], glow: '#b3f7da', hill: '#204958', near: '#13323e', ink: '#112937', accent: '#b3f7da', moon: '#e2ffdd', fog: '#91dfd0', title: 'Enchanted Grove', subtitle: 'The forest is dancing with you.' },
  midnight: { sky: ['#101329', '#24284c', '#5b4e77'], glow: '#c7bbff', hill: '#242944', near: '#171c32', ink: '#12182a', accent: '#d4c5ff', moon: '#ebe4ff', fog: '#b4a9ef', title: 'Midnight Magic', subtitle: 'Small moves. Wonderful things.' },
};
type Particle = { kind: EffectEvent['kind']; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; rotation: number; spin: number; color: string; seed: number };
const rand = (seed: number) => { const a = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return a - Math.floor(a); };

/** Fully local, procedural scenery. Coordinates use the same normalized space as the camera. */
export class HalloweenScene {
  private ctx: CanvasRenderingContext2D;
  private backgrounds = new Map<SceneId, HTMLCanvasElement>();
  private particles: Particle[] = [];
  private previous = 0;
  private seen = new Set<string>();
  private effectCount = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Your browser could not start the scene canvas.');
    this.ctx = ctx;
  }

  trigger(effect: EffectEvent): void {
    if (this.seen.has(effect.id)) return;
    this.seen.add(effect.id);
    if (this.seen.size > 250) this.seen.delete(this.seen.values().next().value!);
    const x = Math.max(.08, Math.min(.92, effect.x ?? .5)) * W;
    const y = Math.max(.08, Math.min(.92, effect.y ?? .48)) * H;
    const n = effect.kind === 'bats' ? 14 : effect.kind === 'candy' ? 46 : 52;
    const colors = ['#ffe3a1', '#ffae69', '#d8b6ff', '#f791af', '#91e4d0'];
    for (let i = 0; i < n; i++) {
      const seed = i + (++this.effectCount) * 13;
      const angle = rand(seed) * Math.PI * 2;
      const speed = 90 + rand(seed + 10) * 245;
      this.particles.push({ kind: effect.kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (effect.kind === 'candy' ? 120 : 35), age: 0, life: effect.kind === 'bats' ? 3.1 : 2 + rand(seed + 5) * 1.3, size: effect.kind === 'bats' ? 14 + rand(seed + 6) * 16 : 5 + rand(seed + 6) * 8, rotation: rand(seed + 8) * 6.28, spin: (rand(seed + 9) - .5) * 7, color: colors[i % colors.length], seed });
    }
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);
  }

  render(timeMs: number, settings: Settings, peopleLayer?: CanvasImageSource | null, poses: Pose[] = [], demo = false, game?: GameSnapshot): void {
    const bounds = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round((bounds.width || W) * dpr));
    const ch = Math.max(1, Math.round((bounds.height || H) * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0c101c'; c.fillRect(0, 0, cw, ch);
    const scale = Math.min(cw / W, ch / H);
    c.translate((cw - W * scale) / 2, (ch - H * scale) / 2); c.scale(scale, scale);
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    const time = timeMs / 1000;
    const dt = Math.min(.05, Math.max(0, this.previous ? (timeMs - this.previous) / 1000 : 0));
    this.previous = timeMs;
    if (settings.scene === 'cornmaze') {
      drawCornBackground(c, time, game, demo);
      if (peopleLayer) { c.save(); c.drawImage(peopleLayer, 0, 0, W, H); c.restore(); }
      drawCornForeground(c, time, game, settings.gamePractice);
      this.effects(c, settings.paused ? 0 : dt, time);
      c.restore();
      return;
    }
    const p = PALETTES[settings.scene];
    c.drawImage(this.background(settings.scene), 0, 0);
    this.stars(c, time, p);
    this.ambient(c, time, p);
    // Human segmentation is a combined foreground layer, never an asserted per-person mask.
    if (peopleLayer) { c.save(); c.drawImage(peopleLayer, 0, 0, W, H); c.restore(); }
    if (demo) this.ghosts(c, time, p);
    if (!demo && poses.length && settings.motion) this.handSparkles(c, time, poses, p);
    this.fog(c, time, p);
    this.foreground(c, time, p);
    this.effects(c, settings.paused ? 0 : dt, time);
    this.caption(c, p, demo);
    c.restore();
  }

  private background(scene: Exclude<SceneId, 'cornmaze'>): HTMLCanvasElement {
    const existing = this.backgrounds.get(scene);
    if (existing) return existing;
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const c = layer.getContext('2d')!; const p = PALETTES[scene];
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, p.sky[0]); sky.addColorStop(.55, p.sky[1]); sky.addColorStop(1, p.sky[2]);
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    const horizon = c.createRadialGradient(650, 535, 10, 650, 535, 610);
    horizon.addColorStop(0, p.glow + '3b'); horizon.addColorStop(1, p.glow + '00');
    c.fillStyle = horizon; c.fillRect(0, 0, W, H);
    // The moon is cached so the soft bloom costs nothing during animation.
    const halo = c.createRadialGradient(1050, 131, 35, 1050, 131, 180);
    halo.addColorStop(0, p.moon + '48'); halo.addColorStop(.45, p.moon + '15'); halo.addColorStop(1, p.moon + '00');
    c.fillStyle = halo; c.fillRect(840, 0, 420, 345);
    c.fillStyle = p.moon; ellipse(c, 1050, 131, 65, 65);
    c.fillStyle = '#6f556e10'; ellipse(c, 1029, 108, 16, 12); ellipse(c, 1074, 146, 22, 17); ellipse(c, 1034, 159, 10, 9);
    c.strokeStyle = p.moon + '33'; c.lineWidth = 1;
    ellipseStroke(c, 1050, 131, 78, 78); ellipseStroke(c, 1050, 131, 87, 87);
    // Distance layers, softened with translucent dusk.
    c.fillStyle = p.hill + 'aa'; c.beginPath(); c.moveTo(0, 445); c.bezierCurveTo(260, 330, 368, 505, 620, 439); c.bezierCurveTo(900, 340, 1080, 390, 1280, 322); c.lineTo(W, H); c.lineTo(0, H); c.fill();
    c.fillStyle = p.hill; c.beginPath(); c.moveTo(0, 490); c.bezierCurveTo(170, 400, 318, 492, 510, 502); c.bezierCurveTo(775, 533, 989, 421, 1280, 460); c.lineTo(W, H); c.lineTo(0, H); c.fill();
    this.house(c, 1090, 446, .85, p);
    this.tree(c, 72, 542, 1.05, p.ink); this.tree(c, 1228, 530, .88, p.ink); this.tree(c, 185, 487, .41, p.hill);
    // Tiny distant lantern path.
    for (let i = 0; i < 7; i++) {
      const x = 965 + i * 19; const y = 463 + i * 8;
      c.strokeStyle = p.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 14); c.stroke();
      c.fillStyle = p.accent; c.fillRect(x - 2, y - 18, 4, 6);
    }
    c.fillStyle = p.near; c.beginPath(); c.moveTo(0, 598); c.bezierCurveTo(265, 542, 445, 573, 652, 575); c.bezierCurveTo(887, 580, 1060, 547, W, 582); c.lineTo(W, H); c.lineTo(0, H); c.fill();
    const stage = c.createRadialGradient(640, 636, 35, 640, 636, 540); stage.addColorStop(0, p.glow + '15'); stage.addColorStop(1, p.glow + '00');
    c.fillStyle = stage; c.fillRect(150, 530, 980, 190);
    c.strokeStyle = p.accent + '16'; c.lineWidth = 1;
    ellipseStroke(c, 640, 638, 407, 59); ellipseStroke(c, 640, 638, 375, 49);
    // Ornamental edges frame the action without boxing people into a small viewport.
    c.strokeStyle = p.accent + '42'; c.lineWidth = 1;
    [[32, 32, 1, 1], [1248, 32, -1, 1], [32, 688, 1, -1], [1248, 688, -1, -1]].forEach(([x, y, dx, dy]) => {
      c.beginPath(); c.moveTo(x + dx * 28, y); c.lineTo(x, y); c.lineTo(x, y + dy * 28); c.stroke();
      c.fillStyle = p.accent + '77'; diamond(c, x, y, 3);
    });
    this.backgrounds.set(scene, layer); return layer;
  }

  private stars(c: CanvasRenderingContext2D, time: number, p: Palette): void {
    for (let i = 0; i < 62; i++) {
      const x = rand(i + 92) * W; const y = 20 + rand(i + 202) * 365;
      const a = .2 + (.5 + .5 * Math.sin(time * .8 + i)) * .45;
      c.globalAlpha = a; c.fillStyle = p.moon;
      if (i % 8 === 0) sparkle(c, x, y, 3 + rand(i + 9) * 3); else ellipse(c, x, y, 1.1, 1.1);
    }
    c.globalAlpha = 1;
  }

  private ambient(c: CanvasRenderingContext2D, time: number, p: Palette): void {
    for (let i = 0; i < 22; i++) {
      const x = (rand(i + 602) * (W + 80) + Math.sin(time * .22 + i) * 30 + W) % (W + 80) - 40;
      const y = 400 + rand(i + 101) * 240 + Math.sin(time * .65 + i * .7) * 22;
      const alpha = .15 + Math.pow(.5 + Math.sin(time + i) * .5, 2) * .6;
      c.globalAlpha = alpha; c.fillStyle = p.accent; ellipse(c, x, y, 1.8, 1.8);
    }
    c.globalAlpha = .6; c.fillStyle = p.ink;
    for (let i = 0; i < 3; i++) {
      const x = (time * (12 + i * 3) + i * 147) % 1550 - 100;
      bat(c, x, 181 + Math.sin(time * .8 + i) * 15 + i * 32, 8 + i * 2, Math.sin(time * 6 + i));
    }
    c.globalAlpha = 1;
  }

  private tree(c: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string): void {
    c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = ink;
    c.beginPath(); c.moveTo(-25, 0); c.bezierCurveTo(-7, -100, -20, -160, -9, -244); c.lineTo(-36, -314); c.lineTo(-30, -342); c.lineTo(-18, -299); c.lineTo(0, -266); c.lineTo(10, -351); c.lineTo(24, -382); c.lineTo(18, -320); c.lineTo(19, -249); c.lineTo(57, -284); c.lineTo(75, -334); c.lineTo(82, -336); c.lineTo(73, -279); c.lineTo(33, -231); c.bezierCurveTo(17, -151, 20, -80, 36, 0); c.fill();
    c.strokeStyle = ink; c.lineCap = 'round';
    const branches = [[-3, -198, -58, -237, -84, -283, 13], [-54, -235, -99, -237, -121, -267, 8], [17, -157, 69, -205, 96, -257, 13], [68, -203, 109, -205, 133, -236, 7], [-10, -119, -57, -156, -79, -196, 10], [0, -272, -44, -279, -66, -316, 8]];
    for (const [sx, sy, cx, cy, ex, ey, w] of branches) { c.lineWidth = w; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(cx, cy, ex, ey); c.stroke(); }
    c.restore();
  }

  private house(c: CanvasRenderingContext2D, x: number, y: number, s: number, p: Palette): void {
    c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = p.ink;
    c.beginPath(); c.moveTo(-93, 0); c.lineTo(-93, -118); c.lineTo(-108, -118); c.lineTo(-56, -175); c.lineTo(-14, -124); c.lineTo(-14, -173); c.lineTo(-31, -173); c.lineTo(4, -228); c.lineTo(39, -173); c.lineTo(25, -173); c.lineTo(25, -112); c.lineTo(76, -146); c.lineTo(111, -103); c.lineTo(94, -103); c.lineTo(94, 0); c.fill();
    c.fillRect(47, -165, 11, 38); c.fillRect(43, -169, 19, 6);
    c.strokeStyle = p.accent + '26'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-104, -118); c.lineTo(-56, -169); c.lineTo(-11, -117); c.moveTo(-26, -173); c.lineTo(4, -222); c.lineTo(34, -173); c.stroke();
    c.fillStyle = p.accent;
    const windows = [[-61, -116], [-29, -78], [5, -161], [59, -99], [65, -51], [-66, -57]];
    for (const [wx, wy] of windows) {
      c.globalAlpha = .86; c.fillRect(wx - 6, wy, 12, 22); c.beginPath(); c.arc(wx, wy, 6, Math.PI, 0); c.fill();
      c.fillStyle = p.ink; c.fillRect(wx - 1, wy - 6, 2, 28); c.fillRect(wx - 6, wy + 7, 12, 2); c.fillStyle = p.accent;
    }
    c.globalAlpha = 1; c.fillStyle = '#090f20'; c.beginPath(); c.roundRect(-6, -42, 25, 48, [13, 13, 0, 0]); c.fill();
    c.restore();
  }

  private ghosts(c: CanvasRenderingContext2D, time: number, p: Palette): void {
    const specs = [{ x: 422, y: 390, s: .94, hat: 1, phase: 0 }, { x: 646, y: 405, s: 1.1, hat: 0, phase: 2 }, { x: 869, y: 397, s: .88, hat: 2, phase: 4 }];
    for (const g of specs) {
      const bob = Math.sin(time * 1.7 + g.phase) * 13;
      c.fillStyle = '#070b1b40'; ellipse(c, g.x, 625, 63 * g.s, 15 * g.s);
      c.save(); c.translate(g.x, g.y + bob); c.rotate(Math.sin(time + g.phase) * .045); c.scale(g.s, g.s);
      const body = c.createLinearGradient(0, -75, 0, 170); body.addColorStop(0, '#fff5df'); body.addColorStop(.6, '#f7e7d9'); body.addColorStop(1, '#bdb4da');
      c.shadowColor = p.accent + '35'; c.shadowBlur = 26; c.fillStyle = body;
      c.beginPath(); c.moveTo(-71, 135); c.bezierCurveTo(-65, 66, -68, 20, -63, -20); c.bezierCurveTo(-53, -100, 53, -100, 63, -20); c.bezierCurveTo(68, 20, 65, 66, 71, 135); c.quadraticCurveTo(55, 155, 38, 137); c.quadraticCurveTo(20, 120, 3, 141); c.quadraticCurveTo(-13, 157, -31, 137); c.quadraticCurveTo(-47, 121, -71, 135); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#fff1dc'; c.save(); c.translate(-58, 32); c.rotate(-.6 + Math.sin(time * 2 + g.phase) * .2); ellipse(c, -23, 0, 37, 15); c.restore();
      c.save(); c.translate(58, 32); c.rotate(.6 - Math.sin(time * 2 + g.phase) * .25); ellipse(c, 23, 0, 37, 15); c.restore();
      c.fillStyle = '#312e45'; ellipse(c, -21, -4, 6, 9); ellipse(c, 21, -4, 6, 9);
      c.fillStyle = '#f3b3ac'; ellipse(c, -37, 14, 11, 6); ellipse(c, 37, 14, 11, 6);
      c.strokeStyle = '#65526b'; c.lineWidth = 3.2; c.lineCap = 'round'; c.beginPath(); c.arc(0, 10, 11, .15, Math.PI - .15); c.stroke();
      c.fillStyle = '#fffdf5'; ellipse(c, -19, -7, 1.7, 2); ellipse(c, 23, -7, 1.7, 2);
      if (g.hat === 1) {
        c.fillStyle = '#584165'; c.beginPath(); c.moveTo(-46, -68); c.lineTo(-8, -152); c.quadraticCurveTo(10, -140, 25, -118); c.lineTo(17, -70); c.fill();
        c.fillStyle = '#9d7196'; c.beginPath(); c.moveTo(-34, -89); c.lineTo(19, -89); c.lineTo(18, -74); c.lineTo(-41, -74); c.fill();
        c.fillStyle = '#3b304e'; ellipse(c, -8, -68, 64, 11); c.fillStyle = '#f5c485'; diamond(c, -2, -82, 7);
      } else if (g.hat === 2) {
        c.fillStyle = '#dc859d'; c.beginPath(); c.moveTo(13, -62); c.bezierCurveTo(39, -93, 58, -77, 49, -57); c.bezierCurveTo(74, -59, 67, -29, 43, -37); c.closePath(); c.fill();
        c.fillStyle = '#f3abc0'; ellipse(c, 36, -56, 8, 9);
      } else {
        c.fillStyle = '#d9a276'; c.beginPath(); c.moveTo(-19, 50); c.lineTo(0, 65); c.lineTo(-19, 79); c.closePath(); c.fill(); c.beginPath(); c.moveTo(19, 50); c.lineTo(0, 65); c.lineTo(19, 79); c.closePath(); c.fill();
        c.fillStyle = '#f2c997'; ellipse(c, 0, 65, 7, 8);
      }
      c.restore();
    }
  }

  private handSparkles(c: CanvasRenderingContext2D, time: number, poses: Pose[], p: Palette): void {
    c.save();
    for (const pose of poses.slice(0, 3)) for (const i of [15, 16]) {
      const hand = pose.landmarks[i]; if (!hand || (hand.visibility ?? 1) < .55) continue;
      const x = hand.x * W; const y = hand.y * H;
      c.fillStyle = p.moon; c.globalAlpha = .65;
      for (let j = 0; j < 3; j++) {
        const a = time * 1.8 + j * Math.PI * 2 / 3 + pose.id;
        sparkle(c, x + Math.cos(a) * 22, y + Math.sin(a) * 17, 3 + Math.sin(time * 3 + j));
      }
    }
    c.restore();
  }

  private fog(c: CanvasRenderingContext2D, time: number, p: Palette): void {
    c.save();
    for (let i = 0; i < 3; i++) {
      const x = 180 + i * 450 + Math.sin(time * .1 + i * 2) * 120;
      const fog = c.createRadialGradient(x, 645 + i * 12, 3, x, 645 + i * 12, 310);
      fog.addColorStop(0, p.fog + '14'); fog.addColorStop(1, p.fog + '00');
      c.save(); c.translate(0, 610); c.scale(1, .27); c.translate(0, -610);
      c.fillStyle = fog; c.fillRect(x - 315, 320, 630, 650); c.restore();
    }
    c.restore();
  }

  private foreground(c: CanvasRenderingContext2D, time: number, p: Palette): void {
    c.fillStyle = p.ink; c.beginPath(); c.moveTo(0, 657); c.bezierCurveTo(160, 624, 222, 680, 360, 689); c.bezierCurveTo(560, 709, 800, 700, 960, 681); c.bezierCurveTo(1110, 654, 1200, 626, W, 646); c.lineTo(W, H); c.lineTo(0, H); c.fill();
    this.pumpkin(c, 80, 634, 1.1, time, true); this.pumpkin(c, 172, 665, .72, time + 1, false); this.pumpkin(c, 1202, 637, 1.03, time + 2, true); this.pumpkin(c, 1113, 665, .64, time + 3, false);
    c.strokeStyle = '#9c8f7560'; c.lineWidth = 1.5;
    for (let i = 0; i < 19; i++) {
      const left = i < 10; const x = left ? 14 + i * 21 : 1075 + (i - 10) * 22; const y = 685 + rand(i + 43) * 25;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 7, y - 16, x - 12 + Math.sin(time + i) * 2, y - 24 - rand(i) * 14); c.stroke();
    }
  }

  private pumpkin(c: CanvasRenderingContext2D, x: number, y: number, s: number, time: number, face: boolean): void {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#080f1c60'; ellipse(c, 2, 34, 54, 12);
    c.strokeStyle = '#a8ad6e'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -31); c.quadraticCurveTo(-4, -49, 6, -54); c.stroke();
    const glow = c.createRadialGradient(0, 1, 2, 0, 1, 75); glow.addColorStop(0, '#ffa24425'); glow.addColorStop(1, '#ffa24400'); c.fillStyle = glow; c.fillRect(-80, -80, 160, 160);
    const skin = c.createLinearGradient(0, -40, 0, 42); skin.addColorStop(0, '#fda04f'); skin.addColorStop(.4, '#e47838'); skin.addColorStop(1, '#9b432e');
    c.fillStyle = skin; ellipse(c, -21, 1, 28, 36); ellipse(c, 21, 1, 28, 36); ellipse(c, 0, 1, 31, 40);
    c.strokeStyle = '#853d342f'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, -34); c.bezierCurveTo(-25, -10, -25, 12, -13, 36); c.moveTo(12, -34); c.bezierCurveTo(25, -10, 25, 12, 13, 36); c.stroke();
    if (face) {
      c.fillStyle = '#fff2b1'; c.globalAlpha = .88 + Math.sin(time * 2) * .1;
      c.beginPath(); c.moveTo(-26, 2); c.lineTo(-16, -10); c.lineTo(-7, 2); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(7, 2); c.lineTo(16, -10); c.lineTo(26, 2); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-23, 13); c.quadraticCurveTo(0, 36, 23, 13); c.quadraticCurveTo(0, 24, -23, 13); c.fill();
    }
    c.restore();
  }

  private effects(c: CanvasRenderingContext2D, dt: number, time: number): void {
    c.save();
    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rotation += p.spin * dt;
      if (p.kind === 'candy') p.vy += 260 * dt;
      else if (p.kind === 'bats') { p.vy -= 20 * dt; p.vx += Math.sin(time * 3 + p.seed) * dt * 45; }
      else { p.vx *= Math.pow(.55, dt); p.vy *= Math.pow(.55, dt); }
      c.globalAlpha = Math.min(1, (p.life - p.age) / .65);
      c.save(); c.translate(p.x, p.y); c.rotate(p.kind === 'bats' ? Math.sin(time + p.seed) * .25 : p.rotation); c.fillStyle = p.color;
      if (p.kind === 'bats') { c.fillStyle = '#272439'; bat(c, 0, 0, p.size, Math.sin(time * 13 + p.seed)); c.fillStyle = '#ffdda1'; ellipse(c, -2, 0, 1.3, 1.3); ellipse(c, 2, 0, 1.3, 1.3); }
      else if (p.kind === 'magic') { sparkle(c, 0, 0, p.size * (1 - p.age / p.life * .6)); c.fillStyle = '#ffffff'; ellipse(c, 0, 0, 1.6, 1.6); }
      else {
        c.beginPath(); c.moveTo(-p.size * .65, -p.size * .32); c.lineTo(-p.size * 1.35, -p.size * .65); c.lineTo(-p.size * 1.35, p.size * .65); c.lineTo(-p.size * .65, p.size * .32); c.fill();
        c.beginPath(); c.moveTo(p.size * .65, -p.size * .32); c.lineTo(p.size * 1.35, -p.size * .65); c.lineTo(p.size * 1.35, p.size * .65); c.lineTo(p.size * .65, p.size * .32); c.fill();
        c.fillStyle = p.color; c.beginPath(); c.roundRect(-p.size * .75, -p.size * .55, p.size * 1.5, p.size * 1.1, 3); c.fill();
        c.strokeStyle = '#fff9de9c'; c.lineWidth = p.size * .24; c.beginPath(); c.moveTo(-p.size * .25, -p.size * .5); c.lineTo(p.size * .15, p.size * .5); c.stroke();
      }
      c.restore();
    }
    c.restore(); this.particles = this.particles.filter(p => p.age < p.life && p.y < H + 100 && p.x > -200 && p.x < W + 200);
  }

  private caption(c: CanvasRenderingContext2D, p: Palette, demo: boolean): void {
    c.save();
    c.fillStyle = p.accent; c.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif';
    spacedText(c, 'THE HALLOWEEN MOTION PLAYGROUND', 56, 61, 2.5);
    c.font = '48px Georgia, "Times New Roman", serif'; c.fillStyle = '#fff1dc'; c.fillText(p.title, 53, 120);
    c.fillStyle = '#eee3dfb0'; c.font = '16px -apple-system, BlinkMacSystemFont, sans-serif'; c.fillText(p.subtitle, 56, 151);
    c.strokeStyle = p.accent + '5e'; c.lineWidth = 1; c.beginPath(); c.moveTo(56, 174); c.lineTo(117, 174); c.stroke(); c.fillStyle = p.accent; diamond(c, 126, 174, 3);
    c.textAlign = 'center';
    if (demo) {
      c.fillStyle = '#141b2bc9'; c.beginPath(); c.roundRect(432, 655, 416, 31, 16); c.fill();
      c.fillStyle = '#d8cde1'; c.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'; c.fillText('SCENE PREVIEW  ·  Start the camera from your console', 640, 675);
    } else {
      c.fillStyle = '#f6e7d7a8'; c.font = '13px -apple-system, BlinkMacSystemFont, sans-serif'; c.fillText('Wave your hands  ·  Reach for the stars  ·  Make some magic', 640, 675);
    }
    c.restore();
  }
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function ellipseStroke(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.stroke(); }
function diamond(c: CanvasRenderingContext2D, x: number, y: number, r: number): void { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); }
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number): void { c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x + r * .17, y - r * .17, x + r, y); c.quadraticCurveTo(x + r * .17, y + r * .17, x, y + r); c.quadraticCurveTo(x - r * .17, y + r * .17, x - r, y); c.quadraticCurveTo(x - r * .17, y - r * .17, x, y - r); c.fill(); }
function bat(c: CanvasRenderingContext2D, x: number, y: number, size: number, flap: number): void { c.save(); c.translate(x, y); c.scale(size / 20, size / 20); const wing = -8 - flap * 8; c.beginPath(); c.moveTo(0, -1); c.quadraticCurveTo(-14, wing - 10, -27, wing); c.quadraticCurveTo(-23, 0, -17, 7); c.quadraticCurveTo(-12, 0, -9, 8); c.quadraticCurveTo(-4, 3, 0, 10); c.quadraticCurveTo(4, 3, 9, 8); c.quadraticCurveTo(12, 0, 17, 7); c.quadraticCurveTo(23, 0, 27, wing); c.quadraticCurveTo(14, wing - 10, 0, -1); c.fill(); c.beginPath(); c.moveTo(-5, 3); c.lineTo(-5, -9); c.lineTo(0, -5); c.lineTo(5, -9); c.lineTo(5, 3); c.fill(); c.restore(); }
function spacedText(c: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void { for (const letter of text) { c.fillText(letter, x, y); x += c.measureText(letter).width + spacing; } }
