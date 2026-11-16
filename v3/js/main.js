// 북녘 탐험대 v3 · 시간 여행 관제실
import * as WD from './world.js';
import { W } from './world.js';
import * as D from './data.js';
import { ERAS, ERA_ORDER, MISSIONS, RARITY, LEVEL_NAME, esc, shuffle, pick } from './data.js';
import { sfx, setMuted, isMuted, unlockAudio, initFx, burst, confetti, shake, flash, popScore, toast, countUp, portal } from './fx.js';
import { loadContent, distanceKm, worldToLonLat } from '../../shared/geo.js';

const Q = new URLSearchParams(location.search);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowres = Q.has('low') || (isTouch && Math.min(screen.width, screen.height) < 820);
const FAST = Q.has('fast');
const dur = (s) => (FAST ? 0.05 : s);
const wait = (ms) => new Promise((r) => setTimeout(r, FAST ? Math.min(ms, 30) : ms));

const S = {
  mode: 'loading', level: 1, era: 'all', sites: [], byId: {}, general: [], meta: null, geo: null,
  mission: null, guess: null, card: null, anchors: [], titleCycle: null,
};
const store = D.loadStore();
S.level = store.level || 1;

const ICON = {
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17l-5.7 3.2 1.2-6.3L2.8 9.5l6.4-.8Z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7Z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
};

// ================= 부팅 =================
async function boot() {
  setMuted(!!store.muted);
  initFx($('#fxc'));
  ldProgress(15);
  const content = await loadContent('../shared/data');
  S.sites = content.sites; S.general = content.general; S.meta = content.meta; S.geo = content.geo;
  for (const s of S.sites) S.byId[s.id] = s;
  ldProgress(40);
  await WD.initWorld($('#stage'), { lowres });
  ldProgress(85);
  WD.buildLines(S.geo);
  WD.buildMarkers(S.sites);
  WD.setView(store.view || 0);
  W.mix = W.mixTarget;
  W.onFrame = onFrame;
  W.fast = FAST; window.__W = W; window.__S = S; window.__low = lowres; window.__dbg = { arriveTarget, confirmGuess, revealGuess, startMission, startGuess };
  W.onMarkerHover = () => {};
  bindUI();
  buildDial();
  updateMuteBtn(); updateViewBtn(); updateLevelUI();
  ldProgress(100);
  setTimeout(() => { $('#loading').classList.add('gone'); setTimeout(() => $('#loading').remove(), 700); }, FAST ? 0 : 250);
  route();
}

function ldProgress(p) { const f = $('#ld-fill'); if (f) f.style.width = p + '%'; }

function route() {
  if (Q.has('debug')) setInterval(() => { document.title = `F${W.frames} ${S.mode} ${S.mission?.phase || ''} ${S.guess?.phase || ''}`; }, 200);
  const m = Q.get('mode');
  const lv = +Q.get('level');
  if (lv >= 1 && lv <= 3) S.level = lv;
  if (Q.has('view')) { WD.setView(+Q.get('view') % 3); W.mix = W.mixTarget; updateViewBtn(); }
  updateLevelUI();
  if (m === 'explore') startMission(Q.get('mission') || 'flow');
  else if (m === 'guess') startGuess();
  else if (m === 'free') { startFree(Q.get('era') || 'all'); if (Q.get('card')) setTimeout(() => openSite(S.byId[Q.get('card')], { context: 'free' }), FAST ? 50 : 600); }
  else if (m === 'archive') { showTitle(true); openArchive(); }
  else if (m === 'missions') { showTitle(true); openMissions(); }
  else if (m === 'result') { showTitle(true); demoResult(); }
  else showTitle();
}

// ================= 공통 UI =================
function setMode(m) { S.mode = m; document.body.dataset.mode = m; }
function showScreen(id) { const el = $('#' + id); el.classList.add('on'); }
function hideScreen(id) { const el = $('#' + id); el.classList.remove('on'); }
function hideAllScreens() { $$('.screen').forEach((e) => e.classList.remove('on')); }

function bindUI() {
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  $('#btn-home').onclick = () => { sfx.click(); confirmLeave(() => showTitle()); };
  $('#btn-view').onclick = () => { sfx.click(); const v = (W.view + 1) % 3; WD.setView(v); store.view = v; D.saveStore(); updateViewBtn(); toast(`지도 표시: <b>${['홀로그램', '혼합', '실제 색 지도'][v]}</b>`); };
  $('#btn-mute').onclick = () => { setMuted(!isMuted()); store.muted = isMuted(); D.saveStore(); updateMuteBtn(); sfx.click(); };
  $('#btn-archive').onclick = () => { sfx.click(); openArchive(); };
  $('#btn-info').onclick = () => { sfx.click(); openInfo(); };
  $('#t-info').onclick = () => { sfx.click(); openInfo(); };
  $$('#t-level button').forEach((b) => b.onclick = () => { S.level = +b.dataset.l; store.level = S.level; D.saveStore(); updateLevelUI(); sfx.dial(); });
  $$('.mode-card').forEach((b) => {
    b.onmouseenter = () => sfx.hover();
    b.onclick = () => {
      sfx.click();
      const g = b.dataset.go;
      if (g === 'missions') openMissions();
      else if (g === 'guess') startGuess();
      else if (g === 'free') startFree('all');
      else if (g === 'archive') openArchive();
    };
  });
  $('#btn-hint').onclick = useHint;
  // 지도 클릭(드래그와 구분)
  const cv = W.renderer.domElement;
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved < 8 && dt < 1500) onMapTap(e.clientX, e.clientY);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('#chooser').classList.contains('on')) hideChooser(); }
    if ((e.key === 'Enter' || e.key === ' ') && S.mode === 'guess' && S.guess?.phase === 'place' && S.guess.pick) { e.preventDefault(); confirmGuess(); }
  });
  // 묶음 라벨
  for (const k in W.clusterLabels) {
    const cl = W.clusterLabels[k];
    cl.el.addEventListener('click', (e) => {
      e.stopPropagation(); sfx.click();
      const members = cl.members.filter((m) => m.state !== 'hidden').map((m) => m.site);
      const cx = members.reduce((a, s) => a + s.x, 0) / members.length, cz = members.reduce((a, s) => a + s.z, 0) / members.length;
      WD.flyTo({ x: cx, z: cz, dist: 75, el: 0.9, dur: dur(1.2) });
      showChooser(members, cl.name, innerWidth / 2, innerHeight / 2);
    });
  }
}
function updateMuteBtn() { $('#btn-mute').classList.toggle('muted', isMuted()); }
function updateViewBtn() { $('#view-name').textContent = ['홀로그램', '혼합', '실제 지도'][W.view]; }
function updateLevelUI() {
  $$('#t-level button').forEach((b) => b.classList.toggle('on', +b.dataset.l === S.level));
  const ml = $('#m-level'); if (ml) ml.textContent = '난이도 · ' + LEVEL_NAME[S.level];
}
function confirmLeave(fn) {
  if ((S.mode === 'explore' && S.mission && !S.mission.done) || (S.mode === 'guess' && S.guess && !S.guess.done)) {
    if (!window.confirm('진행 중인 기록이 사라집니다. 처음 화면으로 돌아갈까요?')) return;
  }
  fn();
}

function cleanupMode() {
  closeCard(true); hideChooser(); WD.setSignal(null); WD.setReticle(null); WD.clearArcs(); clearAnchors();
  WD.setAutoRotate(false); WD.setHalos([]); WD.setDim(0);
  $('#objective').classList.remove('on'); $('#guessbar').classList.remove('on'); $('#edge-arrow').classList.remove('on');
  $('#hud-stats').innerHTML = '';
  if (S.titleCycle) { clearInterval(S.titleCycle); S.titleCycle = null; }
  if (S.mission) S.mission.done = true;
  if (S.guess) S.guess.done = true;
  S.mission = null; S.guess = null;
  document.body.classList.remove('dial-lock', 'glitch');
}

