// 화면 효과: 토스트, 떠오르는 숫자, 폭죽, 흔들림, 카드 뒤집기
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, kind = '') {
  const box = $('#toasts');
  const el = h(`<div class="toast ${kind}">${msg}</div>`);
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2300);
  setTimeout(() => el.remove(), 2800);
}

export function floatText(x, y, text, cls = '') {
  const el = h(`<div class="float ${cls}">${text}</div>`);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  $('#fx').appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

export function shake(power = 1) {
  const s = $('#stage');
  s.style.setProperty('--sh', power * 7 + 'px');
  s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
}

// 폭죽·반짝이 입자 (캔버스 하나)
const parts = [];
let cv = null, cx = null, running = false, lastT = 0;
function loop(now) {
  const w = cv.width, ht = cv.height, dpr = window.devicePixelRatio || 1;
  // 프레임 수가 아니라 실제 시간 기준으로 움직인다(느린 기기에서도 같은 길이)
  const f = Math.min(4, Math.max(0.25, lastT ? (now - lastT) / 16.67 : 1));
  lastT = now;
  cx.clearRect(0, 0, w, ht);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += f / 60;
    const dr = Math.pow(p.drag, f);
    p.vy += p.g * f; p.vx *= dr; p.vy *= dr;
    p.x += p.vx * f; p.y += p.vy * f; p.rot += p.vr * f;
    const a = 1 - p.t / p.life;
    if (a <= 0) { parts.splice(i, 1); continue; }
    cx.save();
    cx.globalAlpha = Math.min(1, a * 1.5);
    cx.translate(p.x * dpr, p.y * dpr); cx.rotate(p.rot);
    cx.fillStyle = p.c;
    if (p.shape === 'star') {
      cx.beginPath();
      for (let k = 0; k < 10; k++) { const r = (k % 2 ? 0.45 : 1) * p.s * dpr, an = k * Math.PI / 5; cx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      cx.fill();
    } else if (p.shape === 'dot') {
      cx.beginPath(); cx.arc(0, 0, p.s * dpr * 0.6, 0, Math.PI * 2); cx.fill();
    } else cx.fillRect(-p.s * dpr / 2, -p.s * dpr / 4, p.s * dpr, p.s * dpr / 2);
    cx.restore();
  }
  if (parts.length) requestAnimationFrame(loop); else { running = false; lastT = 0; }
}
function ensure() {
  if (!cv) { cv = $('#confetti'); cx = cv.getContext('2d'); }
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  if (!running) { running = true; requestAnimationFrame(loop); }
}
const PAL = ['#ff6f61', '#ffd166', '#4fd1b5', '#6ec3ff', '#b68cff', '#ff9fd0'];
export function burst(x, y, n = 24, { colors = PAL, shape = 'star', speed = 6, g = 0.12 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g, drag: 0.96, t: 0, life: 0.9 + Math.random() * 0.5,
      c: colors[i % colors.length], s: 6 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, shape });
  }
  ensure();
}
export function confetti(n = 140) {
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    parts.push({ x: left ? -10 : innerWidth + 10, y: innerHeight * (0.5 + Math.random() * 0.4),
      vx: (left ? 1 : -1) * (5 + Math.random() * 9), vy: -(8 + Math.random() * 10), g: 0.28, drag: 0.985, t: 0, life: 2.2 + Math.random(),
      c: PAL[i % PAL.length], s: 8 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, shape: Math.random() < 0.3 ? 'star' : 'rect' });
  }
  ensure();
}

/** 카드 뒤집기: 절반 돌린 뒤 swap() 실행, 다시 펼침 */
export function flip(el, swap, dur = 170) {
  if (!el.animate) { swap(); return Promise.resolve(); }
  return new Promise((res) => {
    el.animate([{ transform: 'perspective(900px) rotateY(0deg)' }, { transform: 'perspective(900px) rotateY(90deg)' }], { duration: dur, easing: 'ease-in' }).onfinish = () => {
      swap();
      el.animate([{ transform: 'perspective(900px) rotateY(-90deg)' }, { transform: 'perspective(900px) rotateY(0deg)' }], { duration: dur, easing: 'ease-out' }).onfinish = res;
    };
  });
}

export function countUp(el, to, dur = 900) {
  const t0 = performance.now();
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('ko-KR');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const ICON = {
  boot: '<svg viewBox="0 0 24 24"><path d="M7 2h6v9l6 3c1.5.8 2 2 2 3.5V20H3v-3l2-1V2z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z" fill="currentColor"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-3" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z" fill="currentColor"/><rect x="9" y="19.5" width="6" height="2.5" rx="1" fill="currentColor"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M14 3h6v18h-6M10 8l-4 4 4 4M6 12h10" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><rect x="11" y="10" width="2.4" height="8" rx="1" fill="#fff"/><circle cx="12.2" cy="6.8" r="1.5" fill="#fff"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="9" fill="currentColor"/><path d="M12 8v5l3 2" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z" fill="currentColor"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" fill="currentColor"/></svg>',
};
