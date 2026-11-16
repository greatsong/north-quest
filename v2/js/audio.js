// Web Audio로 직접 합성하는 효과음 (외부 음원 없음)
let ctx = null, master = null, muted = false;

export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { ctx = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

function tone({ f = 440, f2 = null, t = 0.15, type = 'sine', v = 0.25, delay = 0, attack = 0.006 }) {
  if (!ctx || muted) return;
  const now = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + t);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  o.connect(g); g.connect(master);
  o.start(now); o.stop(now + t + 0.05);
}
let noiseBuf = null;
function noise({ t = 0.2, v = 0.2, delay = 0, f = 2000, f2 = null, q = 1, type = 'bandpass' }) {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const now = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(now); s.stop(now + t + 0.05);
}

export const sfx = {
  click() { tone({ f: 620, f2: 900, t: 0.07, type: 'triangle', v: 0.16 }); },
  hover() { tone({ f: 900, t: 0.04, type: 'sine', v: 0.05 }); },
  hop(i = 0) { tone({ f: 260 + (i % 3) * 30, f2: 480 + (i % 3) * 40, t: 0.09, type: 'sine', v: 0.07 }); },
  splash() { noise({ t: 0.18, v: 0.08, f: 1800, f2: 600 }); },
  pop() { tone({ f: 280, f2: 1250, t: 0.14, type: 'sine', v: 0.3 }); tone({ f: 1300, f2: 1900, t: 0.1, type: 'triangle', v: 0.1, delay: 0.07 }); },
  flip() { noise({ t: 0.14, v: 0.16, f: 2500, f2: 5000, q: 0.8 }); tone({ f: 500, f2: 700, t: 0.06, type: 'triangle', v: 0.05, delay: 0.05 }); },
  draw() { noise({ t: 0.22, v: 0.12, f: 1200, f2: 3800, q: 0.7 }); },
  correct() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: 0.22, type: 'triangle', v: 0.17, delay: i * 0.07 })); tone({ f: 2093, t: 0.3, type: 'sine', v: 0.05, delay: 0.3 }); },
  wrong() { tone({ f: 240, f2: 170, t: 0.28, type: 'square', v: 0.07 }); tone({ f: 180, f2: 120, t: 0.32, type: 'square', v: 0.06, delay: 0.12 }); },
  coin() { tone({ f: 988, t: 0.07, type: 'square', v: 0.06 }); tone({ f: 1319, t: 0.2, type: 'square', v: 0.06, delay: 0.07 }); },
  arrive() { [392, 523, 659].forEach((f, i) => tone({ f, t: 0.18, type: 'triangle', v: 0.14, delay: i * 0.08 })); },
  throw() { noise({ t: 0.35, v: 0.12, f: 600, f2: 3000, q: 1.2 }); },
  hit() { tone({ f: 160, f2: 60, t: 0.18, type: 'sine', v: 0.4 }); noise({ t: 0.08, v: 0.15, f: 900, type: 'lowpass' }); },
  tick() { tone({ f: 1500, t: 0.04, type: 'square', v: 0.05 }); },
  combo(n = 1) { const b = 523 * Math.pow(1.122, Math.min(n, 8)); tone({ f: b, t: 0.1, type: 'square', v: 0.06 }); tone({ f: b * 1.5, t: 0.16, type: 'square', v: 0.06, delay: 0.08 }); },
  chance() { [784, 988, 1175, 1568].forEach((f, i) => tone({ f, t: 0.14, type: 'sine', v: 0.14, delay: i * 0.06 })); },
  fanfare() {
    const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.4], [784, 0.56], [1047, 0.68]];
    seq.forEach(([f, d]) => { tone({ f, t: 0.26, type: 'triangle', v: 0.16, delay: d }); tone({ f: f / 2, t: 0.26, type: 'sine', v: 0.08, delay: d }); });
  },
  lose() { [392, 330, 262].forEach((f, i) => tone({ f, t: 0.3, type: 'triangle', v: 0.13, delay: i * 0.16 })); },
  record() { [784, 1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, t: 0.12, type: 'square', v: 0.05, delay: i * 0.05 })); },
};
