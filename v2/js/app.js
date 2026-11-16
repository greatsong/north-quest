// 공용 상태, 지도 위 라벨·말판 표시, 카드·문제 화면
import { $, h, esc, flip, burst, shake, floatText } from './ui.js';
import { sfx } from './audio.js';
import { store } from './store.js';
import { thumb } from './thumbs.js';
import { lonLatToWorld } from '../../shared/geo.js';
import { LANDMARK, RARITY, eraColor, mastery } from './sitecfg.js';

export const A = {
  world: null, content: null, sites: [], general: [], byId: {},
  screen: 'loading', level: 1, G: null,
  labelMode: { prov: true, sites: false, names: () => false, cls: () => '' },
  onMarker: null, onCluster: null,
};
export const LEVEL_NAME = { 1: '기초', 2: '보통', 3: '도전' };

// ───────────────────────── 라벨과 말판
const L = { prov: [], sites: [], clusters: [] };
export function buildLabels() {
  const layer = $('#labels');
  for (const p of A.content.geo.provinces) {
    const w = lonLatToWorld(p.label_lon, p.label_lat);
    const el = h(`<div class="prov">${esc(p.name_dprk)}</div>`);
    layer.appendChild(el);
    L.prov.push({ el, x: w.x, y: A.world.peakY(w.x, w.z) + 2, z: w.z, w: p.name_dprk.length * 13 + 10 });
  }
  const groups = {};
  for (const s of A.sites) {
    const el = h(`<button class="mk" data-id="${s.id}" aria-label="${esc(s.name)}"><span class="pin" style="--ec:${eraColor(s)}"><b>?</b></span><span class="nm">${esc(s.name)}</span></button>`);
    el.addEventListener('click', (e) => { e.stopPropagation(); A.onMarker && A.onMarker(s); });
    layer.appendChild(el);
    L.sites.push({ el, s, y: A.world.peakY(s.x, s.z) + 1.5, cls: '', named: null, w: s.name.length * 12.5 + 14 });
    if (s.cluster) (groups[s.cluster] ||= []).push(s);
  }
  for (const [name, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    const x = list.reduce((a, s) => a + s.x, 0) / list.length, z = list.reduce((a, s) => a + s.z, 0) / list.length;
    const el = h(`<button class="clb"><b>${list.length}</b><span>${esc(name)}</span></button>`);
    const c = { el, name, list, x, z, y: A.world.peakY(x, z) + 2 };
    el.addEventListener('click', (e) => { e.stopPropagation(); A.onCluster && A.onCluster(c); });
    layer.appendChild(el);
    L.clusters.push(c);
    for (const s of list) s._cluster = c;
  }
  A.clusters = L.clusters;
}

export function refreshMarkers() {
  for (const m of L.sites) {
    const cls = A.labelMode.sites ? (A.labelMode.cls(m.s) || '') : 'off';
    if (cls !== m.cls) {
      m.el.className = 'mk ' + cls + (m.s.country === 'CHN' ? ' chn' : '');
      const b = m.el.querySelector('b');
      b.textContent = cls.includes('done') ? '✓' : cls.includes('tgt') ? '!' : '?';
      m.cls = cls;
    }
  }
}

export function updateLabels() {
  const w = A.world, mode = A.labelMode;
  const W = innerWidth, H = innerHeight;
  const placed = [];
  const hit = (x, y, ww, hh) => {
    for (const r of placed) if (x < r[0] + r[2] && x + ww > r[0] && y < r[1] + r[3] && y + hh > r[1]) return true;
    placed.push([x, y, ww, hh]);
    return false;
  };
  const dist = w.camDist();
  const collapse = dist > 250;
  const showSites = mode.sites;
  // 말판: 목적지 → 유명도 순으로 이름 자리 확보
  const order = L.sites.slice().sort((a, b) => (b.cls.includes('tgt') - a.cls.includes('tgt')) || (b.s.fame - a.s.fame));
  for (const m of order) {
    const s = m.s;
    let vis = showSites && m.cls !== 'off' && !m.cls.includes('hide');
    if (vis && collapse && s._cluster && !m.cls.includes('tgt')) vis = false;
    if (!vis) { if (m.v !== false) { m.el.style.display = 'none'; m.v = false; } continue; }
    const p = w.project(s.x, m.y, s.z);
    if (!p.vis || p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) { if (m.v !== false) { m.el.style.display = 'none'; m.v = false; } continue; }
    if (m.v !== true) { m.el.style.display = ''; m.v = true; }
    m.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
    hit(p.x - 13, p.y - 30, 26, 28);
    const wantName = mode.names(s);
    const named = wantName && !hit(p.x - m.w / 2, p.y + 2, m.w, 20);
    if (named !== m.named) { m.el.classList.toggle('named', named); m.named = named; }
  }
  for (const c of L.clusters) {
    const unvisitedHere = c.list.some((s) => { const m = L.sites.find((q) => q.s === s); return m && m.cls !== 'off'; });
    const vis = showSites && collapse && unvisitedHere;
    if (!vis) { c.el.style.display = 'none'; continue; }
    const p = w.project(c.x, c.y, c.z);
    if (!p.vis) { c.el.style.display = 'none'; continue; }
    c.el.style.display = '';
    c.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
    hit(p.x - 40, p.y - 34, 80, 34);
  }
  for (const pl of L.prov) {
    let vis = mode.prov;
    let p;
    if (vis) { p = w.project(pl.x, pl.y, pl.z); vis = p.vis && !hit(p.x - pl.w / 2, p.y - 10, pl.w, 20); }
    if (!vis) { pl.el.style.display = 'none'; continue; }
    pl.el.style.display = '';
    pl.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-50%)`;
    pl.el.style.opacity = dist < 120 ? 0.35 : 1;
  }
}
export function markerEl(id) { return L.sites.find((m) => m.s.id === id)?.el; }

// ───────────────────────── 모달
let modalClose = null;
export function openModal(el, { onClose = null, cls = '' } = {}) {
  closeModal(true);
  const box = $('#modal');
  box.className = 'on ' + cls;
  box.innerHTML = '';
  box.appendChild(el);
  modalClose = onClose;
  return el;
}
export function closeModal(silent = false) {
  const box = $('#modal');
  if (!box.classList.contains('on')) return;
  box.className = '';
  box.innerHTML = '';
  const f = modalClose; modalClose = null;
  if (!silent && f) f();
}

// ───────────────────────── 카드
export function landmarkType(s) { return LANDMARK[s.id] || 'mountain'; }
// ───────────────────────── 실제 사진
const PHOTO_BASE = '../shared/';
export function photosOf(s) { return (A.photos && A.photos[s.id]) || []; }
export function photoUrl(ph) { return PHOTO_BASE + ph.file; }
/** 사진이 있으면 사진 img, 없으면 모형 그림. 사진을 못 불러오면 모형으로 바뀐다(main.js 오류 처리) */
export function artImg(s, cls = '') {
  const ph = photosOf(s)[0];
  const t = landmarkType(s);
  if (!ph) return `<img alt="" class="${cls}" src="${thumb(t)}">`;
  return `<img alt="${esc(ph.caption)}" class="photo ${cls}" loading="lazy" decoding="async" data-fb="${t}" src="${photoUrl(ph)}">`;
}
export function credit(ph) {
  return `<a class="credit" href="${esc(ph.source)}" target="_blank" rel="noopener noreferrer">사진: ${esc(ph.author)} · ${esc(ph.license)}</a>`;
}
function photoBlock(s) {
  const list = photosOf(s), t = landmarkType(s);
  const chn = s.country === 'CHN' ? '<div class="ribbon">지금은 중국 땅</div>' : '';
  if (!list.length) return `<div class="gc-art"><img alt="" src="${thumb(t)}">${chn}</div>`;
  return `<div class="gc-photo" data-i="0">
    <div class="ph-track">${list.map((ph, i) => `<img alt="${esc(ph.caption)}" loading="lazy" decoding="async" data-fb="${t}" src="${photoUrl(ph)}" class="${i ? '' : 'on'}">`).join('')}</div>
    <img class="ph-model" alt="" src="${thumb(t)}">${chn}
    ${list.length > 1 ? `<button class="ph-nav prev" aria-label="이전 사진">‹</button><button class="ph-nav next" aria-label="다음 사진">›</button>
    <div class="ph-dots">${list.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
  </div>
  <div class="ph-cap">${list.map((ph, i) => `<div class="${i ? '' : 'on'}"><span>${esc(ph.caption)}</span>${credit(ph)}</div>`).join('')}</div>`;
}
/** 카드 사진 넘겨 보기(버튼·점·좌우 밀기) */
export function bindPhotos(root) {
  const box = root.querySelector('.gc-photo');
  if (!box) return;
  const imgs = [...box.querySelectorAll('.ph-track img')];
  const caps = [...root.querySelectorAll('.ph-cap > div')];
  const dots = [...box.querySelectorAll('.ph-dots i')];
  if (imgs.length < 2) return;
  let i = 0;
  const go = (n) => {
    i = (n + imgs.length) % imgs.length;
    [imgs, caps, dots].forEach((arr) => arr.forEach((el, k) => el.classList.toggle('on', k === i)));
    sfx.flip();
  };
  box.querySelector('.prev').addEventListener('click', (e) => { e.stopPropagation(); go(i - 1); });
  box.querySelector('.next').addEventListener('click', (e) => { e.stopPropagation(); go(i + 1); });
  dots.forEach((d, k) => d.addEventListener('click', () => go(k)));
  let sx = null;
  box.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  box.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 40) go(i + (e.clientX < sx ? 1 : -1)); sx = null; });
}

