// 진행 상황 저장 (localStorage 접근 실패해도 동작)
const KEY = 'northquest_v1_save';

export const store = { visited: {}, solved: {}, gen: {}, best: {}, badges: {}, muted: false, plays: 0 };

try {
  const raw = window.localStorage.getItem(KEY);
  if (raw) Object.assign(store, JSON.parse(raw));
} catch (e) { /* 저장소를 사용할 수 없는 환경 */ }

export function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 무시 */ }
}

export function markVisited(id) {
  if (store.visited[id]) return false;
  store.visited[id] = Date.now();
  save();
  return true;
}

export function markSolved(siteId, qi) {
  store.solved[siteId + ':' + qi] = 1;
  save();
}

export function markGen(i) { store.gen[i] = 1; save(); }

export function solvedCount(siteId) {
  let n = 0;
  for (let i = 0; i < 5; i++) if (store.solved[siteId + ':' + i]) n++;
  return n;
}

export function visitedCount() { return Object.keys(store.visited).length; }

export function setBest(key, score) {
  const prev = store.best[key] || 0;
  if (score > prev) { store.best[key] = score; save(); return { isNew: true, prev }; }
  return { isNew: false, prev };
}

export function addBadge(id) {
  if (store.badges[id]) return false;
  store.badges[id] = Date.now();
  save();
  return true;
}
