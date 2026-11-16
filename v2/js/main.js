// 북녘 탐험대 v2: 미니어처 디오라마 탐험 — 시작점
import { loadHeights, loadContent } from '../../shared/geo.js';
import { World } from './world.js';
import { A, buildLabels, updateLabels, refreshMarkers } from './app.js';
import { $, ICON, toast } from './ui.js';
import { initAudio, setMuted, sfx } from './audio.js';
import { store } from './store.js';
import { showTitle, begin, showAlbum, showResults } from './screens.js';
import { thumb } from './thumbs.js';
import { LANDMARK } from './sitecfg.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug') || ['localhost', '127.0.0.1'].includes(location.hostname);

if (DEBUG) {
  window.__A = A;
  const show = (msg) => { const e = $('#err'); e.style.display = 'block'; e.textContent += msg + '\n'; };
  window.addEventListener('error', (e) => show('오류: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => show('오류: ' + (e.reason && e.reason.message || e.reason)));
}

function isLow() {
  if (params.has('low')) return params.get('low') !== '0';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  return (coarse && small) || (navigator.hardwareConcurrency || 8) <= 3;
}

function progress(k, msg) {
  const b = $('#ldBar'); if (b) b.style.width = Math.round(k * 100) + '%';
  if (msg) $('#ldMsg').textContent = msg;
}

async function loadMask(low) {
  const img = new Image();
  img.src = '../shared/data/mask.png';
  await img.decode();
  const w = low ? 768 : 1536, h = low ? 775 : 1550;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

async function boot() {
  store.load();
  setMuted(!!store.data.muted);
  const low = isLow();
  A.low = low;
  progress(0.1, '지도판을 꺼내는 중');
  const base = '../shared/data';
  const [content, heights, mask] = await Promise.all([
    loadContent(base),
    loadHeights(base, low ? '384x387' : '768x775'),
    loadMask(low),
  ]);
  progress(0.55, '지형을 만드는 중');
  A.content = content;
  A.sites = content.sites;
  A.general = content.general;
  for (const s of A.sites) A.byId[s.id] = s;

  // 이름표(캔버스)에 쓸 글꼴을 먼저 불러온다(최대 1.5초)
  try { await Promise.race([document.fonts.load('700 92px "Dongle"'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* 무시 */ }
  const world = new World($('#stage'), { low });
  A.world = world;
  if (params.has('dtmax')) world.dtMax = Number(params.get('dtmax')) || 0.05; // 느린 헤드리스 확인용
  world.build(heights, mask, content.geo);
  world.resize();
  progress(0.85, '말과 카드를 놓는 중');
  buildLabels();
  // 카드 그림 미리 만들기(조금씩)
  const types = [...new Set(Object.values(LANDMARK))];
  let ti = 0;
  const warm = () => { if (ti < types.length) { thumb(types[ti++]); setTimeout(warm, 16); } };
  setTimeout(warm, 1200);

  bindInput(world);
  world.start((dt) => {
    A.frame && A.frame(dt);
    updateLabels();
  });

  // 음소거 버튼
  const mb = $('#muteBtn');
  const paint = () => { mb.innerHTML = store.data.muted ? ICON.mute : ICON.sound; mb.setAttribute('aria-label', store.data.muted ? '소리 켜기' : '소리 끄기'); };
  paint();
  mb.addEventListener('click', () => {
    initAudio();
    store.data.muted = !store.data.muted; store.save();
    setMuted(store.data.muted); paint();
    if (!store.data.muted) sfx.click();
  });

  progress(1, '준비 완료');
  setTimeout(() => $('#loading').classList.add('done'), 150);
  setTimeout(() => $('#loading').remove(), 900);

  // 디버그 진입 경로: ?mode=explore&level=1 / ?mode=guess / ?screen=album / ?demo=card|quiz|reveal|result
  const mode = params.get('mode'), lv = Math.min(3, Math.max(1, Number(params.get('level')) || store.data.level || 1));
  const demo = params.get('demo');
  if (mode === 'explore' || mode === 'guess') {
    A.level = lv;
    // 카메라 초기 위치를 판 위로
    world.camera.position.set(0, 700, 700);
    begin(mode, lv);
    if (demo) runDemo(mode, demo);
  } else if (params.get('screen') === 'album') {
    world.camera.position.set(0, 600, 700);
    showTitle({ fly: false });
    showAlbum('title');
  } else if (demo === 'result') {
    showTitle({ fly: false });
    showResults({ mode: 'guess', level: lv, score: 7340, rounds: 10, total: 10, hits: 3, avg: 42, maxCombo: 4, stars: 3, chanceOk: true });
  } else {
    world.camera.position.set(0, 1500, 1700);
    showTitle();
  }
}

// 스크린샷 확인용 자동 진행
function runDemo(mode, demo) {
  const W = A.world;
  if (mode === 'explore') {
    setTimeout(() => {
      const b = document.querySelector('.mcard:not(.back)');
      if (b) b.click();
      if (demo === 'move' || demo === 'card' || demo === 'quiz') {
        setTimeout(() => {
          const s = A.G.mission || A.byId.myohyang;
          const p = W.pawn.group.position;
          const tx = p.x + (s.x - p.x) * 0.999, tz = p.z + (s.z - p.z) * 0.999;
          if (demo === 'move') { A.onTap && moveDirect(tx, tz); return; }
          A.onMarker(s);
          if (demo === 'quiz') setTimeout(() => { const q = document.querySelector('[data-a=quiz]'); q && q.click(); }, 9000);
        }, 3200);
      }
    }, 3600);
  } else if (mode === 'guess') {
    setTimeout(() => {
      const s = A.G.site;
      const p = { x: s.x + 22, z: s.z + 14 };
      A.G.aim = { x: p.x, y: W.surfaceY(p.x, p.z), z: p.z, sea: false };
      const r = A.G.reticle; r.position.set(p.x, A.G.aim.y + 0.3, p.z); r.visible = true;
      document.querySelector('#gThrow').disabled = false;
      if (demo === 'reveal') document.querySelector('#gThrow').click();
    }, 2400);
  }
  function moveDirect(x, z) { const s = W.project(x, W.surfaceY(x, z), z); A.onTap(s.x, s.y); }
}

function bindInput(world) {
  const el = world.renderer.domElement;
  const ptrs = new Map();
  let down = null, multi = false;
  el.addEventListener('pointerdown', (e) => {
    initAudio();
    ptrs.set(e.pointerId, e);
    if (ptrs.size > 1) multi = true;
    if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; multi = false; }
  });
  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (!down) return;
    if (ptrs.size === 0) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      const ok = !multi && Math.hypot(dx, dy) < 8 && performance.now() - down.t < 500 && e.button === 0;
      down = null;
      if (ok && A.onTap) A.onTap(e.clientX, e.clientY);
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); down = null; });
  let hov = null, raf = false;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    hov = e;
    if (!raf) { raf = true; requestAnimationFrame(() => { raf = false; if (A.onHover && hov) A.onHover(hov.clientX, hov.clientY); }); }
  });
  el.addEventListener('pointerleave', () => { if (A.onHover) A.onHover(-9999, -9999); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

boot().catch((e) => {
  console.error(e);
  const m = $('#ldMsg');
  if (m) m.textContent = '불러오기에 실패했습니다. 페이지를 새로고침하면 다시 시도합니다. (' + (e.message || e) + ')';
});

void refreshMarkers; void toast;
