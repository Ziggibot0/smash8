'use strict';
/* SMASH 8 — 8-bit platform fighter. 320x180 canvas, gamepad + keyboard. */

const W = 320, H = 180;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const COL = {
  sky: '#1a1030', sky2: '#241846',
  hillFar: '#2b2058', hill: '#3a2a70',
  plat: '#5b46a0', platTop: '#c9b8ff', platDark: '#2d2260',
  ink: '#0d0a18', white: '#f2eefa',
  red: '#e04a3a', blue: '#3a86e0', yellow: '#f2c14e', grey: '#8b86a8'
};

/* ---------------- physics / rules ---------------- */
const GRAV = 0.42, MAXFALL = 5.6;
const RUN = 1.65, AIRACC = 0.30, FRIC = 0.35, AIRFRIC = 0.06;
const JUMP_V = -5.5, JUMP2_V = -4.7;
const STOCKS = 3;
const BLAST = { l: -34, r: W + 34, t: -44, b: H + 16 };

const PLATFORMS = [
  { x: 60, y: 140, w: 200, h: 12 },
  { x: 28, y: 112, w: 44, h: 8 },
  { x: 248, y: 112, w: 44, h: 8 },
  { x: 130, y: 86, w: 60, h: 8 }
];
const SPAWN = [{ x: 96, y: 96 }, { x: 224, y: 96 }];

/* ---------------- sprites ---------------- */
const BODY_A = [
  '...kkkk...',
  '..kcccck..',
  '..kcccck..',
  '..kcwcck..',
  '..kcccck..',
  '...kkkk...',
  '..kddddk..',
  '.kddddddk.',
  '.kddddddk.',
  '..kddddk..',
  '..kddddk..',
  '..kk..kk..',
  '..kk..kk..',
  '.kkk..kkk.'
];
const BODY_B = [
  '...kkkk...',
  '..kcccck..',
  '..kcccck..',
  '..kcwcck..',
  '..kcccck..',
  '...kkkk...',
  '..kddddk..',
  '.kddddddk.',
  '.kddddddk.',
  '..kddddk..',
  '..kddddk..',
  '...kkkk...',
  '..kk..k...',
  '.kkk...kk.'
];
const SPR_W = 10, SPR_H = 14;
const sprCache = {};

function makeSprite(rows, c, d, tint) {
  const cnv = document.createElement('canvas');
  cnv.width = SPR_W; cnv.height = SPR_H;
  const c2 = cnv.getContext('2d');
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      let col = COL.ink;
      if (ch === 'c') col = tint || c;
      else if (ch === 'd') col = tint || d;
      else if (ch === 'w') col = tint || COL.white;
      c2.fillStyle = col;
      c2.fillRect(x, y, 1, 1);
    }
  }
  return cnv;
}
function sprite(color, frame, tint) {
  const key = color + frame + (tint || '');
  if (!sprCache[key]) {
    const dark = color === COL.red ? '#9c2b22' : '#22558f';
    sprCache[key] = makeSprite(frame === 'a' ? BODY_A : BODY_B, color, dark, tint);
  }
  return sprCache[key];
}

/* ---------------- bitmap text (thresholded, cached) ---------------- */
const txtCache = {};
function textSprite(str, color, px) {
  px = px || 8;
  const key = str + '|' + color + '|' + px;
  if (txtCache[key]) return txtCache[key];
  const o = document.createElement('canvas');
  let c2 = o.getContext('2d');
  c2.font = 'bold ' + px + 'px monospace';
  const w = Math.ceil(c2.measureText(str).width) + 2;
  o.width = Math.max(1, w); o.height = px + 3;
  c2 = o.getContext('2d');
  c2.font = 'bold ' + px + 'px monospace';
  c2.textBaseline = 'top';
  c2.fillStyle = '#fff';
  c2.fillText(str, 1, 1);
  const d = c2.getImageData(0, 0, o.width, o.height).data;
  const out = document.createElement('canvas');
  out.width = o.width; out.height = o.height;
  const oc = out.getContext('2d');
  const img = oc.createImageData(out.width, out.height);
  const rgb = hexRgb(color);
  for (let i = 0; i < out.width * out.height; i++) {
    if (d[i * 4 + 3] > 110) {
      img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255;
    }
  }
  oc.putImageData(img, 0, 0);
  txtCache[key] = { img: out, w: out.width, h: out.height };
  return txtCache[key];
}
function hexRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function drawText(str, x, y, color, align, scale) {
  scale = scale || 1;
  const t = scale > 1 ? textSprite(str, color, 8 * scale) : textSprite(str, color, 8);
  const w = t.w;
  let dx = x;
  if (align === 'center') dx = Math.round(x - w / 2);
  else if (align === 'right') dx = Math.round(x - w);
  ctx.drawImage(t.img, Math.round(dx), Math.round(y), w, t.h);
  return w;
}

