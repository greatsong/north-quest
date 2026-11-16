// Web Audio API로 직접 합성하는 효과음 (외부 음원 없음)
let ctx = null, master = null, muted = false;
let hum = null;
try { muted = localStorage.getItem('nq-kaesong-mute') === '1'; } catch (e) { /* 무시 */ }

function ac() {
  if (!ctx && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlock() { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; ac(); }
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('nq-kaesong-mute', m ? '1' : '0'); } catch (e) { /* 무시 */ }
  if (master) master.gain.value = m ? 0 : 0.55;
}

function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
let noiseBuf = null;
function noise(dur, { vol = 0.3, at = 0, freq = 1200, q = 0.8, type = 'lowpass', slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + at;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone(660, 0.07, { type: 'triangle', vol: 0.18 }); },
  hover() { tone(990, 0.04, { type: 'sine', vol: 0.06 }); },
  open() { tone(520, 0.1, { type: 'triangle', vol: 0.15 }); tone(780, 0.14, { type: 'triangle', vol: 0.15, at: 0.06 }); },
  obs() {
    [880, 1175, 1568].forEach((f, i) => tone(f, 0.35, { type: 'sine', vol: 0.22, at: i * 0.07 }));
    tone(2349, 0.5, { type: 'sine', vol: 0.08, at: 0.2 });
  },
  stamp() {
    noise(0.25, { vol: 0.9, freq: 300, q: 0.5 });
    tone(90, 0.35, { type: 'sine', vol: 0.8, slide: 0.5 });
    tone(523, 0.3, { type: 'triangle', vol: 0.18, at: 0.25 });
    tone(784, 0.4, { type: 'triangle', vol: 0.18, at: 0.33 });
    tone(1047, 0.6, { type: 'triangle', vol: 0.2, at: 0.41 });
  },
  correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.08, at: i * 0.06 })); },
  wrong() { tone(220, 0.25, { type: 'sawtooth', vol: 0.12, slide: 0.7 }); tone(165, 0.3, { type: 'sawtooth', vol: 0.1, at: 0.1, slide: 0.7 }); },
  land() { noise(0.6, { vol: 0.5, freq: 600, slide: 0.3 }); tone(120, 0.3, { vol: 0.5, slide: 0.5, at: 0.35 }); noise(0.4, { vol: 0.35, freq: 900, at: 0.35 }); },
  takeoff() { noise(0.9, { vol: 0.35, freq: 300, slide: 6, type: 'bandpass', q: 1.2 }); tone(200, 0.8, { type: 'sawtooth', vol: 0.06, slide: 3 }); },
  whoosh() { noise(0.5, { vol: 0.3, freq: 500, slide: 5, type: 'bandpass', q: 1.5 }); },
  tick() { tone(1400, 0.03, { type: 'square', vol: 0.05 }); },
  fanfare() {
    const n = [523, 659, 784, 1047, 784, 1047, 1319];
    n.forEach((f, i) => tone(f, i === n.length - 1 ? 0.8 : 0.16, { type: 'square', vol: 0.09, at: i * 0.11 }));
    noise(1.2, { vol: 0.15, freq: 6000, type: 'highpass', at: 0.7 });
  },
  step() { noise(0.06, { vol: 0.06, freq: 700 }); },
  jump() { tone(300, 0.15, { type: 'triangle', vol: 0.1, slide: 2 }); },
};

// 드론 프로펠러 소리 (속도에 따라 높낮이가 변함)
export function droneHum(on, speed01 = 0) {
  const c = ctx; if (!c) return;
  if (on && !hum) {
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 140; o2.frequency.value = 147;
    f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    hum = { o1, o2, g, f };
  }
  if (!hum) return;
  const t = c.currentTime;
  if (!on) { hum.g.gain.setTargetAtTime(0, t, 0.15); return; }
  hum.g.gain.setTargetAtTime(0.03 + speed01 * 0.03, t, 0.2);
  hum.o1.frequency.setTargetAtTime(130 + speed01 * 90, t, 0.2);
  hum.o2.frequency.setTargetAtTime(137 + speed01 * 95, t, 0.2);
  hum.f.frequency.setTargetAtTime(500 + speed01 * 900, t, 0.2);
}