// ================= 타이틀 =================
function showTitle(quiet = false) {
  cleanupMode(); hideAllScreens();
  setMode('title');
  showScreen('title');
  WD.setLabelMode({ sites: 'none', provinces: false });
  WD.setProvinceLines(true);
  const cnt = S.sites.filter((s) => D.isCollected(s.id)).length;
  $('#t-collect').textContent = `수집 ${cnt} / ${S.sites.length}`;
  const be = Math.max(0, ...Object.entries(store.best).filter(([k]) => k.startsWith('explore')).map(([, v]) => v));
  const bg = Math.max(0, ...Object.entries(store.best).filter(([k]) => k.startsWith('guess')).map(([, v]) => v));
  $('#best-explore').innerHTML = be ? `<small>최고</small>${be.toLocaleString('ko-KR')}` : '<small>NEW</small>';
  $('#best-guess').innerHTML = bg ? `<small>최고</small>${bg.toLocaleString('ko-KR')}` : '<small>NEW</small>';
  // 카메라: 멀리서 날아들며 회전
  const ov = WD.overviewParams();
  const asp = innerWidth / innerHeight;
  const shift = asp > 1.1 ? -150 : 0;
  if (!quiet && !FAST) {
    W.camera.position.set(0, 1800, 1400); W.controls.target.set(0, 0, 0);
  }
  WD.flyTo({ x: shift * 1.35, z: asp < 0.8 ? 230 : 70, dist: ov.dist * (asp < 0.8 ? 0.92 : 0.74), el: 0.6, az: -0.35, dur: quiet ? dur(0.8) : dur(3.2), hop: 0 }).then(() => {
    if (S.mode === 'title') WD.setAutoRotate(true, 0.3);
  });
  // 시대 자동 순환
  let i = 0;
  const cyc = ['all', ...ERA_ORDER];
  setEra('all', { quiet: true });
  S.titleCycle = setInterval(() => { i = (i + 1) % cyc.length; setEra(cyc[i], { quiet: true }); }, 2600);
}