export function siteFront(s, { actions = '', compact = false } = {}) {
  const r = RARITY[s.fame];
  const st = mastery(store, s.id);
  const stars = [1, 2, 3].map((i) => `<i class="${i <= st ? 'on' : ''}">★</i>`).join('');
  return `
  <div class="gc-top"><span class="rar">${r.code}</span><span class="era">${esc(s.era)}</span><span class="typ">${s.type === 'nature' ? '자연' : '역사'}</span><span class="stars" title="문제 정답 기록">${stars}</span></div>
  ${photoBlock(s)}
  <div class="gc-name">${esc(s.name)}</div>
  <div class="gc-region">${esc(s.region)}${s.approx ? ' <span class="approx">대략적 위치</span>' : ''}</div>
  <div class="gc-body">
    <p class="summary">${esc(s.summary)}</p>
    ${compact ? '' : `<details class="story"><summary>이야기 더 보기</summary><p>${esc(s.story)}</p></details>
    ${s.unify ? `<div class="unify"><b>남북 함께 보기</b><p>${esc(s.unify)}</p></div>` : ''}`}
  </div>
  <div class="gc-actions">${actions}</div>`;
}
export function cardShell(s, inner, extra = '') {
  const r = RARITY[s.fame];
  return settle(h(`<div class="gcard ${extra}" style="--rc:${r.color};--ec:${eraColor(s)}">${inner}</div>`));
}
/** 등장 애니메이션이 끝나면 클래스를 지워 다른 애니메이션 뒤에 다시 재생되지 않게 한다 */
export function settle(el) {
  el.addEventListener('animationend', (e) => { if (e.animationName === 'cardin') el.classList.remove('enter'); });
  return el;
}