/* ---------------- audio ---------------- */
let actx = null, muted = false;
function blip(freq, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = vol == null ? 0.04 : vol;
    o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* audio unavailable: play silent */ }
}

/* ---------------- input ---------------- */
const KEYMAP = {
  ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
  ArrowUp: 'U', KeyW: 'U', ArrowDown: 'DN', KeyS: 'DN',
  Space: 'A', KeyJ: 'X', KeyK: 'B', KeyZ: 'X', KeyX: 'B',
  Enter: 'ST', Escape: 'ST', KeyM: 'SEL'
};
const keys = {};
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) {
    keys[KEYMAP[e.code]] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  }
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });

function padState(gp) {
  const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  return {
    L: ax < -0.38 || b(14), R: ax > 0.38 || b(15),
    U: ay < -0.5 || b(12), DN: ay > 0.5 || b(13),
    A: b(0), X: b(2), B: b(1) || b(3), ST: b(9), SEL: b(8)
  };
}
const blank = () => ({ L: 0, R: 0, U: 0, DN: 0, A: 0, X: 0, B: 0, ST: 0, SEL: 0 });

function pollRaw() {
  const raw = [blank(), blank()];
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
  let slot = 0;
  for (let i = 0; i < pads.length && slot < 2; i++) {
    if (!pads[i] || !pads[i].connected) continue;
    raw[slot++] = padState(pads[i]);
  }
  if (slot === 0 && keys) {
    for (const k in keys) if (keys[k]) raw[0][k] = 1;
  }
  if (slot > 0) {
    // keyboard can still drive P1 on top of the pad (dev convenience)
    if (slot === 1) for (const k in keys) if (keys[k]) raw[0][k] = 1;
  }
  if (override) for (let p = 0; p < 2; p++) if (override[p]) Object.assign(raw[p], override[p]);
  return raw;
}

/* ---------------- fighters ---------------- */
function mkFighter(idx, color) {
  return {
    idx, color, x: SPAWN[idx].x, y: SPAWN[idx].y,
    vx: 0, vy: 0, face: idx === 0 ? 1 : -1, ground: false,
    dmg: 0, stocks: STOCKS, stun: 0, jumps: 1, cd: 0, specialCd: 0,
    invuln: 0, animT: 0, hitFlash: 0, atk: 0, dead: false, deadT: 0,
    prev: blank()
  };
}
let fighters = [], projectiles = [], particles = [];
let state = 'title';       // title | play | pause | over
let winner = null, hitstop = 0, frame = 0, shake = 0;
let override = null;      // debug input override, per-player

function resetMatch(twoPlayer) {
  fighters = [mkFighter(0, COL.red), mkFighter(1, COL.blue)];
  fighters[1].cpu = !twoPlayer;
  projectiles = []; particles = [];
  winner = null; hitstop = 0; shake = 0;
  state = 'play';
}

let prevRaw = [blank(), blank()];

function edges(cur, prev) {
  return {
    L: cur.L, R: cur.R, U: cur.U, DN: cur.DN,
    A: cur.A && !prev.A, X: cur.X && !prev.X, B: cur.B && !prev.B,
    ST: cur.ST && !prev.ST, SEL: cur.SEL && !prev.SEL
  };
}

