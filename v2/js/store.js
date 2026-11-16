// 진행 상황 저장 (localStorage 접근이 막혀도 동작)
const KEY = 'northquest_v2';
const base = () => ({ visited: {}, quiz: {}, general: {}, best: {}, titles: {}, muted: false, level: 1, plays: 0 });

export const store = {
  data: base(),
  load() {
    try {
      const s = localStorage.getItem(KEY);
      if (s) this.data = Object.assign(base(), JSON.parse(s));
    } catch (e) { /* 저장소 사용 불가 */ }
    return this.data;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ }
  },
  visit(id) { if (!this.data.visited[id]) { this.data.visited[id] = Date.now(); this.save(); return true; } return false; },
  markQuiz(id, qi) {
    const a = this.data.quiz[id] || (this.data.quiz[id] = []);
    if (!a.includes(qi)) { a.push(qi); this.save(); }
  },
  markGeneral(i) { this.data.general[i] = 1; this.save(); },
  best(key, score) {
    const prev = this.data.best[key] || 0;
    if (score > prev) { this.data.best[key] = score; this.save(); return { record: true, prev }; }
    return { record: false, prev };
  },
  addTitle(t) { if (!this.data.titles[t]) { this.data.titles[t] = Date.now(); this.save(); return true; } return false; },
};
