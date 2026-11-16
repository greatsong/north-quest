// 장소별 모형 종류, 시대 색, 등급, 칭호
export const LANDMARK = {
  baekdu: 'volcano', gaema: 'plateau', nangrim: 'range', junggang: 'thermometer', myohyang: 'temple',
  kumgang: 'peaks', singye: 'temple', chilbo: 'peaks', guwol: 'mountain', jangsan: 'lighthouse',
  wonsan: 'beach', yalu: 'brokenBridge', wihwado: 'islandFlag', uiju: 'pavilion', supung: 'dam',
  tumen: 'bridge', hoeryong: 'gate', pyongyang: 'gate', anhak: 'palace', gangseo: 'tomb3',
  anak: 'tomb', dangun: 'pyramid', dongmyeong: 'tomb', salsu: 'swords', gwiju: 'swords',
  manwoldae: 'tower', seonjuk: 'stoneBridge', seonggyun: 'palace', wanggeon: 'tomb', gongmin: 'tomb2',
  bakyeon: 'waterfall', seongbul: 'temple', hamhung: 'palace', hungnam: 'ship', jangjin: 'lake',
  bukgwan: 'stele', osan: 'school', bukcheong: 'earthwall', westsea: 'dam', jolbon: 'fortressMesa',
  gungnae: 'stele', panmunjom: 'huts', kaesong_ic: 'factory',
};

export const ERA_COLOR = {
  고조선: '#a77bff', 고구려: '#ff6f61', 발해: '#ff9f43', 신라: '#f2b630', 고려: '#25b89a',
  조선: '#4f8dff', 근대: '#8a6cf0', 근현대: '#8a6cf0', 현대: '#5b6b8c', 자연: '#45b85c',
};
export const ERA_FILTERS = ['고조선', '고구려', '발해', '신라', '고려', '조선', '근대', '현대', '자연'];

export function eraTokens(era) {
  return era.split('·').map((t) => t.replace(/\(.*\)/, '').trim()).map((t) => (t === '근현대' ? '근대' : t));
}
export function mainEra(site) {
  const t = eraTokens(site.era);
  return t[0] === '자연' && t[1] ? t[1] : t[0];
}
export function eraColor(site) { return ERA_COLOR[mainEra(site)] || '#888'; }
export function hasEra(site, e) {
  const t = eraTokens(site.era);
  if (e === '현대') return t.includes('현대') || site.era.includes('근현대');
  return t.includes(e);
}

export const RARITY = {
  3: { code: 'N', name: '대표 명소', color: '#3fcf8e' },
  2: { code: 'R', name: '레어', color: '#4f9dff' },
  1: { code: 'SR', name: '슈퍼 레어', color: '#b06cff' },
};

export function mastery(store, id) {
  const n = (store.data.quiz[id] || []).length;
  return n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
}

// 칭호: 조건은 저장된 진행 기록으로 판정
export function computeTitles(store, sites, run = {}) {
  const v = store.data.visited, qz = store.data.quiz;
  const correctAt = (pred) => sites.filter((s) => pred(s) && (qz[s.id] || []).length > 0).length;
  const visitedN = (pred) => sites.filter((s) => pred(s) && v[s.id]).length;
  const T = [];
  if (correctAt((s) => hasEra(s, '고구려')) >= 3) T.push('고구려 전문가');
  if (correctAt((s) => hasEra(s, '고려')) >= 3) T.push('고려 전문가');
  if (correctAt((s) => hasEra(s, '조선')) >= 3) T.push('조선 전문가');
  if (correctAt((s) => hasEra(s, '현대')) >= 3) T.push('현대사 탐구자');
  if (visitedN((s) => s.type === 'nature') >= 5) T.push('자연 탐험가');
  const kae = sites.filter((s) => s.cluster === '개성 일대');
  if (kae.length && kae.every((s) => v[s.id])) T.push('개성 일대 완전 정복');
  if (sites.filter((s) => s.country === 'CHN').every((s) => v[s.id])) T.push('국경 너머 고구려 탐방');
  const vn = Object.keys(v).length;
  if (vn >= 22) T.push('도감 절반 달성');
  if (vn >= sites.length) T.push('도감 완성');
  if (Object.keys(store.data.general).length >= 10) T.push('종합 문제 달인');
  if (run.hits >= 3) T.push('명사수');
  if (run.combo >= 5) T.push('콤보 마스터');
  return T;
}