/* ---------------- cpu ---------------- */
function cpuThink(p, opp, inp) {
  const dx = (opp.x + SPR_W / 2) - (p.x + SPR_W / 2);
  const dy = (opp.y) - (p.y);
  const adx = Math.abs(dx);
  const toward = dx > 0 ? 'R' : 'L';
  const away = dx > 0 ? 'L' : 'R';
  if (p.think == null || frame >= p.think) {
    p.think = frame + 6 + Math.floor(Math.random() * 8);
    p.plan = 'chase';
    if (p.y > 150) p.plan = 'recover';
    else if (adx < 26 && Math.abs(dy) < 22) p.plan = Math.random() < 0.75 ? 'hit' : 'wait';
    else if (adx > 90 && Math.random() < 0.4) p.plan = 'shoot';
  }
  if (p.stun > 0) return inp;
  if (p.plan === 'recover') {
    if (p.x < 90) inp.R = 1; else if (p.x > 230) inp.L = 1;
    if (p.jumps > 0 && p.vy > 0.6) inp.A = 1;
  } else if (p.plan === 'chase') {
    if (adx > 12) inp[toward] = 1;
    if (dy < -18 && Math.random() < 0.35 && p.jumps > 0) inp.A = 1;
    if (p.ground && adx < 40 && dy < -10 && Math.random() < 0.25) inp.A = 1;
  } else if (p.plan === 'hit') {
    if (adx > 20) inp[toward] = 1;
    if (p.cd <= 0 && Math.random() < 0.5) inp.X = 1;
    else if (p.specialCd <= 0 && Math.random() < 0.06) inp.B = 1;
  } else if (p.plan === 'shoot') {
    if (p.specialCd <= 0) inp.B = 1;
    if (adx > 150) inp[toward] = 1;
  } else if (p.plan === 'wait') {
    if (adx > 40) inp[toward] = 1;
  }
  // never walk off the stage edge
  if (p.ground && ((p.x < 40 && inp.L) || (p.x > 250 && inp.R))) { inp.L = 0; inp.R = 0; }
  return inp;
}

/* ---------------- combat ---------------- */
const MOVES = {
  melee: { dmg: 9, base: 1.45, scale: 0.050, lift: 0.9, startup: 2, active: 5, total: 15, range: 15 },
  shot: { dmg: 5, base: 1.05, scale: 0.042, lift: 0.35 }
};

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function hurtbox(p) { return { x: p.x + 1, y: p.y + 1, w: SPR_W - 2, h: SPR_H - 2 }; }

function applyHit(victim, attacker, mv, dirx, diry) {
  victim.dmg = Math.min(999, victim.dmg + mv.dmg);
  const kb = (mv.base + victim.dmg * mv.scale);
  const len = Math.hypot(dirx, diry) || 1;
  victim.vx = (dirx / len) * kb * 1.5;
  victim.vy = (diry / len) * kb * 1.2 - mv.lift;
  victim.stun = Math.max(4, Math.round(kb * 3.0));
  victim.ground = false;
  victim.hitFlash = 6;
  hitstop = 3; shake = Math.min(4, 1 + mv.dmg / 5);
  for (let i = 0; i < 6; i++) {
    particles.push({ x: victim.x + 5, y: victim.y + 7, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 14 });
  }
  blip(180 + victim.dmg, 0.07, 'square', 0.05);
}

function ko(p) {
  p.stocks--;
  p.dead = true; p.deadT = 0;
  blip(90, 0.35, 'triangle', 0.06);
  shake = 6;
  if (p.stocks <= 0) {
    state = 'over';
    winner = p.idx === 0 ? 1 : 0;
    blip(520, 0.18, 'square', 0.05);
  }
}