// ================= 시대 다이얼 =================
const DIAL = ['all', ...ERA_ORDER];
function buildDial() {
  const box = $('#dial-nodes');
  box.innerHTML = DIAL.map((e) => {
    const c = e === 'all' ? '#ffffff' : ERAS[e].color;
    const name = e === 'all' ? '전체' : e;
    return `<button class="dn" data-e="${e}" style="--c:${c}"><i></i><span>${name}</span></button>`;
  }).join('');
  $$('.dn', box).forEach((b) => b.onclick = () => { if (document.body.classList.contains('dial-lock')) return; setEra(b.dataset.e); });
  $$('.dial-arrow').forEach((b) => b.onclick = () => {
    if (document.body.classList.contains('dial-lock')) return;
    const i = DIAL.indexOf(S.era) + +b.dataset.d;
    setEra(DIAL[(i + DIAL.length) % DIAL.length]);
  });
  $('#dial').addEventListener('wheel', (e) => {
    if (document.body.classList.contains('dial-lock')) return;
    e.preventDefault();
    const i = DIAL.indexOf(S.era) + (e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
    setEra(DIAL[(i + DIAL.length) % DIAL.length]);
  }, { passive: false });
}
function eraSites(e) { return e === 'all' ? S.sites : S.sites.filter((s) => s.eras.includes(e)); }
function setEra(e, { quiet = false, markers = true } = {}) {
  S.era = e;
  $$('.dn').forEach((b) => b.classList.toggle('on', b.dataset.e === e));
  const on = $(`.dn[data-e="${e}"]`);
  if (on) { const box = $('#dial-nodes'); const left = on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2; try { box.scrollTo({ left, behavior: quiet ? 'auto' : 'smooth' }); } catch (e) { box.scrollLeft = left; } }
  const info = e === 'all' ? { color: '#ffffff', glyph: '時', span: '모든 시대' } : ERAS[e];
  $('#dial').style.setProperty('--ec', info.color);
  $('#dial-glyph').textContent = info.glyph;
  $('#dial-name').textContent = e === 'all' ? '전체 시대' : e === '자연' ? '자연 지형' : e;
  $('#dial-span').textContent = info.span;
  const list = eraSites(e);
  $('#dial-count').textContent = `장소 ${list.length}곳`;
  if (!quiet) sfx.dial();
  if (markers && (S.mode === 'free' || S.mode === 'title')) applyFreeMarkers();
}
function applyFreeMarkers() {
  const e = S.era;
  WD.setAllMarkers((s) => (e === 'all' || s.eras.includes(e) ? 'active' : 'dim'));
  if (e === 'all') WD.setHalos([]);
  else WD.setHalos(eraSites(e).map((s) => ({ x: s.x, z: s.z, r: 10, s: 0.8, color: ERAS[e].color })));
}

// ================= 자유 관측 =================
function startFree(era = 'all') {
  cleanupMode(); hideAllScreens();
  setMode('free');
  WD.setLabelMode({ sites: 'active', provinces: true });
  WD.setProvinceLines(true);
  setEra(era, { quiet: true });
  WD.overview(dur(1.6));
  $('#hud-stats').innerHTML = `<div class="stat wide"><small>관제실</small><b>자유 관측</b></div><div class="stat"><small>수집</small><b>${S.sites.filter((s) => D.isCollected(s.id)).length}/${S.sites.length}</b></div>`;
  if (!FAST) setTimeout(() => toast('시대 다이얼을 돌리고 빛 기둥을 클릭하면 장소 기록이 열립니다.'), 900);
}

// ================= 지도 클릭 =================
function onMapTap(x, y) {
  if (S.mode === 'guess') return guessTap(x, y);
  if (S.mode !== 'free' && S.mode !== 'explore') return;
  if (S.mode === 'explore' && S.mission?.phase !== 'search') return;
  const hits = WD.pickMarkers(x, y, isTouch ? 34 : 22);
  if (!hits.length) { hideChooser(); return; }
  // 목적지를 우선
  const tgt = S.mission?.target;
  if (tgt && hits.includes(tgt)) return siteChosen(tgt);
  if (hits.length === 1) return siteChosen(hits[0]);
  const first = W.byId[hits[0].id];
  showChooser(hits, hits[0].cluster || '이 근처 장소', x, y);
  if (first) {
    const cx = hits.reduce((a, s) => a + s.x, 0) / hits.length, cz = hits.reduce((a, s) => a + s.z, 0) / hits.length;
    const d = W.camera.position.distanceTo(W.controls.target);
    if (d > 90) WD.flyTo({ x: cx, z: cz, dist: Math.max(70, Math.min(160, d * 0.3)), el: 0.9, dur: dur(1.1) });
  }
}
function siteChosen(site) {
  hideChooser(); sfx.click();
  if (S.mode === 'explore') {
    if (site === S.mission.target) arriveTarget();
    else openSite(site, { context: 'side' });
  } else openSite(site, { context: 'free' });
}
function showChooser(sites, title, x, y) {
  const el = $('#chooser');
  el.innerHTML = `<div class="ch-head"><b>${esc(title)}</b><span>${sites.length}곳 · 하나를 고르세요</span><button class="x" aria-label="닫기">×</button></div>` +
    sites.map((s) => `<button class="ch-item" data-id="${s.id}" style="--c:${W.byId[s.id].color}"><i></i><span><b>${esc(s.name)}</b><small>${esc(s.region)}</small></span>${s === S.mission?.target ? '<em>목적지</em>' : ''}</button>`).join('');
  el.classList.add('on');
  $('.x', el).onclick = hideChooser;
  $$('.ch-item', el).forEach((b) => {
    b.onmouseenter = () => { W.hovered = S.byId[b.dataset.id]; };
    b.onmouseleave = () => { W.hovered = null; };
    b.onclick = () => { W.hovered = null; siteChosen(S.byId[b.dataset.id]); };
  });
}
function hideChooser() { $('#chooser').classList.remove('on'); }

// ================= 장소 카드 =================
function eraBadges(site) {
  return site.eras.map((e) => `<span class="era-b" style="--c:${ERAS[e].color}"><i>${ERAS[e].glyph}</i>${e === '자연' ? '자연 지형' : e}</span>`).join('');
}
async function openSite(site, { context = 'free', fly = true } = {}) {
  if (!site) return;
  hideChooser(); closeCard(true);
  if (S.mode === 'explore' && context === 'side') S.mission.phase = 'card';
  if (fly) {
    const az = W.controls.getAzimuthalAngle() + 0.35;
    await WD.flyTo({ x: site.x, z: site.z, dist: 62, el: 0.6, az, dur: dur(1.5) });
  }
  WD.shockwave(site.x, site.z, W.byId[site.id].color, 30);
  sfx.arrive();
  WD.setAutoRotate(true, 0.55);
  const isNew = D.markVisited(site.id);
  if (isNew) setTimeout(() => { sfx.collect(); toast(`<b>새 기록 수집</b> ${esc(site.name)}`, 'gold'); }, 500);
  renderCard(site, context);
}
function renderCard(site, context) {
  S.card = { site, context };
  const mk = W.byId[site.id];
  const rar = RARITY[site.fame];
  const el = $('#card');
  const solved = site.quizzes.filter((q, i) => store.solved[`${site.id}:${i}`]).length;
  const note = context === 'side' ? '<div class="note">미션 목적지가 아닙니다. 기록만 보관소에 저장됩니다.</div>' : '';
  el.style.setProperty('--c', mk.color);
  el.className = 'holo-card ' + rar.cls;
  el.innerHTML = `
    <div class="cd-frame">
      <button class="x" id="cd-x" aria-label="닫기">×</button>
      <div class="cd-top"><div class="cd-eras">${eraBadges(site)}</div><div class="cd-rar">${rar.label}<span>${'★'.repeat(site.fame)}${'☆'.repeat(3 - site.fame)}</span></div></div>
      <h2 class="cd-name">${esc(site.name)}</h2>
      <div class="cd-region">${ICON.pin}${esc(site.region)}</div>
      <div class="cd-tags">
        <span class="tg">${site.type === 'nature' ? '자연 지형' : '역사 유적'}</span>
        ${site.country === 'CHN' ? '<span class="tg chn">지금은 중국 땅</span>' : ''}
        ${site.approx ? '<span class="tg dim">대략 위치</span>' : ''}
        <span class="tg dim">문제 ${solved}/5 해결</span>
      </div>
      <p class="cd-sum">${esc(site.summary)}</p>
      <details class="cd-more"><summary>기록 펼치기</summary><p>${esc(site.story)}</p></details>
      ${site.unify ? `<details class="cd-more uni"><summary>남북을 잇는 관점</summary><p>${esc(site.unify)}</p></details>` : ''}
      ${note}
      <div class="cd-act" id="cd-act"></div>
      <div class="cd-quiz" id="cd-quiz"></div>
    </div>`;
  const act = $('#cd-act');
  if (context === 'mission') {
    act.innerHTML = `<button class="btn primary" id="cd-q">${ICON.bolt}문제 풀기</button>`;
    $('#cd-q').onclick = () => { sfx.click(); act.innerHTML = ''; renderQuiz(site, S.mission.quiz[S.mission.i], onMissionAnswer); };
  } else {
    act.innerHTML = `<button class="btn primary" id="cd-q">${ICON.bolt}연습 문제</button><button class="btn" id="cd-c">${context === 'side' ? '미션으로 돌아가기' : '닫기'}</button>`;
    $('#cd-q').onclick = () => {
      sfx.click(); act.innerHTML = '';
      const pool = site.quizzes.map((q, i) => ({ ...q, idx: i })).filter((q) => q.level === S.level);
      renderQuiz(site, pick(pool.length ? pool : site.quizzes.map((q, i) => ({ ...q, idx: i }))), (ok, q) => {
        $('#cd-quiz').insertAdjacentHTML('beforeend', `<div class="cd-act"><button class="btn" id="cd-c2">${context === 'side' ? '미션으로 돌아가기' : '닫기'}</button></div>`);
        $('#cd-c2').onclick = () => { sfx.click(); closeCard(); };
      });
    };
    $('#cd-c').onclick = () => { sfx.click(); closeCard(); };
  }
  $('#cd-x').onclick = () => { sfx.click(); if (context === 'mission') { el.classList.toggle('mini'); } else closeCard(); };
  if (context === 'mission') $('#cd-x').title = '카드 접기';
  requestAnimationFrame(() => el.classList.add('on'));
  document.body.classList.add('card-open');
  sfx.open();
  if (Q.get('quiz') && context !== 'mission') setTimeout(() => $('#cd-q')?.click(), 50);
}
function closeCard(silent = false) {
  const el = $('#card');
  if (!el.classList.contains('on')) { S.card = null; return; }
  el.classList.remove('on', 'mini');
  document.body.classList.remove('card-open');
  const ctx = S.card?.context;
  S.card = null;
  WD.setAutoRotate(false);
  if (!silent && S.mode === 'explore' && ctx === 'side' && S.mission) { S.mission.phase = 'search'; }
}

function renderQuiz(site, quiz, onAnswer) {
  const box = $('#cd-quiz');
  const L = ['A', 'B', 'C', 'D'];
  box.innerHTML = `<div class="qz"><div class="qz-head"><span>DATA CHECK</span><em>${LEVEL_NAME[quiz.level]}</em></div>
    <p class="qz-q">${esc(quiz.q)}</p>
    <div class="qz-ch">${quiz.choices.map((c, i) => `<button class="ch" data-i="${i}"><b>${L[i]}</b><span>${esc(c)}</span></button>`).join('')}</div>
    <div class="qz-ex" id="qz-ex"></div></div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $$('.ch', box).forEach((b) => b.onclick = (ev) => {
    if (box.dataset.done === '1') return;
    box.dataset.done = '1';
    const i = +b.dataset.i, ok = i === quiz.answer;
    $$('.ch', box).forEach((x, j) => { x.disabled = true; x.classList.toggle('right', j === quiz.answer); });
    if (!ok) b.classList.add('wrong');
    const r = b.getBoundingClientRect();
    if (ok) {
      burst(r.left + r.width / 2, r.top + r.height / 2, { n: 46, colors: ['#3ff4ff', '#b8ff5a', '#ffffff'] });
      flash('rgba(63,244,255,.28)');
      if (quiz.idx != null) D.markSolved(`${site.id}:${quiz.idx}`);
    } else {
      shake($('#card'), 1.2); flash('rgba(255,70,90,.35)'); sfx.wrong();
    }
    $('#qz-ex').innerHTML = `<div class="ex ${ok ? 'ok' : 'no'}"><b>${ok ? '정답입니다' : '아쉽습니다'}</b><p>${esc(quiz.explain)}</p></div>`;
    onAnswer(ok, quiz, r);
    setTimeout(() => $('#qz-ex').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  });
  delete box.dataset.done;
}

// ================= 탐험 미션 =================
function buildMission(id, level) {
  const def = MISSIONS.find((m) => m.id === id) || MISSIONS[0];
  let stops = [], stopEra = [];
  if (!def.eras) {
    const used = new Set();
    for (const e of ERA_ORDER.filter((x) => x !== '자연')) {
      let cand = S.sites.filter((s) => s.eras.includes(e) && !used.has(s.id));
      if (!cand.length) continue;
      cand = shuffle(cand).sort((a, b) => (level === 1 ? b.fame - a.fame : level === 2 ? (b.fame >= 2) - (a.fame >= 2) : 0));
      const s = cand[0]; used.add(s.id); stops.push(s); stopEra.push(e);
    }
  } else {
    let cand = S.sites.filter((s) => def.eras.some((e) => s.eras.includes(e)));
    const n = def.eras.length > 1 ? cand.length : level === 3 ? 6 : 5;
    if (level === 1) cand = shuffle(cand).sort((a, b) => b.fame - a.fame);
    else if (level === 2) cand = shuffle(cand).sort((a, b) => (b.fame >= 2) - (a.fame >= 2));
    else cand = shuffle(cand);
    cand = cand.slice(0, n);
    if (def.eras.length > 1) {
      cand.sort((a, b) => Math.min(...a.eras.map((e) => def.eras.indexOf(e)).filter((x) => x >= 0)) - Math.min(...b.eras.map((e) => def.eras.indexOf(e)).filter((x) => x >= 0)));
    } else {
      // 가까운 곳부터 차례로 (북쪽 끝에서 출발)
      const rest = cand.slice(); rest.sort((a, b) => a.z - b.z);
      const route = [rest.shift()];
      while (rest.length) {
        const c = route[route.length - 1];
        rest.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
        route.push(rest.shift());
      }
      cand = route;
    }
    stops = cand;
    stopEra = stops.map((s) => def.eras.find((e) => s.eras.includes(e)));
  }
  const quiz = stops.map((s) => {
    const pool = s.quizzes.map((q, i) => ({ ...q, idx: i })).filter((q) => q.level === level);
    return pick(pool.length ? pool : s.quizzes.map((q, i) => ({ ...q, idx: i })));
  });
  return {
    def, id: def.id, name: def.name, stops, stopEra, quiz, i: 0, score: 0, combo: 0, maxCombo: 0, correct: 0, answered: 0,
    energy: 100, phase: 'portal', usedGeneral: new Set(), anomalies: 0, anomalyOk: 0, target: null, era: null, done: false, sideVisits: 0, t0: performance.now(),
  };
}
function openMissions() {
  showScreen('missions');
  updateLevelUI();
  const grid = $('#mission-grid');
  grid.innerHTML = MISSIONS.map((m) => {
    const eras = m.eras || ERA_ORDER.filter((e) => e !== '자연');
    const sites = S.sites.filter((s) => s.eras.some((e) => eras.includes(e)));
    const got = sites.filter((s) => D.isCollected(s.id)).length;
    const c = m.eras ? ERAS[m.eras[0]].color : '#3ff4ff';
    const glyph = m.eras ? m.eras.map((e) => ERAS[e].glyph).join('') : '時';
    const best = store.best[`explore:${m.id}:${S.level}`];
    const span = m.eras ? (m.eras.length > 1 ? '기원전 ~ 926' : ERAS[m.eras[0]].span) : '고조선 → 현대';
    const nStops = m.eras ? (m.eras.length > 1 ? sites.length : S.level === 3 ? 6 : 5) : 8;
    const badge = store.badges.includes(`${m.name} 전문가`) || (m.id === 'flow' && store.badges.includes('시간 여행 마스터'));
    return `<button class="ms-card ${m.id === 'flow' ? 'feature' : ''}" data-m="${m.id}" style="--c:${c}">
      <span class="ms-glyph ${glyph.length > 1 ? 'multi' : ''}">${glyph}</span>
      <span class="ms-body"><b>${esc(m.name)}</b><small>${esc(m.sub || span)}</small>
      <span class="ms-meta"><em>목적지 ${nStops}곳</em><em>수집 ${got}/${sites.length}</em>${best ? `<em class="hi">최고 ${best.toLocaleString('ko-KR')}</em>` : ''}</span></span>
      ${badge ? '<span class="ms-badge">전문가</span>' : ''}
      <span class="ms-bar"><i style="width:${(got / sites.length) * 100}%"></i></span>
    </button>`;
  }).join('');
  $$('.ms-card', grid).forEach((b) => { b.onmouseenter = () => sfx.hover(); b.onclick = () => { sfx.click(); startMission(b.dataset.m); }; });
  $('#missions [data-back]').onclick = () => { sfx.click(); hideScreen('missions'); };
}

async function startMission(id) {
  cleanupMode(); hideAllScreens();
  setMode('explore');
  document.body.classList.add('dial-lock');
  const M = S.mission = buildMission(id, S.level);
  WD.setLabelMode({ sites: 'active', provinces: S.level < 3 });
  WD.setProvinceLines(S.level < 3);
  renderMissionHud();
  await gotoEra(M.stopEra[0], true);
  if (M.done) return;
  setTarget(0);
  await WD.overview(dur(1.4), { el: 0.9 });
  if (M.done) return;
  M.phase = 'search';
  if (!FAST) toast(`<b>${esc(M.stops[0].name)}</b>의 신호를 찾아 빛 기둥을 클릭하세요.`);
  if (Q.get('arrive') === '1') setTimeout(() => arriveTarget(), 200);
  if (Q.get('anomaly') === '1') setTimeout(() => runAnomaly(false), 200);
}
async function gotoEra(era, first = false) {
  const M = S.mission;
  if (M.era === era && !first) return;
  M.era = era; M.phase = 'portal';
  setEra(era, { quiet: true, markers: false });
  applyMissionMarkers();
  const info = ERAS[era];
  if (!FAST) await portal({ color: info.color, title: era === '자연' ? '자연 지형 탐사' : `${era} 시대로 이동`, span: info.span, year: info.year });
  else await wait(10);
}
function setTarget(i) {
  const M = S.mission;
  M.i = i; M.target = M.stops[i];
  WD.setSignal(M.target);
  applyMissionMarkers();
  renderMissionHud();
  $('#obj-name').textContent = M.target.name;
  $('#obj-step').textContent = `목적지 ${i + 1} / ${M.stops.length}`;
  $('#objective').classList.add('on');
}
function applyMissionMarkers() {
  const M = S.mission; if (!M) return;
  WD.setAllMarkers((s) => (s === M.target ? 'target' : s.eras.includes(M.era) ? 'active' : 'dim'));
  const halos = [];
  if (M.target) halos.push({ x: M.target.x, z: M.target.z, r: 14, s: 1.4, color: '#ffb547' });
  for (const s of eraSites(M.era)) if (s !== M.target) halos.push({ x: s.x, z: s.z, r: 8, s: 0.5, color: ERAS[M.era].color });
  WD.setHalos(halos);
}
function renderMissionHud() {
  const M = S.mission; if (!M) return;
  const e = Math.max(0, M.energy);
  $('#hud-stats').innerHTML = `
    <div class="stat wide"><small>${esc(M.name)} 미션 · ${LEVEL_NAME[S.level]}</small><b>${Math.min(M.i + 1, M.stops.length)}<span>/${M.stops.length}</span></b></div>
    <div class="stat"><small>점수</small><b id="h-score">${M.score.toLocaleString('ko-KR')}</b></div>
    <div class="stat combo ${M.combo >= 2 ? 'hot' : ''}"><small>연속</small><b>×${M.combo}</b></div>
    <div class="energy ${e < 25 ? 'low' : ''}"><small>${ICON.bolt}시간 에너지</small><div class="eb"><i id="h-energy" style="width:${e}%"></i></div></div>`;
}
function updateEnergyBar() {
  const M = S.mission; const el = $('#h-energy'); if (!el || !M) return;
  el.style.width = Math.max(0, M.energy) + '%';
  el.parentElement.parentElement.classList.toggle('low', M.energy < 25);
}
function useHint() {
  const M = S.mission; if (!M || M.phase !== 'search') return;
  sfx.click();
  M.energy -= 10; updateEnergyBar();
  WD.flyTo({ x: M.target.x, z: M.target.z, dist: 140, el: 0.85, dur: dur(1.4) });
  toast('신호 추적: 목적지 상공으로 이동합니다.');
  if (M.energy <= 0) endMission('energy');
}
async function arriveTarget() {
  const M = S.mission; if (!M || M.phase !== 'search') return;
  M.phase = 'arrive';
  hideChooser(); closeCard(true);
  $('#edge-arrow').classList.remove('on');
  const site = M.target;
  const az = W.controls.getAzimuthalAngle() + 0.5;
  await WD.flyTo({ x: site.x, z: site.z, dist: 58, el: 0.55, az, dur: dur(1.8) });
  if (M.done) return;
  WD.setSignal(null);
  WD.setMarkerState(site.id, 'reveal');
  WD.shockwave(site.x, site.z, '#ffb547', 45);
  WD.shockwave(site.x, site.z, W.byId[site.id].color, 25);
  sfx.arrive(); flash('rgba(255,181,71,.25)');
  popScore('도착', innerWidth / 2, innerHeight * 0.42, 'big');
  WD.setAutoRotate(true, 0.6);
  const isNew = D.markVisited(site.id);
  if (isNew) setTimeout(() => { sfx.collect(); toast(`<b>새 기록 수집</b> ${esc(site.name)}`, 'gold'); }, 600);
  M.phase = 'card';
  renderCard(site, 'mission');
  if (Q.get('quiz') === '1') setTimeout(() => $('#cd-q')?.click(), 60);
}
function onMissionAnswer(ok, quiz, rect) {
  const M = S.mission; if (!M) return;
  M.answered++;
  if (ok) {
    M.correct++; M.combo++; M.maxCombo = Math.max(M.maxCombo, M.combo);
    const pts = 100 * quiz.level + 25 * (M.combo - 1);
    M.score += pts; M.energy = Math.min(100, M.energy + 8);
    sfx.correct(M.combo);
    popScore(`+${pts}`, rect.left + rect.width / 2, rect.top, 'good');
    if (M.combo >= 2) setTimeout(() => popScore(`${M.combo}연속!`, rect.left + rect.width / 2, rect.top - 40, 'combo'), 180);
  } else {
    M.combo = 0; M.energy -= S.level === 1 ? 6 : 12;
  }
  renderMissionHud();
  const last = M.i >= M.stops.length - 1;
  $('#cd-quiz').insertAdjacentHTML('beforeend', `<div class="cd-act"><button class="btn primary" id="cd-next">${last ? '최종 관문으로' : '다음 목적지로'} ›</button></div>`);
  $('#cd-next').onclick = () => { sfx.click(); nextStop(); };
  if (M.energy <= 0) setTimeout(() => endMission('energy'), 900);
}
async function nextStop() {
  const M = S.mission; if (!M || M.done) return;
  closeCard(true);
  WD.setAutoRotate(false);
  const cur = M.stops[M.i];
  WD.setMarkerState(cur.id, 'active');
  const ni = M.i + 1;
  if (ni >= M.stops.length) {
    await runAnomaly(true);
    if (!M.done) endMission('clear');
    return;
  }
  if (ni % 3 === 0) { await runAnomaly(false); if (M.done) return; }
  if (M.stopEra[ni] !== M.era) { await gotoEra(M.stopEra[ni]); if (M.done) return; }
  setTarget(ni);
  await WD.flyTo({ x: cur.x, z: cur.z, dist: 330, el: 0.95, dur: dur(1.4) });
  if (M.done) return;
  M.phase = 'search';
}

// ---------- 시공간 이상 신호(종합 문제) ----------
function pickGeneral(M) {
  const lv = S.level;
  const ids = new Set(M.stops.map((s) => s.id));
  let pool = S.general.filter((g) => !M.usedGeneral.has(g.q));
  const score = (g) => (g.topic === '시대 잇기' ? 3 : 0) + (g.related.some((r) => ids.has(r)) ? 2 : 0) + (g.level === lv ? 4 : g.level < lv ? 1 : -3) + Math.random() * 1.5;
  pool.sort((a, b) => score(b) - score(a));
  return pool[0];
}
function runAnomaly(final) {
  return new Promise(async (resolve) => {
    const M = S.mission; if (!M) return resolve();
    M.phase = 'anomaly';
    const g = pickGeneral(M); M.usedGeneral.add(g.q); M.anomalies++;
    $('#objective').classList.remove('on'); $('#edge-arrow').classList.remove('on');
    document.body.classList.add('glitch'); sfx.alarm(); shake(document.body, 1.4);
    const el = $('#anomaly');
    el.innerHTML = `<div class="an-alert"><span>WARNING</span><b>${final ? '최종 관문 · 시공간 이상 신호' : '시공간 이상 신호 감지'}</b><small>시대의 기록이 뒤섞였습니다. 바르게 연결해 신호를 안정시키세요.</small></div>`;
    showScreen('anomaly');
    await wait(1300);
    document.body.classList.remove('glitch');
    if (M.done) return resolve();
    const L = ['A', 'B', 'C', 'D'];
    el.innerHTML = `<div class="an-panel holo">
      <div class="an-head"><span class="an-tag">ANOMALY #${M.anomalies}</span><em>${esc(g.topic)}</em><em>${LEVEL_NAME[g.level]}</em></div>
      <p class="qz-q">${esc(g.q)}</p>
      <div class="qz-ch">${g.choices.map((c, i) => `<button class="ch" data-i="${i}"><b>${L[i]}</b><span>${esc(c)}</span></button>`).join('')}</div>
      <div class="qz-ex" id="an-ex"></div>
    </div>`;
    sfx.open();
    let done = false;
    $$('.ch', el).forEach((b) => b.onclick = () => {
      if (done) return; done = true;
      const i = +b.dataset.i, ok = i === g.answer;
      $$('.ch', el).forEach((x, j) => { x.disabled = true; x.classList.toggle('right', j === g.answer); });
      const r = b.getBoundingClientRect();
      if (ok) {
        M.anomalyOk++; M.correct++; M.combo++; M.maxCombo = Math.max(M.maxCombo, M.combo);
        const pts = 200 + 25 * (M.combo - 1);
        M.score += pts; M.energy = Math.min(100, M.energy + 20);
        sfx.correct(M.combo); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 60 });
        popScore(`+${pts}`, r.left + r.width / 2, r.top, 'good');
      } else {
        b.classList.add('wrong'); M.combo = 0; M.energy -= S.level === 1 ? 5 : 10; sfx.wrong(); shake($('.an-panel'), 1.2);
      }
      M.answered++;
      renderMissionHud();
      const rel = g.related.map((id) => S.byId[id]).filter(Boolean);
      $('#an-ex').innerHTML = `<div class="ex ${ok ? 'ok' : 'no'}"><b>${ok ? '신호 안정화 성공' : '신호 불안정'}</b><p>${esc(g.explain)}</p>
        ${rel.length ? `<div class="rel">${rel.map((s) => `<span style="--c:${W.byId[s.id].color}">${esc(s.name)}</span>`).join('<i>›</i>')}</div>` : ''}</div>
        <div class="cd-act"><button class="btn primary" id="an-go">${final ? '결과 보기' : '미션 계속'} ›</button></div>`;
      if (rel.length) {
        // 관련 장소를 지도에 잇기
        for (const s of rel) WD.setMarkerState(s.id, 'reveal');
        for (let k = 0; k < rel.length - 1; k++) WD.addArc(rel[k], rel[k + 1], '#ffb547', { width: 2.5, dashed: true });
        const xs = rel.map((s) => s.x), zs = rel.map((s) => s.z);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
        WD.flyTo({ x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2 + 20, dist: Math.max(160, span * 1.8), el: 1.0, dur: dur(1.4) });
        el.classList.add('peek');
      }
      $('#an-go').onclick = () => {
        sfx.click(); hideScreen('anomaly'); el.classList.remove('peek'); WD.clearArcs();
        applyMissionMarkers();
        if (M.energy <= 0) { endMission('energy'); return resolve(); }
        $('#objective').classList.add('on');
        resolve();
      };
    });
  });
}

function onFrame(dt) {
  const M = S.mission;
  if (S.mode === 'explore' && M && !M.done) {
    if (M.phase === 'search') {
      const rate = [0, 0.55, 0.9, 1.4][S.level];
      const floor = S.level === 1 ? 15 : 0;
      if (M.energy > floor) M.energy = Math.max(floor, M.energy - rate * dt);
      M._acc = (M._acc || 0) + dt;
      if (M._acc > 0.25) { M._acc = 0; updateEnergyBar(); }
      if (M.energy <= 0) endMission('energy');
      updateObjective();
    }
    const on = M.phase === 'search';
    if (on !== M._objOn) { M._objOn = on; $('#objective').classList.toggle('on', on); if (!on) $('#edge-arrow').classList.remove('on'); }
  }
  const G = S.guess;
  if (S.mode === 'guess' && G && !G.done && (G.phase === 'place' || G.phase === 'era')) {
    const before = Math.ceil(G.left);
    G.left -= dt;
    const after = Math.ceil(G.left);
    if (after !== before && after <= 5 && after > 0) sfx.tick();
    const tb = $('#g-time');
    if (tb) { tb.style.width = Math.max(0, (G.left / G.limit) * 100) + '%'; tb.parentElement.classList.toggle('low', G.left < 6); }
    const tn = $('#g-left'); if (tn) tn.textContent = Math.max(0, Math.ceil(G.left));
    if (G.left <= 0) guessTimeout();
  }
  for (const a of S.anchors) {
    const p = WD.project(a.pos);
    a.el.style.opacity = p.behind ? 0 : 1;
    a.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-50%)`;
  }
}
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
function updateObjective() {
  const M = S.mission, t = M.target; if (!t) return;
  const c = W.controls.target;
  const dx = t.x - c.x, dz = t.z - c.z;
  const d = Math.hypot(dx, dz);
  const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  $('#obj-dist').textContent = d < 8 ? '신호 바로 아래' : `화면 중심에서 ${DIRS[Math.round(bearing / 45) % 8]}쪽 ${Math.round(d)} km`;
  // 나침반: 카메라가 바라보는 방향 기준
  const camAz = W.controls.getAzimuthalAngle();
  $('#needle').style.transform = `rotate(${bearing + camAz * 180 / Math.PI}deg)`;
  $('.compass-n').style.transform = `rotate(${camAz * 180 / Math.PI}deg) translateY(-19px) rotate(${-camAz * 180 / Math.PI}deg)`;
  // 화면 밖 방향 표시
  const top = { x: t.x, y: WD.groundY(t.x, t.z) + 20, z: t.z };
  const p = WD.project(top);
  const m = 60;
  const off = p.behind || p.x < m || p.x > innerWidth - m || p.y < m + 50 || p.y > innerHeight - m - 90;
  const ea = $('#edge-arrow');
  if (!off) { ea.classList.remove('on'); return; }
  let vx = p.x - innerWidth / 2, vy = p.y - innerHeight / 2;
  if (p.behind) { vx = -vx; vy = -vy; }
  const ang = Math.atan2(vy, vx);
  const hw = innerWidth / 2 - m, hh = innerHeight / 2 - m - 50;
  const k = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
  ea.style.left = innerWidth / 2 + Math.cos(ang) * k + 'px';
  ea.style.top = innerHeight / 2 + Math.sin(ang) * k + 'px';
  ea.querySelector('svg').style.transform = `rotate(${ang}rad)`;
  ea.querySelector('span').textContent = `${Math.round(d)} km`;
  ea.classList.add('on');
}