/**
 * 카드를 문제 면으로 뒤집고 풀게 한다.
 * opts: { tag, level, onAnswer(ok), doneLabel, onDone }
 */
export function runQuiz(card, quiz, { tag = '', onAnswer, doneLabel = '계속', onDone, related = null }) {
  return flip(card, () => {
    card.classList.add('quiz');
    card.innerHTML = `
      <div class="gc-top"><span class="rar">Q</span><span class="era">${esc(tag)}</span><span class="lv lv${quiz.level}">${LEVEL_NAME[quiz.level]}</span></div>
      <div class="qtext">${esc(quiz.q)}</div>
      <div class="choices">${quiz.choices.map((c, i) => `<button class="ch" data-i="${i}"><i>${'ABCD'[i]}</i><span>${esc(c)}</span></button>`).join('')}</div>
      <div class="explain" hidden></div>
      <div class="gc-actions"><button class="btn primary next" hidden>${doneLabel}</button></div>`;
    sfx.flip();
    let answered = false;
    card.querySelectorAll('.ch').forEach((b) => b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const i = Number(b.dataset.i), ok = i === quiz.answer;
      card.querySelectorAll('.ch').forEach((x) => { x.disabled = true; if (Number(x.dataset.i) === quiz.answer) x.classList.add('right'); });
      const r = b.getBoundingClientRect();
      if (ok) {
        b.classList.add('right', 'picked');
        sfx.correct();
        burst(r.left + r.width / 2, r.top + r.height / 2, 30);
      } else {
        b.classList.add('wrong', 'picked');
        sfx.wrong();
        shake(0.8);
        card.classList.add('nope'); setTimeout(() => card.classList.remove('nope'), 450);
      }
      const ex = card.querySelector('.explain');
      ex.hidden = false;
      ex.className = 'explain ' + (ok ? 'ok' : 'no');
      let rel = '';
      if (related && related.length) rel = `<div class="rel">관련 장소: ${related.map((id) => esc(A.byId[id]?.name || id)).join(', ')}</div>`;
      ex.innerHTML = `<b>${ok ? '정답입니다!' : '아쉽습니다. 정답은 ' + 'ABCD'[quiz.answer] + '번입니다.'}</b><p>${esc(quiz.explain)}</p>${rel}`;
      const nb = card.querySelector('.next');
      nb.hidden = false;
      nb.addEventListener('click', () => { sfx.click(); onDone && onDone(ok); }, { once: true });
      onAnswer && onAnswer(ok, r);
      setTimeout(() => nb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    }));
  });
}

export function pickQuiz(s, level, used = new Set()) {
  let qs = s.quizzes.map((q, i) => ({ q, i })).filter((o) => o.q.level === level && !used.has(s.id + ':' + o.i));
  if (!qs.length) qs = s.quizzes.map((q, i) => ({ q, i })).filter((o) => o.q.level === level);
  if (!qs.length) qs = s.quizzes.map((q, i) => ({ q, i }));
  // 아직 맞히지 않은 문제를 먼저
  const done = store.data.quiz[s.id] || [];
  const fresh = qs.filter((o) => !done.includes(o.i));
  const pool = fresh.length ? fresh : qs;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickGeneral(level, used) {
  let pool = A.general.map((g, i) => ({ g, i })).filter((o) => o.g.level === level && !used.has(o.i));
  if (!pool.length) pool = A.general.map((g, i) => ({ g, i })).filter((o) => !used.has(o.i));
  if (!pool.length) pool = A.general.map((g, i) => ({ g, i }));
  return pool[Math.floor(Math.random() * pool.length)];
}

export function screenPos(x, y, z) { return A.world.project(x, y, z); }
export function popAt(x, y, z, text, cls) { const p = screenPos(x, y, z); floatText(p.x, p.y, text, cls); return p; }

export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
