// 효과음(Web Audio 합성)과 화면 효과(파티클, 흔들림, 점수 팝업, 시간 포털)

// ================= 효과음 =================
let ctx = null, master = null, muted = false, unlocked = false;
function ac() {
  if (!unlocked) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
}
export function isMuted() { return muted; }
export function unlockAudio() { unlocked = true; ac(); }

function tone({ f = 440, f2 = null, t = 0, d = 0.15, type = 'sine', g = 0.3, a = 0.005, q = null, dest = null }) {
  const c = ac(); if (!c || muted) return;
  const now = c.currentTime + t;
  const o = c.createOscillator(); const gn = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + d);
  gn.gain.setValueAtTime(0.0001, now);
  gn.gain.exponentialRampToValueAtTime(g, now + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
  let node = o;
  if (q) { const fl = c.createBiquadFilter(); fl.type = q.type || 'lowpass'; fl.frequency.value = q.f; fl.Q.value = q.Q || 1; o.connect(fl); node = fl; }
  node.connect(gn); gn.connect(dest || master);
  o.start(now); o.stop(now + d + 0.05);
}
function noise({ t = 0, d = 0.3, g = 0.2, f = 1200, f2 = null, type = 'bandpass', Q = 1 }) {
  const c = ac(); if (!c || muted) return;
  const now = c.currentTime + t;
  const len = Math.ceil(c.sampleRate * d);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = Q; fl.frequency.setValueAtTime(f, now);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + d);
  const gn = c.createGain();
  gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(g, now + 0.02);
  gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
  src.connect(fl); fl.connect(gn); gn.connect(master);
  src.start(now); src.stop(now + d + 0.05);
}

export const sfx = {
  click() { tone({ f: 1400, f2: 900, d: 0.06, type: 'square', g: 0.08, q: { f: 3000 } }); },
  hover() { tone({ f: 2200, d: 0.03, type: 'sine', g: 0.04 }); },
  dial() { tone({ f: 600, f2: 1200, d: 0.09, type: 'triangle', g: 0.12 }); noise({ d: 0.08, g: 0.05, f: 4000 }); },
  warp() {
    tone({ f: 80, f2: 900, d: 1.6, type: 'sawtooth', g: 0.12, a: 0.3, q: { f: 900, Q: 4 } });
    tone({ f: 120, f2: 1800, d: 1.8, type: 'sine', g: 0.15, a: 0.4 });
    noise({ d: 1.8, g: 0.16, f: 300, f2: 6000, Q: 2 });
    tone({ f: 1760, d: 0.5, t: 1.7, type: 'sine', g: 0.12 });
  },
  arrive() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, d: 0.6, t: i * 0.06, type: 'triangle', g: 0.13 }));
    noise({ d: 0.5, g: 0.1, f: 800, f2: 200, type: 'lowpass' });
  },
  open() { tone({ f: 300, f2: 1600, d: 0.25, type: 'sine', g: 0.12 }); tone({ f: 2400, d: 0.2, t: 0.18, type: 'sine', g: 0.05 }); },
  correct(combo = 0) {
    const base = 660 * Math.pow(1.06, Math.min(combo, 8));
    [1, 1.25, 1.5, 2].forEach((m, i) => tone({ f: base * m, d: 0.25, t: i * 0.07, type: 'square', g: 0.07, q: { f: 4000 } }));
    tone({ f: base * 2, d: 0.6, t: 0.28, type: 'sine', g: 0.1 });
  },
  wrong() {
    tone({ f: 180, f2: 90, d: 0.4, type: 'sawtooth', g: 0.15, q: { f: 700 } });
    tone({ f: 190, f2: 95, d: 0.4, t: 0.02, type: 'square', g: 0.08, q: { f: 500 } });
  },
  place() { tone({ f: 900, f2: 1500, d: 0.08, type: 'triangle', g: 0.12 }); tone({ f: 1500, d: 0.1, t: 0.06, type: 'sine', g: 0.08 }); },
  lock() { tone({ f: 400, f2: 200, d: 0.15, type: 'square', g: 0.08, q: { f: 1500 } }); noise({ d: 0.2, g: 0.1, f: 2000 }); },
  reveal() { tone({ f: 200, f2: 2000, d: 0.5, type: 'sine', g: 0.12 }); noise({ d: 0.4, g: 0.06, f: 1000, f2: 5000 }); },
  tick() { tone({ f: 1800, d: 0.04, type: 'square', g: 0.06 }); },
  alarm() {
    for (let i = 0; i < 3; i++) { tone({ f: 880, f2: 620, d: 0.22, t: i * 0.28, type: 'sawtooth', g: 0.09, q: { f: 2000 } }); }
    noise({ d: 0.9, g: 0.08, f: 3000, Q: 6 });
  },
  collect() { [1319, 1568, 2093, 2637].forEach((f, i) => tone({ f, d: 0.3, t: i * 0.05, type: 'sine', g: 0.08 })); },
  fanfare() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => tone({ f, d: i === seq.length - 1 ? 0.9 : 0.18, t: i * 0.11, type: 'square', g: 0.07, q: { f: 3500 } }));
    seq.forEach((f, i) => tone({ f: f / 2, d: 0.2, t: i * 0.11, type: 'triangle', g: 0.08 }));
  },
  fail() { [440, 370, 311, 262].forEach((f, i) => tone({ f, d: 0.3, t: i * 0.16, type: 'triangle', g: 0.12 })); },
  record() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ f, d: 0.35, t: i * 0.07, type: 'sine', g: 0.1 })); },
};