function endMission(reason) {
  const M = S.mission; if (!M || M.done) return;
  M.done = true; M.phase = 'end';
  WD.setSignal(null); $('#objective').classList.remove('on'); $('#edge-arrow').classList.remove('on');
  closeCard(true); hideScreen('anomaly');
  const total = M.stops.length + M.anomalies;
  const ratio = M.answered ? M.correct / Math.max(total, M.answered) : 0;
  const energyBonus = reason === 'clear' ? Math.round(Math.max(0, M.energy) * 3) : 0;
  const final = M.score + energyBonus;
  const stars = reason !== 'clear' ? (ratio >= 0.5 ? 1 : 0) : ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : 1;
  const key = `explore:${M.id}:${S.level}`;
  const rec = D.setBest(key, final);
  let badge = null;
  if (reason === 'clear' && ratio >= 0.8) {
    const name = M.id === 'flow' ? '시간 여행 마스터' : `${M.name} 전문가`;
    if (D.addBadge(name)) badge = name; else badge = null;
    if (!badge) badge = { again: name };
  }
  showResult({
    kind: 'explore', title: reason === 'clear' ? '미션 완료' : '시간 에너지 소진',
    sub: `${M.name} 미션 · ${LEVEL_NAME[S.level]}`, fail: reason !== 'clear',
    score: final, stars, rec,
    lines: [['정답', `${M.correct} / ${total}`], ['최대 연속', `${M.maxCombo}`], ['이상 신호 해결', `${M.anomalyOk} / ${M.anomalies}`], ['남은 에너지 보너스', `+${energyBonus}`]],
    badge, retry: () => startMission(M.id),
  });
}