/* ---------------- update ---------------- */
function update() {
  frame++;
  // one poll per frame, edges latched once so a held button cannot cascade across states
  const raw = pollRaw();
  const ed = [edges(raw[0], prevRaw[0]), edges(raw[1], prevRaw[1])];
  prevRaw = [{ ...raw[0] }, { ...raw[1] }];

  if (state === 'title') {
    if (ed[0].ST || ed[0].A || ed[0].X) {
      resetMatch(!!(raw[1] && (raw[1].L || raw[1].R || raw[1].A || raw[1].X || raw[1].B)));
      blip(660, 0.08, 'square', 0.05);
    }
    return;
  }
  if (state === 'over') {
    if (ed[0].ST || ed[0].A) state = 'title';
    return;
  }
  if (state === 'pause') {
    if (ed[0].ST || ed[0].A) state = 'play';
    return;
  }
  if (hitstop > 0) { hitstop--; return; }
  if (shake > 0) shake *= 0.75;

  if (ed[0].SEL) muted = !muted;
  if (ed[0].ST) { state = 'pause'; return; }

  for (const p of fighters) {
    if (p.dead) {
      p.deadT++;
      if (p.deadT > 55) {
        p.dead = false; p.x = SPAWN[p.idx].x; p.y = SPAWN[p.idx].y;
        p.vx = 0; p.vy = 0; p.dmg = 0; p.stun = 0; p.invuln = 70; p.jumps = 1; p.ground = false;
      }
      continue;
    }
    let inp = ed[p.idx];
    if (p.cpu) inp = cpuThink(p, fighters[1 - p.idx], inp);
    drive(p, inp);
  }
  stepProjectiles();
  for (const p of fighters) checkKo(p);
  if (state === 'over') return;
  particles = particles.filter(q => {
    q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life--;
    return q.life > 0;
  });
}