// ================= 파티클 =================
let pc = null, pctx = null, parts = [], running = false;
export function initFx(canvas) {
  pc = canvas; pctx = canvas.getContext('2d');
  const rs = () => { pc.width = innerWidth * Math.min(devicePixelRatio, 2); pc.height = innerHeight * Math.min(devicePixelRatio, 2); };
  rs(); addEventListener('resize', rs);
}
function loop() {
  if (!pctx) return;
  const s = pc.width / innerWidth;
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, pc.width, pc.height);
  pctx.setTransform(s, 0, 0, s, 0, 0);
  pctx.globalCompositeOperation = 'lighter';
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.life -= 1 / 60; p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    const a = Math.max(0, Math.min(1, p.life / p.max));
    pctx.globalAlpha = a;
    pctx.fillStyle = p.c;
    if (p.shape === 'spark') {
      pctx.beginPath(); pctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, 6.283); pctx.fill();
    } else {
      pctx.save(); pctx.translate(p.x, p.y); pctx.rotate(p.rot);
      pctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8); pctx.restore();
    }
  }
  pctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop); else { running = false; pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pc.width, pc.height); }
}
export function burst(x, y, { n = 40, colors = ['#3ff4ff', '#ffb547', '#ffffff'], speed = 7, shape = 'spark', g = 0.12, life = 1.1, r = 3 } = {}) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random());
    parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (shape === 'confetti' ? 4 : 0), g, drag: 0.97,
      life: life * (0.6 + Math.random() * 0.6), max: life, c: colors[i % colors.length], r: r * (0.6 + Math.random()), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, shape });
  }
  if (!running) { running = true; requestAnimationFrame(loop); }
}
export function confetti() {
  const cols = ['#3ff4ff', '#ffb547', '#ff5d6c', '#b8ff5a', '#c39bff', '#ffffff'];
  burst(innerWidth * 0.25, innerHeight * 0.55, { n: 70, colors: cols, speed: 12, shape: 'confetti', g: 0.22, life: 2.2, r: 5 });
  burst(innerWidth * 0.75, innerHeight * 0.55, { n: 70, colors: cols, speed: 12, shape: 'confetti', g: 0.22, life: 2.2, r: 5 });
}

// ================= 흔들림 · 팝업 · 플래시 =================
export function shake(el = document.body, strength = 1) {
  el.classList.remove('shake'); void el.offsetWidth;
  el.style.setProperty('--shake', strength);
  el.classList.add('shake');
}
export function flash(color = 'rgba(63,244,255,.35)') {
  const f = document.getElementById('flash');
  if (!f) return;
  f.style.background = `radial-gradient(circle at 50% 50%, transparent 30%, ${color})`;
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
export function popScore(text, x, y, cls = '') {
  const el = document.createElement('div');
  el.className = 'score-pop ' + cls;
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
export function toast(text, cls = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.innerHTML = text;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}
/** 숫자가 올라가며 채워지는 효과 */
export function countUp(el, to, dur = 900) {
  const from = 0, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString('ko-KR');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ================= 시간 포털 =================
export function portal({ color = '#3ff4ff', title = '', span = '', year = null, dur = 2300 } = {}) {
  return new Promise((resolve) => {
    const wrap = document.getElementById('portal');
    const cv = wrap.querySelector('canvas');
    const t1 = wrap.querySelector('.p-title'), t2 = wrap.querySelector('.p-span'), yc = wrap.querySelector('.p-year');
    t1.textContent = title; t2.textContent = span;
    wrap.style.setProperty('--pc', color);
    wrap.classList.add('on');
    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const g = cv.getContext('2d');
    const streaks = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 40, v: 2 + Math.random() * 10, w: Math.random() * 2 + 0.5 }));
    const t0 = performance.now();
    const startYear = 2026;
    sfx.warp();
    const frame = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const sp = k < 0.7 ? k / 0.7 : 1 - (k - 0.7) / 0.3 * 0.6;
      g.fillStyle = `rgba(2,6,14,${0.25 + 0.2 * (1 - sp)})`;
      g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      g.globalCompositeOperation = 'lighter';
      for (const s of streaks) {
        s.r += s.v * (1 + sp * 6);
        if (s.r > Math.hypot(W, H) / 1.5) s.r = Math.random() * 30;
        const r0 = s.r, r1 = s.r + s.v * sp * 14 + 4;
        g.strokeStyle = color; g.globalAlpha = Math.min(1, s.r / 200) * 0.8; g.lineWidth = s.w;
        g.beginPath(); g.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); g.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); g.stroke();
      }
      // 동심원
      for (let i = 0; i < 6; i++) {
        const rr = ((t / 6 + i * 80) % 480) * (0.6 + sp);
        g.globalAlpha = 0.25 * (1 - rr / 700); g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, rr, 0, 6.283); g.stroke();
      }
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 220 * (0.5 + sp));
      grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.2, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.35 + 0.4 * sp; g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, 300, 0, 6.283); g.fill();
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (year != null) {
        const e = Math.min(1, k / 0.75); const ee = 1 - Math.pow(1 - e, 3);
        const y = Math.round(startYear + (year - startYear) * ee);
        yc.textContent = y < 0 ? `기원전 ${-y}` : `${y}`;
      } else yc.textContent = '∞';
      if (k < 1) requestAnimationFrame(frame);
      else {
        wrap.classList.add('out');
        setTimeout(() => { wrap.classList.remove('on', 'out'); g.clearRect(0, 0, W, H); }, 450);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
