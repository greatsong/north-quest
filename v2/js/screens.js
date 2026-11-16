// 첫 화면, 도감, 지도 정보, 결과 화면, 지도에서 보기
import { A, LEVEL_NAME, bindPhotos, artImg, refreshMarkers, openModal, closeModal, siteFront, cardShell, landmarkType } from './app.js';
import { $, $$, h, esc, toast, confetti, burst, flip, countUp, ICON } from './ui.js';
import { sfx, initAudio } from './audio.js';
import { store } from './store.js';
import { startExplore, stopExplore, EXP } from './explore.js';
import { startGuess, stopGuess, GCFG, overview } from './guess.js';
import { RARITY, ERA_FILTERS, eraColor, hasEra, mastery, computeTitles } from './sitecfg.js';
import { thumb } from './thumbs.js';

const LV_DESC = {
  1: '걸음이 넉넉하고 지명과 목적지 빛기둥이 보입니다. 위치 맞히기 30초.',
  2: '목적지에 가까워져야 빛기둥이 보입니다. 위치 맞히기 22초.',
  3: '지명·도 경계 없음. 나침반은 힌트로 켭니다. 위치 맞히기 15초.',
};

function setScreen(el) {
  const s = $('#screen');
  s.innerHTML = '';
  if (el) s.appendChild(el);
}

function titleCamera(fly = true) {
  const W = A.world;
  W.follow = null;
  W.hidePawn();
  W.removeLandmarks();
  for (const id of Object.keys(store.data.visited)) { const s = A.byId[id]; if (s) W.addLandmark(s, landmarkType(s), { scale: s.cluster ? 0.8 : 1.3 }); }
  W.setProvinceLines(true);
  const port = innerWidth < innerHeight;
  if (fly) W.flyTo({ x: 0, y: 0, z: port ? 150 : 10 }, port ? 1150 : 660, { polar: 0.86, dur: 2.2, done: () => { if (A.screen === 'title') W.controls.autoRotate = true; } });
  W.controls.autoRotateSpeed = 0.35;
  A.labelMode = { prov: true, sites: false, names: () => false, cls: () => 'off' };
  refreshMarkers();
  A.onTap = null; A.onHover = null; A.frame = null; A.onMarker = null; A.onCluster = null;
}

export function showTitle({ fly = true } = {}) {
  A.screen = 'title';
  closeModal(true);
  $('#hud').innerHTML = '';
  titleCamera(fly);
  const lv = store.data.level || 1;
  A.level = lv;
  const nv = Object.keys(store.data.visited).length;
  const best = (m) => Math.max(store.data.best[m + '_1'] || 0, store.data.best[m + '_2'] || 0, store.data.best[m + '_3'] || 0);
  const el = h(`<div class="title">
    <div class="logo">
      <div class="logo-badge">탁상 위 미니어처 지도 탐험</div>
      <h1 class="logo-kr"><span>북</span><span>녘</span> <span>탐</span><span>험</span><span>대</span></h1>
      <div class="logo-en">NORTH QUEST</div>
    </div>
    <div class="t-bottom">
      <div class="levels" role="radiogroup" aria-label="난이도">
        ${[1, 2, 3].map((l) => `<button class="lvb lv${l} ${l === lv ? 'on' : ''}" data-l="${l}" role="radio" aria-checked="${l === lv}">${LEVEL_NAME[l]}</button>`).join('')}
      </div>
      <div class="lv-desc" id="lvDesc">${LV_DESC[lv]}</div>
      <div class="modes">
        <button class="mode m-explore" id="goExplore">
          <span class="m-ic pawn"></span>
          <span class="m-t"><b>탐험 모드</b><small>목적지 카드를 뽑고 말을 움직여 찾아갑니다</small></span>
          <span class="m-best">최고 ${best('explore').toLocaleString('ko-KR')}점</span>
        </button>
        <button class="mode m-guess" id="goGuess">
          <span class="m-ic dart">${ICON.target}</span>
          <span class="m-t"><b>위치 맞히기</b><small>다트를 던져 장소의 위치를 맞힙니다</small></span>
          <span class="m-best">최고 ${best('guess').toLocaleString('ko-KR')}점</span>
        </button>
      </div>
      <div class="t-sub">
        <button class="pill" id="goAlbum">${ICON.book}<span>도감 <b>${nv}</b>/${A.sites.length}</span></button>
        <button class="pill" id="goInfo">${ICON.info}<span>지도 정보</span></button>
      </div>
    </div>
  </div>`);
  setScreen(el);
  el.querySelectorAll('.lvb').forEach((b) => b.addEventListener('click', () => {
    initAudio(); sfx.click();
    A.level = Number(b.dataset.l);
    store.data.level = A.level; store.save();
    el.querySelectorAll('.lvb').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    $('#lvDesc').textContent = LV_DESC[A.level];
  }));
  $('#goExplore').addEventListener('click', () => { initAudio(); sfx.click(); begin('explore', A.level); });
  $('#goGuess').addEventListener('click', () => { initAudio(); sfx.click(); begin('guess', A.level); });
  $('#goAlbum').addEventListener('click', () => { initAudio(); sfx.click(); showAlbum('title'); });
  $('#goInfo').addEventListener('click', () => { initAudio(); sfx.click(); showInfo(); });
}

