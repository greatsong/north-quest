// 답사 기록 저장 (localStorage 접근이 막혀도 동작)
const KEY = 'nq-kaesong-v1';
const blank = () => ({
  diff: 1, stamps: {}, obs: {}, quiz: {}, score: 0, examBest: null, examLast: null,
  quest: { step: 0, done: false }, bestTotal: 0,
});
let mem = blank();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) mem = Object.assign(blank(), JSON.parse(raw));
} catch (e) { /* 저장소 없이 진행 */ }

export const store = {
  get s() { return mem; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 무시 */ } },
  reset() { const d = mem.diff; mem = blank(); mem.diff = d; this.save(); },
  hasStamp(id) { return !!mem.stamps[id]; },
  stamp(id) { if (mem.stamps[id]) return false; mem.stamps[id] = Date.now(); this.save(); return true; },
  obsFound(id) { return mem.obs[id] || []; },
  addObs(id, i) {
    const a = mem.obs[id] || (mem.obs[id] = []);
    if (a.includes(i)) return false;
    a.push(i); this.save(); return true;
  },
  addScore(n) { mem.score += n; this.save(); },
  stampCount() { return Object.keys(mem.stamps).length; },
};