// ================= 좌표 추적 (위치 맞히기) =================
const G_LIMIT = { 1: 40, 2: 25, 3: 22 };
function startGuess() {
  cleanupMode(); hideAllScreens();
  setMode('guess');
  const lv = S.level;
  let qs;
  if (lv === 1) { const a = shuffle(S.sites.filter((s) => s.fame === 3)); const b = shuffle(S.sites.filter((s) => s.fame === 2)); qs = shuffle([...a, ...b.slice(0, 10 - a.length)]); }
  else if (lv === 2) qs = shuffle(S.sites.filter((s) => s.fame >= 2)).slice(0, 10);
  else { const f1 = shuffle(S.sites.filter((s) => s.fame === 1)).slice(0, 4); const rest = shuffle(S.sites.filter((s) => !f1.includes(s))).slice(0, 6); qs = shuffle([...f1, ...rest]); }
  S.guess = { qs, i: -1, score: 0, combo: 0, maxCombo: 0, dists: [], eraOk: 0, phase: 'intro', pick: null, done: false, limit: G_LIMIT[lv], left: 0 };
  WD.setAllMarkers(() => 'hidden');
  WD.setHalos([]);
  WD.setLabelMode({ sites: 'reveal', provinces: lv < 3 });
  WD.setProvinceLines(lv < 3);
  setEra('all', { quiet: true, markers: false });
  nextGuess();
}
function guessView() { const o = WD.overviewParams(); return WD.flyTo({ ...o, dist: o.dist * (innerWidth < 760 ? 1.05 : 1.12), z: innerWidth < 760 ? 150 : 95, el: 1.12, az: 0, dur: dur(1.3) }); }
function renderGuessHud() {
  const G = S.guess;
  $('#hud-stats').innerHTML = `
    <div class="stat wide"><small>좌표 추적 · ${LEVEL_NAME[S.level]}</small><b>${G.i + 1}<span>/${G.qs.length}</span></b></div>
    <div class="stat"><small>점수</small><b>${G.score.toLocaleString('ko-KR')}</b></div>
    <div class="stat combo ${G.combo >= 2 ? 'hot' : ''}"><small>정밀 연속</small><b>×${G.combo}</b></div>`;
}
async function nextGuess() {
  const G = S.guess;
  WD.clearArcs(); clearAnchors(); WD.setReticle(null); closeCard(true);
  if (G.i >= 0) WD.setMarkerState(G.qs[G.i].id, 'hidden');
  G.i++;
  if (G.i >= G.qs.length) return endGuess();
  G.pick = null; G.eraPick = null; G.phase = 'fly';
  renderGuessHud();
  const site = G.qs[G.i];
  const hint = S.level === 1 ? `${esc(site.region)} · ${site.eras.map((e) => e === '자연' ? '자연 지형' : e).join('·')}`
    : S.level === 2 ? `${site.type === 'nature' ? '자연 지형' : '역사 유적'} · ${site.eras.map((e) => e === '자연' ? '자연 지형' : e).join('·')}`
      : '단서 없음 · 이름만 보고 찾으세요';
  const bar = $('#guessbar');
  bar.innerHTML = `
    <div class="gb-top"><span class="gb-tag">TARGET ${G.i + 1}</span><span class="gb-step">${S.level === 3 ? '<em class="on">① 어디?</em><em>② 언제?</em>' : '<em class="on">어디?</em>'}</span><span class="gb-sec"><b id="g-left">${G.limit}</b>초</span></div>
    <div class="gb-q"><small>이곳은 어디일까요?</small><b>${esc(site.name)}</b><span>${hint}</span></div>
    <div class="gb-time"><i id="g-time"></i></div>
    <div class="gb-act"><span class="gb-help">${isTouch ? '지도를 탭해 표적을 놓으세요' : '지도를 클릭해 표적을 놓으세요 (Enter 확정)'}</span><button class="btn primary" id="g-ok" disabled>좌표 확정</button></div>`;
  bar.classList.add('on');
  bar.classList.remove('flip'); void bar.offsetWidth; bar.classList.add('flip');
  $('#g-ok').onclick = () => confirmGuess();
  sfx.open();
  await guessView();
  if (G.done) return;
  G.left = G.limit; G.phase = 'place';
  if (Q.get('autopick') && G.i === 0) {
    G.pick = { x: site.x + 18, z: site.z - 22 }; WD.setReticle(G.pick);
    confirmGuess();
    if (S.level === 3) $('.era-pick button')?.click();
  }
}
function guessTap(x, y) {
  const G = S.guess; if (!G || G.phase !== 'place') return;
  const p = WD.raycastTerrain(x, y);
  if (!p) return;
  G.pick = { x: p.x, z: p.z };
  WD.setReticle(G.pick); sfx.place();
  burst(x, y, { n: 14, colors: ['#3ff4ff', '#ffffff'], speed: 4, life: 0.6, r: 2 });
  const ok = $('#g-ok'); ok.disabled = false; ok.classList.add('ready');
}
function confirmGuess() {
  const G = S.guess; if (!G || G.phase !== 'place' || !G.pick) return;
  sfx.lock();
  if (S.level === 3) {
    G.phase = 'era';
    const site = G.qs[G.i];
    $$('.gb-step em').forEach((e, i) => e.classList.toggle('on', i === 1));
    $('.gb-q small').textContent = '이곳은 어느 시대의 장소일까요?';
    $('.gb-act').innerHTML = `<div class="era-pick">${ERA_ORDER.map((e) => `<button data-e="${e}" style="--c:${ERAS[e].color}"><i>${ERAS[e].glyph}</i>${e === '자연' ? '자연' : e}</button>`).join('')}</div>`;
    G.left = Math.max(G.left, 10);
    $$('.era-pick button').forEach((b) => b.onclick = () => { if (G.phase !== 'era') return; G.eraPick = b.dataset.e; b.classList.add('sel'); sfx.click(); revealGuess(); });
    void site;
  } else revealGuess();
}
function guessTimeout() {
  const G = S.guess; if (!G) return;
  if (G.phase === 'place' && G.pick && S.level === 3) { G.eraPick = null; revealGuess(); return; }
  revealGuess();
}
async function revealGuess() {
  const G = S.guess; if (!G || (G.phase !== 'place' && G.phase !== 'era')) return;
  G.phase = 'reveal';
  const site = G.qs[G.i];
  let d = null, pts = 0, eraOk = null;
  WD.setMarkerState(site.id, 'reveal');
  WD.shockwave(site.x, site.z, '#ffb547', 40);
  sfx.reveal();
  if (G.pick) {
    const ll = worldToLonLat(G.pick.x, G.pick.z);
    d = distanceKm(ll.lat, ll.lon, site.lat, site.lon);
    const base = d <= 10 ? 1000 : Math.round(1000 * Math.exp(-(d - 10) / 150));
    const tb = Math.round(Math.max(0, G.left) / G.limit * 200);
    if (d <= 40) { G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); } else G.combo = 0;
    const cb = d <= 40 ? 50 * Math.min(5, G.combo - 1) : 0;
    pts = base + tb + cb;
    if (S.level === 3) { eraOk = !!G.eraPick && site.eras.includes(G.eraPick); if (eraOk) { pts += 300; G.eraOk++; } }
    G.dists.push(d);
    WD.addArc(G.pick, site, d <= 40 ? '#3ff4ff' : '#ffb547', { width: 3, lift: Math.max(4, d * 0.18) });
    const mid = { x: (G.pick.x + site.x) / 2, y: WD.groundY((G.pick.x + site.x) / 2, (G.pick.z + site.z) / 2) + Math.max(4, d * 0.18) + 3, z: (G.pick.z + site.z) / 2 };
    addAnchor(`<b>${d < 1 ? '<1' : Math.round(d)}</b> km`, mid, 'dist');
    if (d <= 50) D.markLocated(site.id);
    const span = Math.max(d * 1.25, 1);
    WD.flyTo({ x: mid.x, z: mid.z + 4, dist: Math.max(190, span * 2.6), el: 1.05, dur: dur(1.3) });
  } else {
    G.combo = 0; G.dists.push(300);
    WD.flyTo({ x: site.x, z: site.z, dist: 160, el: 1.0, dur: dur(1.3) });
  }
  G.score += pts;
  renderGuessHud();
  const grade = d == null ? ['시간 초과', 'miss'] : d <= 10 ? ['완벽 명중', 'perfect'] : d <= 40 ? ['정밀 명중', 'great'] : d <= 100 ? ['근접', 'good'] : ['빗나감', 'miss'];
  if (d != null && d <= 40) { sfx.correct(G.combo); flash('rgba(63,244,255,.3)'); setTimeout(() => burst(innerWidth / 2, innerHeight * 0.4, { n: 70 }), 300); }
  else { sfx.wrong(); if (d == null || d > 100) shake(document.body, 0.8); }
  popScore(`+${pts}`, innerWidth / 2, innerHeight * 0.35, d != null && d <= 40 ? 'good big' : 'big');
  const mk = W.byId[site.id];
  $('#guessbar').innerHTML = `
    <div class="gb-top"><span class="gb-tag">RESULT ${G.i + 1}</span><span class="gb-grade ${grade[1]}">${grade[0]}</span><span class="gb-sec">+${pts}</span></div>
    <div class="gb-res" style="--c:${mk.color}">
      <div class="gb-km"><b>${d == null ? '-' : d < 1 ? '<1' : Math.round(d)}</b><small>km 오차</small></div>
      <div class="gb-info"><b>${esc(site.name)}</b><small>${esc(site.region)}${site.country === 'CHN' ? ' · <em class="chn">지금은 중국 땅</em>' : ''}</small>
      ${S.level === 3 ? `<span class="era-res ${eraOk ? 'ok' : 'no'}">${eraOk ? '시대 판정 성공 +300' : '시대 판정 실패'} · 정답 ${site.eras.map((e) => e === '자연' ? '자연 지형' : e).join('·')}</span>` : `<span class="era-res">${eraBadges(site)}</span>`}
      </div>
    </div>
    <p class="gb-sum">${esc(site.summary)}</p>
    <div class="gb-act"><span></span><button class="btn primary" id="g-next">${G.i + 1 >= G.qs.length ? '결과 보기' : '다음 표적'} ›</button></div>`;
  $('#g-next').onclick = () => { sfx.click(); nextGuess(); };
}
function endGuess() {
  const G = S.guess; G.done = true;
  $('#guessbar').classList.remove('on');
  const avg = G.dists.reduce((a, b) => a + b, 0) / Math.max(1, G.dists.length);
  const grade = avg <= 20 ? 'S' : avg <= 45 ? 'A' : avg <= 90 ? 'B' : 'C';
  const stars = { S: 3, A: 3, B: 2, C: 1 }[grade];
  const rec = D.setBest(`guess:${S.level}`, G.score);
  let badge = null;
  const bname = grade === 'S' ? '좌표 추적 마스터' : grade === 'A' ? '정밀 관측관' : null;
  if (bname) badge = D.addBadge(bname) ? bname : { again: bname };
  showResult({
    kind: 'guess', title: '좌표 추적 완료', sub: `좌표 추적 · ${LEVEL_NAME[S.level]}`, grade,
    score: G.score, stars, rec,
    lines: [['평균 오차', `${Math.round(avg)} km`], ['정밀 명중(40km 이내)', `${G.dists.filter((d) => d <= 40).length} / ${G.qs.length}`], ['최대 연속', `${G.maxCombo}`], ...(S.level === 3 ? [['시대 판정', `${G.eraOk} / ${G.qs.length}`]] : [])],
    badge, retry: () => startGuess(),
  });
}
function addAnchor(html, pos, cls = '') {
  const el = document.createElement('div');
  el.className = 'anchor ' + cls; el.innerHTML = html;
  $('#labels').appendChild(el);
  S.anchors.push({ el, pos });
}
function clearAnchors() { for (const a of S.anchors) a.el.remove(); S.anchors = []; }

