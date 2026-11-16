// 화면 요소 공통 도우미: 모달·카드·퀴즈·토스트·점수 튀어 오르기·폭죽·흔들림
import { sfx } from './audio.js';
import { eraColor, eraList } from './data.js';
import { store, solvedCount } from './store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(t) {
  return String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

// ---------- 화면 전환 ----------
export function showScreen(id) {
  for (const s of $$('.screen')) s.classList.toggle('show', s.id === id);
}
export function showHud(id) {
  for (const s of $$('.hud')) s.classList.toggle('show', s.id === id);
}

// ---------- 모달 ----------
export function openModal(html, cls = '') {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal ' + cls;
  wrap.innerHTML = `<div class="modal-dim"></div><div class="modal-body">${html}</div>`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  return wrap;
}
export function closeModal(wrap) {
  if (!wrap || !wrap.parentNode) return;
  wrap.classList.remove('in');
  wrap.classList.add('out');
  setTimeout(() => wrap.remove(), 260);
}
export function anyModalOpen() { return $('#modal-root').children.length > 0; }

// ---------- 토스트·배너 ----------
export function toast(msg, type = '') {
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  root.appendChild(t);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 2600);
}

export function banner(text, sub = '', cls = '', dur = 1400) {
  const b = document.createElement('div');
  b.className = 'banner ' + cls;
  b.innerHTML = `<div class="banner-main">${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
  $('#banner-root').appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 400); }, dur);
}

export function popScore(text, x, y, cls = '') {
  const e = document.createElement('div');
  e.className = 'pop ' + cls;
  e.textContent = text;
  e.style.left = x + 'px'; e.style.top = y + 'px';
  $('#banner-root').appendChild(e);
  setTimeout(() => e.remove(), 1300);
}

// ---------- 흔들림 ----------
export const shakeState = { mag: 0 };
export function shake(m = 0.6) {
  shakeState.mag = Math.max(shakeState.mag, m);
  const ui = $('#ui');
  ui.classList.remove('shake'); void ui.offsetWidth; ui.classList.add('shake');
}

// ---------- 폭죽 ----------
const fx = { parts: [], ctx: null, cv: null };
export function initFx() {
  fx.cv = $('#fx');
  fx.ctx = fx.cv.getContext('2d');
  const rs = () => { const d = Math.min(2, window.devicePixelRatio || 1); fx.cv.width = innerWidth * d; fx.cv.height = innerHeight * d; fx.ctx.setTransform(d, 0, 0, d, 0, 0); };
  rs(); addEventListener('resize', rs);
}
const COLS = ['#ff5a4e', '#ffc94a', '#2ed3b7', '#7cc7ff', '#ff7ab6', '#ffffff', '#b07cff'];
export function burst(x, y, n = 60, o = {}) {
  const cols = o.colors || COLS;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (o.speed || 420) * (0.35 + Math.random() * 0.8);
    fx.parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 200), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      c: cols[(Math.random() * cols.length) | 0], life: 1, decay: 0.55 + Math.random() * 0.5,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, shape: o.shape || (Math.random() < 0.3 ? 'star' : 'rect'),
    });
  }
}
export function sparkle(x, y, n = 18, color = '#ffe27a') {
  burst(x, y, n, { colors: [color, '#ffffff'], speed: 220, up: 40, shape: 'star' });
}
export function fxUpdate(dt) {
  const c = fx.ctx; if (!c) return;
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
    p.vy += 700 * dt; p.vx *= 0.985; p.vy *= 0.985;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.min(1, p.life * 2);
    c.fillStyle = p.c;
    if (p.shape === 'star') {
      c.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? p.w * 0.45 : p.w; const a = k * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fill();
    } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    c.restore();
  }
}

// ---------- 아이콘 ----------
export const ICONS = {
  nature: '<svg viewBox="0 0 64 64"><path d="M4 54 L22 22 L30 34 L40 14 L60 54 Z" fill="currentColor" opacity=".9"/><path d="M40 14 L46 26 L42 24 L38 28 L35 23 Z" fill="#fff" opacity=".85"/></svg>',
  history: '<svg viewBox="0 0 64 64"><path d="M6 22 Q32 6 58 22 L52 22 L52 26 L12 26 L12 22 Z" fill="currentColor"/><rect x="16" y="26" width="5" height="26" fill="currentColor"/><rect x="43" y="26" width="5" height="26" fill="currentColor"/><rect x="10" y="30" width="44" height="4" fill="currentColor" opacity=".8"/><rect x="8" y="52" width="48" height="5" rx="1" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.6 7 .8-5.2 4.8 1.5 7L12 17.8 5.7 21.2l1.5-7L2 9.4l7-.8z" fill="currentColor"/></svg>',
  fuel: '<svg viewBox="0 0 24 24"><path d="M5 3h9v18H5zM7 5v5h5V5zM14 8l3 2v8a1.5 1.5 0 0 0 3 0V9l-3-3" fill="currentColor" stroke="currentColor" stroke-width="1.2"/></svg>',
  tilt: '<svg viewBox="0 0 24 24"><path d="M3 17l9-12 9 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 17h10" stroke="currentColor" stroke-width="2"/></svg>',
};

// ---------- 아이템 카드 ----------
export function fameStars(f) { return '★'.repeat(f) + '<i>' + '★'.repeat(3 - f) + '</i>'; }

export function itemCardHTML(site, o = {}) {
  const col = eraColor(site);
  const eras = eraList(site).map((e) => `<span class="ic-era">${esc(e)}</span>`).join('');
  const solved = solvedCount(site.id);
  return `
  <div class="icard fame${site.fame} ${site.country === 'CHN' ? 'chn' : ''} ${o.flip ? '' : 'flipped'}" style="--era:${col}">
    <div class="icard-inner">
      <div class="icard-back"><div class="back-ring"></div><div class="back-logo">북녘<br>탐험대</div></div>
      <div class="icard-front">
        <div class="ic-art ${site.type}">
          <div class="ic-icon">${ICONS[site.type]}</div>
          <div class="ic-fame" title="유명도">${fameStars(site.fame)}</div>
          <div class="ic-type">${site.type === 'nature' ? '자연' : '역사'}</div>
          ${site.country === 'CHN' ? '<div class="ic-chn">지금은 중국 땅</div>' : ''}
        </div>
        <div class="ic-body">
          <div class="ic-eras">${eras}</div>
          <h3 class="ic-name">${esc(site.name)}</h3>
          <div class="ic-region">${ICONS.pin}${esc(site.region)}</div>
          <p class="ic-summary">${esc(site.summary)}</p>
          <details class="ic-story"><summary>이야기 더 보기</summary><p>${esc(site.story)}</p></details>
          ${site.unify ? `<div class="ic-unify"><b>남북을 잇는 이야기</b><p>${esc(site.unify)}</p></div>` : ''}
          ${site.approx ? '<div class="ic-approx">넓은 지역이거나 위치가 추정이라 대략적인 위치에 표시했습니다.</div>' : ''}
          <div class="ic-foot"><span>푼 문제 ${solved}/5</span><span>${store.visited[site.id] ? '도감 등록' : '미발견'}</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

/** 카드 뒤집기 연출 */
export function flipIn(root) {
  const c = root.querySelector('.icard');
  if (!c || c.classList.contains('flipped')) return;
  setTimeout(() => { c.classList.add('flipped'); sfx.flip(); }, 380);
}

// ---------- 퀴즈 ----------
const LV = { 1: '기초', 2: '보통', 3: '도전' };
export function runQuiz(quiz, o = {}) {
  return new Promise((resolve) => {
    const order = [0, 1, 2, 3];
    const html = `
      <div class="quiz ${o.bonus ? 'bonus' : ''}">
        <div class="quiz-head">
          <span class="quiz-tag">${o.bonus ? '보너스 관문' : '문제'} · ${LV[quiz.level]}</span>
          <span class="quiz-site">${esc(o.title || '')}</span>
        </div>
        <h3 class="quiz-q">${esc(quiz.q)}</h3>
        <div class="quiz-choices">
          ${order.map((i) => `<button class="choice" data-i="${i}"><span class="ch-num">${i + 1}</span><span class="ch-txt">${esc(quiz.choices[i])}</span></button>`).join('')}
        </div>
        <div class="quiz-result">
          <div class="qr-banner"></div>
          <p class="qr-explain">${esc(quiz.explain)}</p>
          <button class="btn primary qr-next">${o.nextLabel || '계속'}</button>
        </div>
        <div class="quiz-keys">키보드 1~4로도 고를 수 있습니다</div>
      </div>`;
    const m = openModal(html, 'quiz-modal');
    let done = false;
    const choose = (i) => {
      if (done) return;
      done = true;
      const ok = i === quiz.answer;
      const btns = $$('.choice', m);
      btns.forEach((b) => { b.disabled = true; });
      btns[quiz.answer].classList.add('right');
      if (!ok) btns[i].classList.add('wrong');
      const res = $('.quiz-result', m);
      $('.qr-banner', res).innerHTML = ok ? (o.okText || '정답!') : '아쉽습니다';
      res.classList.add('show', ok ? 'ok' : 'no');
      const rect = btns[i].getBoundingClientRect();
      if (ok) {
        sfx.correct();
        burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 70);
      } else {
        sfx.wrong();
        shake(0.5);
        $('.quiz', m).classList.add('wobble');
      }
      if (o.onAnswer) o.onAnswer(ok, rect);
      const next = $('.qr-next', res);
      setTimeout(() => next.focus(), 50);
      next.onclick = () => { sfx.click(); window.removeEventListener('keydown', key); closeModal(m); resolve({ correct: ok }); };
    };
    const key = (e) => {
      if (!done && e.key >= '1' && e.key <= '4') { e.preventDefault(); choose(+e.key - 1); }
      else if (done && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('.qr-next', m).click(); }
    };
    window.addEventListener('keydown', key);
    $$('.choice', m).forEach((b) => { b.onclick = () => choose(+b.dataset.i); });
  });
}

// ---------- 숫자 올라가기 ----------
export function countUp(el, to, dur = 900, onTick) {
  const from = 0, t0 = performance.now();
  return new Promise((res) => {
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(v);
      if (onTick) onTick(k);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
