// 시대 정보, 데이터 가공, 저장소
export const ERA_ORDER = ['고조선', '고구려', '신라', '발해', '고려', '조선', '근대', '현대', '자연'];

export const ERAS = {
  고조선: { color: '#c39bff', glyph: '朝', span: '~ 기원전 108', year: -108, en: 'GOJOSEON' },
  고구려: { color: '#ff5d6c', glyph: '句', span: '기원전 37 ~ 668', year: -37, en: 'GOGURYEO' },
  신라: { color: '#ff8fd8', glyph: '羅', span: '기원전 57 ~ 935', year: -57, en: 'SILLA' },
  발해: { color: '#ffd166', glyph: '渤', span: '698 ~ 926', year: 698, en: 'BALHAE' },
  고려: { color: '#38d6ff', glyph: '麗', span: '918 ~ 1392', year: 918, en: 'GORYEO' },
  조선: { color: '#ff9a3c', glyph: '鮮', span: '1392 ~ 1897', year: 1392, en: 'JOSEON' },
  근대: { color: '#b8ff5a', glyph: '近', span: '1876 ~ 1945', year: 1876, en: 'MODERN' },
  현대: { color: '#8fb4ff', glyph: '現', span: '1945 ~ 오늘', year: 1945, en: 'CONTEMPORARY' },
  자연: { color: '#4dffc3', glyph: '山', span: '시대를 넘어선 지형', year: null, en: 'NATURE' },
};

/** era 문자열 → 시대 배열. "자연·고려" → ['자연','고려'], "근현대" → ['근대','현대'] */
export function parseEras(era) {
  const out = [];
  for (let e of String(era).split('·')) {
    e = e.replace(/\(.*?\)/g, '').trim();
    if (e === '근현대') out.push('근대', '현대');
    else if (ERAS[e]) out.push(e);
  }
  return [...new Set(out)];
}

export function yearLabel(y) {
  if (y == null) return '';
  return y < 0 ? `기원전 ${-y}년` : `${y}년`;
}

/** 미션 목록. 장소가 적은 시대는 묶는다. */
export const MISSIONS = [
  { id: 'flow', name: '시간의 흐름', sub: '모든 시대를 차례로 건너는 미션', eras: null },
  { id: '고구려', name: '고구려', eras: ['고구려'] },
  { id: '고려', name: '고려', eras: ['고려'] },
  { id: '조선', name: '조선', eras: ['조선'] },
  { id: 'ancient', name: '고조선·신라·발해', sub: '기록이 적게 남은 세 나라', eras: ['고조선', '신라', '발해'] },
  { id: '근대', name: '근대', eras: ['근대'] },
  { id: '현대', name: '현대', eras: ['현대'] },
  { id: '자연', name: '자연 지형', eras: ['자연'] },
];

export const RARITY = {
  3: { label: 'S급 기록', cls: 'r3' },
  2: { label: 'A급 기록', cls: 'r2' },
  1: { label: 'B급 기록', cls: 'r1' },
};

// ---------- 저장소 ----------
const KEY = 'northquest_v3';
const DEF = () => ({ visited: {}, solved: {}, located: {}, best: {}, badges: [], muted: false, view: 0 });
let store = DEF();
export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) store = Object.assign(DEF(), JSON.parse(raw));
  } catch (e) { store = DEF(); }
  return store;
}
export function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 저장 불가 환경 */ }
}
export function getStore() { return store; }
export function markVisited(id) {
  const isNew = !store.visited[id];
  store.visited[id] = Date.now();
  saveStore();
  return isNew;
}
export function markLocated(id) {
  const isNew = !store.located[id];
  store.located[id] = Date.now();
  saveStore();
  return isNew;
}
export function markSolved(key) { store.solved[key] = 1; saveStore(); }
export function setBest(key, score) {
  const prev = store.best[key] || 0;
  if (score > prev) { store.best[key] = score; saveStore(); return { isRecord: true, prev }; }
  return { isRecord: false, prev };
}
export function addBadge(name) {
  if (!store.badges.includes(name)) { store.badges.push(name); saveStore(); return true; }
  return false;
}
export function isCollected(id) { return !!(store.visited[id] || store.located[id]); }

// ---------- 유틸 ----------
export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function pick(a) { return a[(Math.random() * a.length) | 0]; }
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const LEVEL_NAME = { 1: '기초', 2: '보통', 3: '도전' };