// ================= 결과 =================
function showResult(r) {
  const el = $('#result');
  const starHtml = [0, 1, 2].map((i) => `<span class="st ${i < r.stars ? 'on' : ''}" style="--d:${0.5 + i * 0.25}s">${ICON.star}</span>`).join('');
  const badgeName = r.badge ? (typeof r.badge === 'string' ? r.badge : r.badge.again) : null;
  el.innerHTML = `<div class="res-panel holo ${r.fail ? 'fail' : ''}">
    <div class="res-kicker">${esc(r.sub)}</div>
    <h2 class="res-title">${esc(r.title)}</h2>
    <div class="res-stars">${starHtml}</div>
    ${r.grade ? `<div class="res-grade g${r.grade}">${r.grade}</div>` : ''}
    <div class="res-score"><small>최종 점수</small><b id="res-num">0</b></div>
    ${r.rec.isRecord && r.score > 0 ? `<div class="res-rec">최고 기록 갱신${r.rec.prev ? ` · 이전 ${r.rec.prev.toLocaleString('ko-KR')}` : ''}</div>` : `<div class="res-prev">최고 기록 ${Math.max(r.rec.prev, r.score).toLocaleString('ko-KR')}</div>`}
    <div class="res-lines">${r.lines.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>
    ${badgeName ? `<div class="res-badge ${typeof r.badge === 'string' ? 'new' : ''}"><i>${ICON.star}</i><span><small>${typeof r.badge === 'string' ? '새 칭호 획득' : '보유 칭호'}</small><b>${esc(badgeName)}</b></span></div>` : ''}
    <div class="res-act">
      <button class="btn primary" id="r-retry">다시 도전</button>
      ${r.kind === 'explore' ? '<button class="btn" id="r-other">다른 시대</button>' : ''}
      <button class="btn" id="r-arch">기록 보관소</button>
      <button class="btn ghost" id="r-home">처음으로</button>
    </div></div>`;
  showScreen('result');
  setTimeout(() => countUp($('#res-num'), r.score, FAST ? 10 : 1300), FAST ? 0 : 300);
  if (!r.fail && r.stars >= 2) { setTimeout(() => { sfx.fanfare(); confetti(); }, FAST ? 0 : 300); }
  else if (r.fail) sfx.fail(); else sfx.fanfare();
  if (r.rec.isRecord && r.score > 0) setTimeout(() => sfx.record(), FAST ? 0 : 1700);
  $('#r-retry').onclick = () => { sfx.click(); hideScreen('result'); r.retry(); };
  $('#r-other') && ($('#r-other').onclick = () => { sfx.click(); hideScreen('result'); showTitle(true); openMissions(); });
  $('#r-arch').onclick = () => { sfx.click(); showTitle(true); openArchive(); };
  $('#r-home').onclick = () => { sfx.click(); showTitle(true); };
  WD.setAutoRotate(true, 0.4);
}
function demoResult() {
  showResult({ kind: 'explore', title: '미션 완료', sub: '고구려 미션 · 보통', score: 1840, stars: 3, rec: { isRecord: true, prev: 1200 },
    lines: [['정답', '6 / 7'], ['최대 연속', '4'], ['이상 신호 해결', '2 / 2'], ['남은 에너지 보너스', '+186']], badge: '고구려 전문가', retry: () => startMission('고구려') });
}