export function begin(mode, level) {
  A.screen = mode;
  A.world.controls.autoRotate = false;
  closeModal(true);
  setScreen(h(`<div class="intro"><div class="intro-card"><small>${LEVEL_NAME[level]}</small><b>${mode === 'explore' ? '탐험 시작!' : '위치 맞히기 시작!'}</b></div></div>`));
  setTimeout(() => setScreen(null), 1400);
  store.data.plays = (store.data.plays || 0) + 1; store.save();
  if (mode === 'explore') startExplore(level, { onFinish: (r) => showResults(r) });
  else startGuess(level, { onFinish: (r) => showResults(r) });
}

// ───────────────────────── 결과
function grade(r) {
  const s = r.score;
  if (r.mode === 'guess') return s >= 9000 ? 'S' : s >= 7000 ? 'A' : s >= 5000 ? 'B' : s >= 3000 ? 'C' : 'D';
  return r.success && r.stars === 3 ? 'S' : r.success ? 'A' : r.done >= r.goal / 2 ? 'B' : r.done > 0 ? 'C' : 'D';
}
export function showResults(r) {
  A.screen = 'results';
  const W = A.world;
  W.follow = null;
  overview(1.6);
  setTimeout(() => { if (A.screen === 'results') W.controls.autoRotate = true; }, 1700);
  const key = `${r.mode}_${r.level}`;
  const rec = store.best(key, r.score);
  const before = new Set(Object.keys(store.data.titles));
  const titles = computeTitles(store, A.sites, { hits: r.hits || 0, combo: r.maxCombo || 0 });
  const fresh = titles.filter((t) => !before.has(t));
  titles.forEach((t) => store.addTitle(t));
  const g = grade(r);
  const head = r.mode === 'explore' ? (r.success ? '탐험 성공!' : r.quit ? '탐험 기록' : '탐험 종료') : '위치 맞히기 결과';
  const stats = r.mode === 'explore'
    ? [[`${r.done}/${r.goal}`, '목적지'], [`${r.correct}/${r.answered}`, '정답'], [`${r.maxCombo}`, '최대 연속'], [`${r.newCards}`, '새 카드']]
    : [[`${r.hits}`, '명중(15km 안)'], [`${Math.round(r.avg)}km`, '평균 오차'], [`${r.maxCombo}`, '최대 연속 근접'], [r.chanceOk ? '성공' : '-', '찬스 카드']];
  const el = h(`<div class="results">
    <div class="res-card">
      <div class="res-mode">${r.mode === 'explore' ? '탐험 모드' : '위치 맞히기'} · ${LEVEL_NAME[r.level]}</div>
      <div class="res-head">${head}</div>
      <div class="res-grade g${g}">${g}</div>
      <div class="res-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${0.5 + i * 0.25}s">★</i>`).join('')}</div>
      <div class="res-score"><b id="resScore">0</b><span>점</span></div>
      ${r.bonus ? `<div class="res-bonus">남은 걸음·완주 보너스 +${r.bonus.toLocaleString('ko-KR')}점 포함</div>` : ''}
      ${rec.record ? `<div class="record">최고 기록 갱신!${rec.prev ? ` <small>이전 ${rec.prev.toLocaleString('ko-KR')}점</small>` : ''}</div>` : `<div class="prev">최고 기록 ${rec.prev.toLocaleString('ko-KR')}점</div>`}
      <div class="res-stats">${stats.map(([v, k]) => `<div><b>${v}</b><small>${k}</small></div>`).join('')}</div>
      ${fresh.length ? `<div class="res-titles"><small>새 칭호</small>${fresh.map((t) => `<span class="ttl">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="res-actions">
        <button class="btn primary" id="rAgain">다시 하기</button>
        <button class="btn ghost" id="rAlbum">${ICON.book}도감</button>
        <button class="btn ghost" id="rHome">${ICON.home}처음 화면</button>
      </div>
    </div></div>`);
  setScreen(el);
  setTimeout(() => {
    countUp($('#resScore'), r.score, 1400);
    if (r.stars >= 2 || rec.record) { confetti(rec.record ? 200 : 120); sfx.fanfare(); } else sfx.arrive();
    if (rec.record) setTimeout(() => sfx.record(), 1500);
  }, 300);
  $('#rAgain').addEventListener('click', () => { sfx.click(); begin(r.mode, r.level); });
  $('#rHome').addEventListener('click', () => { sfx.click(); showTitle(); });
  $('#rAlbum').addEventListener('click', () => { sfx.click(); showAlbum('title'); });
}

// ───────────────────────── 도감
let albumFilter = 'all';
export function showAlbum(from = 'title') {
  A.screen = 'album';
  const nv = A.sites.filter((s) => store.data.visited[s.id]).length;
  const pct = Math.round((nv / A.sites.length) * 100);
  const titles = Object.keys(store.data.titles);
  const filters = [['all', '전체'], ...ERA_FILTERS.map((e) => [e, e]), ['type:nature', '자연 유형'], ['type:history', '역사 유형'], ['chn', '중국 땅']];
  const el = h(`<div class="album">
    <div class="al-head">
      <button class="rb back" id="alBack">${ICON.home}<span>${from === 'title' ? '처음 화면' : '돌아가기'}</span></button>
      <div class="al-t"><b>탐험 도감</b><div class="al-prog"><div class="bar"><i style="width:${pct}%"></i></div><span>${nv} / ${A.sites.length} 수집 (${pct}%)</span></div></div>
    </div>
    <div class="al-titles">${titles.length ? titles.map((t) => `<span class="ttl">${esc(t)}</span>`).join('') : '<span class="none">아직 받은 칭호가 없습니다. 예: 고구려 장소 3곳의 문제를 맞히면 「고구려 전문가」</span>'}</div>
    <div class="al-filters">${filters.map(([k, n]) => `<button class="chip ${k === albumFilter ? 'on' : ''}" data-f="${k}" ${ERA_FILTERS.includes(k) ? `style="--ec:${eraColorFor(k)}"` : ''}>${n}</button>`).join('')}</div>
    <div class="al-legend">${[3, 2, 1].map((f) => `<span style="--rc:${RARITY[f].color}"><i>${RARITY[f].code}</i>${RARITY[f].name}</span>`).join('')}<span class="st">★ 맞힌 문제 1·3·5개</span></div>
    <div class="al-grid" id="alGrid"></div>
  </div>`);
  setScreen(el);
  const render = () => {
    const grid = $('#alGrid');
    const list = A.sites.filter((s) => {
      const f = albumFilter;
      if (f === 'all') return true;
      if (f === 'chn') return s.country === 'CHN';
      if (f.startsWith('type:')) return s.type === f.slice(5);
      return hasEra(s, f);
    });
    grid.innerHTML = '';
    list.forEach((s, i) => {
      const got = !!store.data.visited[s.id];
      const r = RARITY[s.fame];
      const st = mastery(store, s.id);
      const c = h(got
        ? `<button class="acard" style="--rc:${r.color};--ec:${eraColor(s)};animation-delay:${i * 25}ms">
            <span class="ac-rar">${r.code}</span><span class="ac-st">${[1, 2, 3].map((k) => `<i class="${k <= st ? 'on' : ''}">★</i>`).join('')}</span>
            ${artImg(s)}
            <b>${esc(s.name)}</b><small class="era">${esc(s.era)}</small>${s.country === 'CHN' ? '<em>중국 땅</em>' : ''}</button>`
        : `<button class="acard locked" style="--rc:${r.color};animation-delay:${i * 25}ms"><span class="ac-rar">${r.code}</span><span class="q">?</span><small>미발견</small></button>`);
      c.addEventListener('click', () => {
        sfx.click();
        if (!got) {
          c.classList.remove('wig'); void c.offsetWidth; c.classList.add('wig');
          toast(`아직 발견하지 않은 카드입니다 · 지역: ${esc(s.region.split(' ')[0])}`);
          return;
        }
        albumDetail(s, from);
      });
      grid.appendChild(c);
    });
  };
  render();
  el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    albumFilter = b.dataset.f;
    el.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  $('#alBack').addEventListener('click', () => { sfx.click(); showTitle({ fly: false }); });
}
function eraColorFor(e) { return eraColor({ era: e }); }

function albumDetail(s, from) {
  const done = (store.data.quiz[s.id] || []).length;
  const card = cardShell(s, `<div class="mc-back big"><span>?</span></div>`, 'enter');
  const wrap = h('<div class="card-wrap"></div>');
  wrap.appendChild(card);
  openModal(wrap, { cls: 'dim' });
  setTimeout(() => flip(card, () => {
    card.innerHTML = siteFront(s, { actions: `<div class="qprog">맞힌 문제 ${done} / ${s.quizzes.length}</div><button class="btn ghost" data-a="close">닫기</button><button class="btn primary" data-a="map">지도에서 보기</button>` });
    bindPhotos(card);
    sfx.flip();
    card.querySelector('[data-a=close]').addEventListener('click', () => { sfx.click(); closeModal(); });
    card.querySelector('[data-a=map]').addEventListener('click', () => { sfx.click(); closeModal(true); viewOnMap(s, from); });
  }), 120);
}

function viewOnMap(s, from) {
  A.screen = 'view';
  const W = A.world;
  W.controls.autoRotate = false;
  titleCamera(false);
  W.flyTo({ x: s.x, y: W.peakY(s.x, s.z), z: s.z }, 85, { polar: 0.85, dur: 1.6 });
  const lm = W.landmarks.get(s.id);
  if (lm) setTimeout(() => { W.popObject(lm, lm.scale.x || 1); sfx.pop(); }, 1500);
  A.labelMode = { prov: true, sites: true, names: (q) => !!store.data.visited[q.id], cls: (q) => (q === s ? 'tgt' : store.data.visited[q.id] ? 'done' : 'off') };
  refreshMarkers();
  A.onMarker = (q) => { if (store.data.visited[q.id]) { sfx.click(); albumDetail(q, from); } };
  A.onCluster = (c) => W.flyTo({ x: c.x, y: 5, z: c.z }, 70, { dur: 0.9 });
  setScreen(h(`<div class="viewbar" style="--ec:${eraColor(s)}">
    <img alt="" src="${thumb(landmarkType(s))}">
    <div class="vb-t"><b>${esc(s.name)}</b><small>${esc(s.region)}</small></div>
    <button class="btn ghost" id="vbAlbum">${ICON.book}도감</button>
    <button class="btn primary" id="vbHome">${ICON.home}처음</button>
  </div>`));
  $('#vbAlbum').addEventListener('click', () => { sfx.click(); titleCamera(false); showAlbum(from); });
  $('#vbHome').addEventListener('click', () => { sfx.click(); showTitle(); });
}

// ───────────────────────── 지도 정보
export function showInfo() {
  const geo = A.content.geo, meta = A.content.meta;
  const box = h(`<div class="info">
    <b class="info-t">지도 정보</b>
    <section><h3>표기 안내</h3>
      <p>이 지도는 북한의 현행 행정구역 이름과 표기를 사용합니다. 북한은 두음법칙을 적용하지 않아 남한과 표기가 다릅니다.</p>
      <ul class="pairs"><li><b>량강도</b><span>남한 표기 양강도</span></li><li><b>라선</b><span>남한 표기 나선</span></li><li><b>력포</b><span>남한 표기 역포</span></li><li><b>로동</b><span>남한 표기 노동</span></li></ul>
      <p>오녀산성·국내성은 고구려 유적이지만 지금은 중국 땅에 있습니다. 지도에서 이웃 나라 땅은 흐리게 표시했습니다.</p>
      <p class="legend"><span class="ln y"></span>국경 <span class="ln r"></span>군사분계선 <span class="ln w"></span>도 경계</p>
    </section>
    <section><h3>출처</h3><ul>${geo.sources.map((s) => `<li>${esc(s)}</li>`).join('')}<li>장소 설명·문제: 교사 검토용 초안</li><li>${esc(meta.credits)}</li></ul></section>
    <section><h3>조작법</h3><ul>
      <li>드래그: 지도 돌리기 · 휠 또는 두 손가락: 확대·축소 · 오른쪽 드래그 또는 두 손가락 이동: 지도 옮기기</li>
      <li>탐험 모드: 지도를 누르면 말이 그곳으로 이동합니다. 이동 거리 5km마다 1걸음을 사용합니다.</li>
      <li>위치 맞히기: 지도를 눌러 조준하고 던지기 버튼(또는 스페이스 키)을 누릅니다.</li></ul></section>
    <div class="gc-actions"><button class="btn primary" id="infoOk">닫기</button></div>
  </div>`);
  box.querySelector('#infoOk').addEventListener('click', () => { sfx.click(); closeModal(); });
  openModal(box, { cls: 'dim' });
}

export { stopExplore, stopGuess, EXP, GCFG };