function drive(p, inp) {
  if (p.stun > 0) { p.stun--; }
  else {
    const cap = p.ground ? RUN : RUN + 0.6;
    const acc = p.ground ? 0.55 : AIRACC;
    if (inp.L && p.vx > -cap) { p.vx -= acc; p.face = -1; }
    if (inp.R && p.vx < cap) { p.vx += acc; p.face = 1; }
    if (!inp.L && !inp.R) {
      if (p.ground) { if (Math.abs(p.vx) < FRIC) p.vx = 0; else p.vx -= Math.sign(p.vx) * FRIC; }
    }
    if (p.ground && Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * cap;

    if (inp.A) {
      if (p.ground) { p.vy = JUMP_V; p.ground = false; p.jumps = 1; blip(420, 0.05, 'square', 0.03); }
      else if (p.jumps > 0) { p.vy = JUMP2_V; p.jumps--; blip(520, 0.05, 'square', 0.03); }
    }
    if (inp.X && p.cd <= 0) { p.cd = MOVES.melee.total; p.atk = MOVES.melee.startup + MOVES.melee.active; blip(300, 0.04, 'square', 0.03); }
    if (inp.B && p.specialCd <= 0) {
      p.specialCd = 34;
      projectiles.push({
        x: p.x + (p.face > 0 ? SPR_W : -4), y: p.y + 5, w: 5, h: 3,
        vx: p.face * 2.4, life: 80, owner: p.idx
      });
      blip(760, 0.05, 'square', 0.03);
    }
  }
  if (p.cd > 0) p.cd--;
  if (p.specialCd > 0) p.specialCd--;
  if (p.hitFlash > 0) p.hitFlash--;
  if (p.invuln > 0) p.invuln--;
  // melee resolution (active frames only, one hit per swing)
  if (p.atk > 0 && p.atk <= MOVES.melee.active) {
    const box = {
      x: p.face > 0 ? p.x + SPR_W - 2 : p.x - MOVES.melee.range + 2,
      y: p.y + 3, w: MOVES.melee.range, h: 9
    };
    for (const o of fighters) {
      if (o === p || o.dead || o.invuln > 0 || o.hitFlash > 0) continue;
      if (overlap(box, hurtbox(o))) {
        const dx = (o.x + 5) - (p.x + 5);
        applyHit(o, p, MOVES.melee, dx === 0 ? p.face : Math.sign(dx), -0.45);
      }
    }
  }
  if (p.atk > 0) p.atk--;
  p.animT++;

  // physics
  p.vy += GRAV;
  if (p.vy > MAXFALL) p.vy = MAXFALL;
  const prevBottom = p.y + SPR_H;
  p.x += p.vx;
  p.y += p.vy;
  p.ground = false;
  for (const pl of PLATFORMS) {
    const bottom = p.y + SPR_H;
    if (p.vy >= 0 && prevBottom <= pl.y + 1 && bottom >= pl.y &&
        p.x + SPR_W > pl.x + 1 && p.x < pl.x + pl.w - 1) {
      p.y = pl.y - SPR_H; p.vy = 0; p.ground = true; p.jumps = 1;
    }
  }
  // no side clamps: the blast zones are the only walls
}

function stepProjectiles() {
  projectiles = projectiles.filter(s => {
    s.x += s.vx; s.life--;
    for (const o of fighters) {
      if (o.dead || o.idx === s.owner || o.invuln > 0) continue;
      if (overlap(s, hurtbox(o))) {
        applyHit(o, fighters[s.owner], MOVES.shot, Math.sign(s.vx), -0.5);
        return false;
      }
    }
    return s.life > 0 && s.x > -8 && s.x < W + 8;
  });
}

function checkKo(p) {
  if (p.dead) return;
  if (p.x < BLAST.l || p.x > BLAST.r || p.y > BLAST.b || p.y < BLAST.t) ko(p);
}

/* ---------------- render ---------------- */
const stars = [];
for (let i = 0; i < 56; i++) {
  stars.push({ x: (i * 137) % W, y: (i * 71) % 100, s: i % 5 === 0 });
}

function render() {
  ctx.save();
  const sh = shake > 0.4 ? (Math.random() - 0.5) * shake * 2 : 0;
  ctx.translate(Math.round(sh), Math.round(sh));

  // sky
  ctx.fillStyle = COL.sky;
  ctx.fillRect(-8, -8, W + 16, H + 16);
  ctx.fillStyle = COL.sky2;
  ctx.fillRect(-8, 40, W + 16, H - 40);
  for (const s of stars) {
    ctx.fillStyle = s.s ? COL.white : COL.grey;
    ctx.fillRect(s.x, s.y, 1, 1);
  }
  // hills
  ctx.fillStyle = COL.hillFar;
  for (let i = 0; i < 6; i++) {
    const hx = i * 60, hh = 34 + ((i * 37) % 18);
    for (let k = 0; k < hh; k++) {
      const halfW = Math.round((hh - k) * 1.1);
      ctx.fillRect(hx + 30 - halfW, 140 - k, halfW * 2, 1);
    }
  }
  ctx.fillStyle = COL.hill;
  for (let i = 0; i < 4; i++) {
    const hx = i * 96 + 14, hh = 22 + ((i * 53) % 14);
    for (let k = 0; k < hh; k++) {
      const halfW = Math.round((hh - k) * 1.35);
      ctx.fillRect(hx + 40 - halfW, 150 - k, halfW * 2, 1);
    }
  }

  // platforms
  for (const pl of PLATFORMS) {
    ctx.fillStyle = COL.platDark;
    ctx.fillRect(pl.x, pl.y + 3, pl.w, pl.h);
    ctx.fillStyle = COL.plat;
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h - 2);
    ctx.fillStyle = COL.platTop;
    ctx.fillRect(pl.x, pl.y, pl.w, 2);
    ctx.fillStyle = COL.platDark;
    for (let x = pl.x + 4; x < pl.x + pl.w - 2; x += 8) ctx.fillRect(x, pl.y + 4, 2, 2);
  }

  // particles
  for (const q of particles) {
    ctx.fillStyle = q.life > 7 ? COL.yellow : COL.white;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
  }

  // projectiles
  for (const s of projectiles) {
    ctx.fillStyle = s.owner === 0 ? COL.yellow : '#7fd6ff';
    ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h);
  }

  // fighters
  for (const p of fighters) {
    if (p.dead) continue;
    if (p.invuln > 0 && Math.floor(frame / 3) % 2 === 0) continue;
    const walking = p.ground && Math.abs(p.vx) > 0.3 && p.stun <= 0;
    const fr = walking ? (Math.floor(p.animT / 6) % 2 ? 'b' : 'a') : 'a';
    const img = sprite(p.color, fr, p.hitFlash > 2 ? COL.white : null);
    ctx.save();
    if (p.face < 0) {
      ctx.translate(Math.round(p.x) + SPR_W, Math.round(p.y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      ctx.save();
      if (p.atk > 0) { ctx.fillStyle = COL.white; ctx.fillRect(Math.round(p.x) - 12, Math.round(p.y) + 3, 12, 3); }
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.round(p.x), Math.round(p.y));
      ctx.restore();
      if (p.atk > 0) { ctx.fillStyle = COL.white; ctx.fillRect(Math.round(p.x) + SPR_W - 1, Math.round(p.y) + 3, 12, 3); }
    }
    // damage tag
    drawText(p.dmg + '%', p.x + SPR_W / 2, p.y - 9, p.dmg > 90 ? COL.red : COL.white, 'center');
  }

  if (state !== 'title') drawHud();
  if (state === 'title') drawTitle();
  if (state === 'pause') {
    ctx.fillStyle = 'rgba(13,10,24,0.7)';
    ctx.fillRect(0, 0, W, H);
    drawText('PAUSED', W / 2, 80, COL.white, 'center', 2);
    drawText('START = RESUME', W / 2, 104, COL.grey, 'center');
  }
  if (state === 'over') {
    ctx.fillStyle = 'rgba(13,10,24,0.75)';
    ctx.fillRect(0, 0, W, H);
    const col = winner === 0 ? COL.red : COL.blue;
    drawText(winner === 0 ? 'P1 WINS' : 'P2 WINS', W / 2, 66, col, 'center', 3);
    drawText('START = REMATCH', W / 2, 110, COL.white, 'center');
  }
  ctx.restore();
}

