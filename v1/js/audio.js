// Web Audio API로 직접 합성하는 효과음 (외부 음원 없음)
import { store, save } from './store.js';

let ctx = null, master = null, sfxBus = null, engine = null;
let muted = !!store.muted;
let gestured = false;
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, () => { gestured = true; }, { capture: true, passive: true });
}

function ensure() {
  if (!gestured) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() { ensure(); }

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  store.muted = m;
  save();
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}

function tone(freq, dur, o = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime + (o.delay || 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
  const v = o.vol ?? 0.25;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.filter;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(sfxBus);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noise(dur, o = {}) {
  const c = ensure(); if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + (o.delay || 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.ftype || 'bandpass';
  f.frequency.setValueAtTime(o.f0 || 800, t0);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
  f.Q.value = o.q || 1;
  const g = c.createGain();
  const v = o.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

export const sfx = {
  click() { tone(660, 0.07, { type: 'triangle', vol: 0.18 }); tone(990, 0.06, { type: 'sine', vol: 0.08, delay: 0.02 }); },
  hover() { tone(880, 0.04, { type: 'sine', vol: 0.05 }); },
  start() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.07 })); },
  correct() {
    [659, 831, 988, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.06 }));
    tone(1975, 0.3, { type: 'sine', vol: 0.06, delay: 0.25 });
  },
  wrong() {
    tone(220, 0.22, { type: 'sawtooth', vol: 0.12, filter: 900, slide: 0.8 });
    tone(165, 0.32, { type: 'sawtooth', vol: 0.12, filter: 700, delay: 0.14, slide: 0.75 });
  },
  arrive() {
    [784, 1175, 1568].forEach((f, i) => tone(f, 0.9, { type: 'sine', vol: 0.14, delay: i * 0.09 }));
    tone(392, 0.6, { type: 'triangle', vol: 0.12 });
    noise(0.6, { f0: 3000, f1: 8000, vol: 0.05, ftype: 'highpass' });
  },
  coin() { tone(988, 0.08, { type: 'square', vol: 0.07 }); tone(1319, 0.18, { type: 'square', vol: 0.07, delay: 0.07 }); },
  bonus() { [523, 784, 1046, 1568, 2093].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.14, delay: i * 0.05 })); },
  whoosh() { noise(0.5, { f0: 400, f1: 2400, q: 0.8, vol: 0.12, attack: 0.05 }); },
  bump() { tone(110, 0.25, { type: 'sine', vol: 0.3, slide: 0.5 }); noise(0.2, { f0: 300, vol: 0.12, ftype: 'lowpass' }); },
  tick() { tone(1200, 0.04, { type: 'square', vol: 0.05 }); },
  tickUrgent() { tone(1500, 0.06, { type: 'square', vol: 0.09 }); },
  pin() { tone(520, 0.06, { type: 'triangle', vol: 0.14 }); },
  flagFall() { tone(900, 0.4, { type: 'sine', vol: 0.08, slide: 0.35 }); },
  thud() { tone(90, 0.3, { type: 'sine', vol: 0.35, slide: 0.6 }); noise(0.25, { f0: 500, vol: 0.12, ftype: 'lowpass' }); },
  beam() { tone(300, 0.9, { type: 'sawtooth', vol: 0.05, filter: 1800, slide: 3 }); tone(600, 0.9, { type: 'sine', vol: 0.06, slide: 2 }); },
  countUp() { tone(1400 + Math.random() * 200, 0.03, { type: 'square', vol: 0.03 }); },
  flip() { noise(0.18, { f0: 1200, f1: 4000, vol: 0.08 }); },
  star(i) { tone(880 * Math.pow(1.26, i), 0.35, { type: 'triangle', vol: 0.18 }); tone(1760 * Math.pow(1.26, i), 0.2, { type: 'sine', vol: 0.06, delay: 0.05 }); },
  fanfare() {
    const n = [523, 523, 659, 784, 659, 784, 1046];
    const d = [0, 0.12, 0.24, 0.36, 0.56, 0.68, 0.84];
    n.forEach((f, i) => tone(f, i === 6 ? 0.8 : 0.16, { type: 'triangle', vol: 0.18, delay: d[i] }));
    tone(262, 1.2, { type: 'sine', vol: 0.12, delay: 0.84 });
  },
  record() { [1046, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.06, delay: i * 0.08 })); },
  fuelLow() { tone(740, 0.12, { type: 'square', vol: 0.08 }); tone(740, 0.12, { type: 'square', vol: 0.08, delay: 0.2 }); },
};

// 엔진 소리 (속도에 따라 높낮이 변화)
export function engineStart() {
  const c = ensure(); if (!c || engine) return;
  const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
  const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 141;
  const lfo = c.createOscillator(); lfo.frequency.value = 18;
  const lfoG = c.createGain(); lfoG.gain.value = 6;
  lfo.connect(lfoG); lfoG.connect(o1.frequency);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  const g = c.createGain(); g.gain.value = 0.0001;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o1.start(); o2.start(); lfo.start();
  g.gain.setTargetAtTime(0.035, c.currentTime, 0.3);
  engine = { o1, o2, lfo, f, g };
}

export function engineUpdate(speed01, boost) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  engine.o1.frequency.setTargetAtTime(60 + speed01 * 55, t, 0.15);
  engine.o2.frequency.setTargetAtTime(120 + speed01 * 110, t, 0.15);
  engine.f.frequency.setTargetAtTime(boost ? 900 : 420, t, 0.2);
  engine.g.gain.setTargetAtTime(boost ? 0.05 : 0.032, t, 0.2);
}

export function engineStop() {
  if (!engine || !ctx) return;
  const e = engine; engine = null;
  e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
  setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.lfo.stop(); } catch (er) { /* 무시 */ } }, 600);
}