// ================= 연대기 기록 보관소 =================
const AF = { era: 'all', type: 'all' };
function openArchive() {
  const el = $('#archive');
  const total = S.sites.length;
  const got = S.sites.filter((s) => D.isCollected(s.id)).length;
  const solved = Object.keys(store.solved).length;
  const pct = Math.round((got / total) * 100);
  el.innerHTML = `<div class="ar-wrap">
    <div class="scr-head"><button class="back" id="ar-back">‹ 닫기</button><h2>연대기 기록 보관소</h2></div>
    <div class="ar-stats">
      <div class="ar-ring" style="--p:${pct}"><b>${pct}<small>%</small></b><span>수집률</span></div>
      <div class="ar-nums"><div><small>수집한 장소</small><b>${got}<span>/${total}</span></b></div><div><small>해결한 문제</small><b>${solved}<span>/${total * 5}</span></b></div></div>
      <div class="ar-badges"><small>획득한 칭호</small><div>${store.badges.length ? store.badges.map((b) => `<span>${esc(b)}</span>`).join('') : '<em>미션에서 정답률 80% 이상이면 칭호를 얻습니다</em>'}</div></div>
    </div>
    <div class="ar-filter">
      <div class="chips" id="af-era">${['all', ...ERA_ORDER].map((e) => `<button data-e="${e}" style="--c:${e === 'all' ? '#ffffff' : ERAS[e].color}" class="${AF.era === e ? 'on' : ''}">${e === 'all' ? '전체 시대' : e}</button>`).join('')}</div>
      <div class="chips" id="af-type">${[['all', '전체 유형'], ['history', '역사 유적'], ['nature', '자연 지형']].map(([k, n]) => `<button data-t="${k}" class="${AF.type === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    </div>
    <div class="timeline" id="ar-tl"></div>
    <p class="ar-hint">카드를 누르면 관제실 지도가 그 장소로 이동합니다.</p>
  </div>`;
  showScreen('archive');
  $('#ar-back').onclick = () => { sfx.click(); hideScreen('archive'); };
  $$('#af-era button').forEach((b) => b.onclick = () => { AF.era = b.dataset.e; sfx.dial(); openArchive(); });
  $$('#af-type button').forEach((b) => b.onclick = () => { AF.type = b.dataset.t; sfx.dial(); openArchive(); });
  const tl = $('#ar-tl');
  const eras = AF.era === 'all' ? ERA_ORDER : [AF.era];
  tl.innerHTML = eras.map((e) => {
    const list = S.sites.filter((s) => s.eras.includes(e) && (AF.type === 'all' || s.type === AF.type)).sort((a, b) => b.fame - a.fame);
    if (!list.length) return '';
    const g = list.filter((s) => D.isCollected(s.id)).length;
    return `<div class="tl-row" style="--c:${ERAS[e].color}">
      <div class="tl-era"><span class="tl-dot">${ERAS[e].glyph}</span><b>${e === '자연' ? '자연 지형' : e}</b><small>${ERAS[e].span}</small><em>${g}/${list.length}</em></div>
      <div class="tl-cards">${list.map((s) => {
        const c = D.isCollected(s.id);
        const sv = s.quizzes.filter((q, i) => store.solved[`${s.id}:${i}`]).length;
        return `<button class="tl-card ${c ? 'got' : 'lock'} ${RARITY[s.fame].cls}" data-id="${s.id}">
          <span class="tc-st">${'★'.repeat(s.fame)}</span>
          <b>${esc(s.name)}</b><small>${esc(s.region)}</small>
          <span class="tc-foot">${c ? `<em>${ICON.check}수집</em>` : '<em class="lk">미수집</em>'}${s.country === 'CHN' ? '<em class="chn">중국 땅</em>' : ''}<em class="qq">문제 ${sv}/5</em></span>
        </button>`;
      }).join('')}</div></div>`;
  }).join('') || '<p class="empty">조건에 맞는 장소가 없습니다.</p>';
  $$('.tl-card', tl).forEach((b) => b.onclick = () => {
    sfx.click();
    const site = S.byId[b.dataset.id];
    hideScreen('archive');
    if (S.mode !== 'free') startFree(AF.era === 'all' ? 'all' : AF.era);
    else hideAllScreens();
    setTimeout(() => openSite(site, { context: 'free' }), FAST ? 30 : 400);
  });
}

// ================= 안내 =================
function openInfo() {
  const el = $('#info');
  const src = (S.geo?.sources || []).map((s) => `<li>${esc(s)}</li>`).join('');
  el.innerHTML = `<div class="info-panel holo">
    <div class="scr-head"><button class="back" id="in-back">‹ 닫기</button><h2>지도 출처 · 표기 안내</h2></div>
    <section><h3>조작 방법</h3><ul>
      <li>컴퓨터: 왼쪽 드래그로 회전, 오른쪽 드래그로 이동, 휠로 확대·축소, W·A·S·D 또는 방향키로 이동</li>
      <li>휴대폰·태블릿: 한 손가락으로 이동, 두 손가락으로 확대·축소와 회전</li>
      <li>빛 기둥을 누르면 장소 기록이 열립니다. 장소가 몰린 곳(예: 개성 일대)은 목록에서 고릅니다.</li>
      <li>오른쪽 위 지도 버튼으로 홀로그램 · 혼합 · 실제 지도 색을 바꿉니다.</li>
    </ul></section>
    <section><h3>남북 표기 차이</h3><ul>
      <li>지도와 장소 이름은 북한의 현행 행정구역 표기를 사용합니다. 예: 량강도(남한 표기 양강도), 라선(나선), 력포(역포).</li>
      <li>북한은 두음법칙을 적용하지 않습니다.</li>
      <li>노란 선은 북한의 육상 국경과 군사분계선입니다. 이웃 나라 땅은 흐리게 표시했습니다.</li>
      <li>오녀산성과 국내성은 고구려 유적이지만 지금은 중국 땅입니다. 주황색 표시로 구분합니다.</li>
      <li>'대략 위치' 표시가 있는 장소는 넓은 지역이거나 위치를 대략적으로 표시한 곳입니다.</li>
    </ul></section>
    <section><h3>출처</h3><ul>${src}<li>장소 설명·문제: 교사 검토용 초안</li><li>${esc(S.meta?.credits || '')}</li></ul></section>
    <section><h3>기록 저장</h3><p>수집 기록과 최고 점수는 이 브라우저에만 저장됩니다.</p><button class="btn ghost" id="in-reset">기록 초기화</button></section>
  </div>`;
  showScreen('info');
  $('#in-back').onclick = () => { sfx.click(); hideScreen('info'); };
  $('#in-reset').onclick = () => {
    if (!window.confirm('수집 기록과 최고 점수를 모두 지울까요?')) return;
    Object.assign(store, { visited: {}, solved: {}, located: {}, best: {}, badges: [] }); D.saveStore();
    toast('기록을 초기화했습니다.');
    if (S.mode === 'title') showTitle(true);
  };
}

boot().catch((e) => {
  console.error(e);
  const b = $('#err'); b.textContent = '불러오기 실패: ' + (e.message || e); b.classList.add('on');
  $('#loading .ld-t').textContent = '불러오기에 실패했습니다. 새로 고침해 주세요.';
});