function drawHud() {
  for (const p of fighters) {
    const left = p.idx === 0;
    const x = left ? 6 : W - 6;
    const al = left ? 'left' : 'right';
    drawText(left ? 'P1' : 'P2', x, 5, p.color, al);
    drawText(p.dmg + '%', x, 15, COL.white, al, 2);
    for (let i = 0; i < STOCKS; i++) {
      const sx = left ? x + i * 7 : x - i * 7 - 5;
      ctx.fillStyle = i < p.stocks ? p.color : '#3a3352';
      ctx.fillRect(sx, 33, 5, 5);
    }
  }
}

function drawTitle() {
  ctx.fillStyle = 'rgba(13,10,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  drawText('SMASH 8', W / 2, 34, COL.yellow, 'center', 4);
  drawText('an 8-bit platform fighter', W / 2, 70, COL.grey, 'center');
  if (Math.floor(frame / 24) % 2 === 0)
    drawText('PRESS START', W / 2, 96, COL.white, 'center', 2);
  drawText('A JUMP (2x)   X HIT   B SHOOT', W / 2, 128, COL.white, 'center');
  drawText('START PAUSE   SELECT MUTE', W / 2, 140, COL.grey, 'center');
  drawText('PAD DEAD? CLICK SCREEN ONCE', W / 2, 152, COL.grey, 'center');
  drawText('P2: PRESS A ON 2ND PAD AT START', W / 2, 164, COL.grey, 'center');
}

/* ---------------- loop ---------------- */
let last = performance.now(), acc = 0;
function loop(t) {
  const dt = Math.min(120, t - last);
  last = t;
  acc += dt;
  let guard = 0;
  while (acc >= 1000 / 60 && guard++ < 5) { update(); acc -= 1000 / 60; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- debug / test hook ---------------- */
window.GAME = {
  version: '1.0',
  get state() { return state; },
  get winner() { return winner; },
  get fighters() { return fighters; },
  get projectiles() { return projectiles; },
  setOverride(o) { override = o; },
  resetMatch(twoPlayer) { resetMatch(!!twoPlayer); },
  step(n) { for (let i = 0; i < (n || 1); i++) update(); },
  start1P() { resetMatch(false); }
};
