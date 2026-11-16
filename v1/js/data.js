// v1 하늘길 탐험대: 미션·수수께끼 힌트·배지 정의 (버전 고유 안내 문구)

export const MISSIONS = [
  {
    id: 'm1', name: '고구려의 길', stars: 1, color: '#ff5a4e', badge: 'b_m1',
    desc: '첫 도읍 졸본에서 평양까지 고구려의 도읍과 무덤을 따라갑니다.',
    sites: ['jolbon', 'gungnae', 'salsu', 'anhak', 'pyongyang', 'dongmyeong', 'gangseo'],
  },
  {
    id: 'm2', name: '고려의 수도 개성', stars: 2, color: '#19b5a6', badge: 'b_m2',
    desc: '개성 일대의 고려 유적과 남북 협력 장소를 찾아갑니다. 장소가 가까이 모여 있어 천천히 날아야 합니다.',
    sites: ['wanggeon', 'gongmin', 'bakyeon', 'manwoldae', 'seonggyun', 'seonjuk', 'kaesong_ic', 'panmunjom'],
  },
  {
    id: 'm3', name: '북쪽 국경을 따라', stars: 2, color: '#ffb02e', badge: 'b_m3',
    desc: '압록강 하구에서 두만강 하구까지 국경선을 따라 날아갑니다.',
    sites: ['wihwado', 'yalu', 'uiju', 'supung', 'junggang', 'baekdu', 'hoeryong', 'tumen'],
  },
  {
    id: 'm4', name: '산과 고원', stars: 1, color: '#5cc96b', badge: 'b_m4',
    desc: '묘향산에서 금강산까지 북녘의 산과 고원을 둘러봅니다.',
    sites: ['myohyang', 'nangrim', 'gaema', 'chilbo', 'kumgang', 'singye'],
  },
  {
    id: 'm5', name: '동해안과 함경도', stars: 2, color: '#4aa8ff', badge: 'b_m5',
    desc: '원산에서 북관대첩비까지 동해안 도시와 전쟁의 흔적을 찾아갑니다.',
    sites: ['wonsan', 'hamhung', 'hungnam', 'jangjin', 'bukcheong', 'bukgwan'],
  },
  {
    id: 'm6', name: '평안도와 황해도', stars: 3, color: '#b07cff', badge: 'b_m6',
    desc: '서쪽 평야와 바다를 따라 학교 터, 산성, 벽화 무덤을 찾아갑니다.',
    sites: ['gwiju', 'osan', 'dangun', 'westsea', 'jangsan', 'guwol', 'anak', 'seongbul'],
  },
];

export const FREE_FLIGHT = {
  id: 'free', name: '자유 비행', stars: 0, color: '#9fb4c8',
  desc: '미션 없이 자유롭게 날며 장소를 찾아 도감을 채웁니다.', sites: [],
};

// 다음 목적지 수수께끼(이름을 숨긴 힌트)
export const RIDDLES = {
  baekdu: '한반도에서 가장 높은 산입니다. 꼭대기에 칼데라 호수가 있습니다.',
  gaema: '평균 높이가 해발 1,000m가 넘는 넓은 고원입니다. 감자와 귀리 같은 밭농사를 많이 합니다.',
  nangrim: '한반도 북부를 남북 방향으로 가르는 산맥입니다. 서쪽은 평안도, 동쪽은 함경도입니다.',
  junggang: '압록강 상류의 마을입니다. 1933년 1월 영하 43.6℃를 기록했습니다.',
  myohyang: '최고봉 비로봉의 높이가 1,909m인 산입니다. 고려 때 세운 절에 팔만대장경 인쇄본이 있습니다.',
  kumgang: '봉우리가 많아 일만이천봉이라고 부르는 산입니다. 계절마다 이름이 다릅니다.',
  singye: '금강산 안에 있는 절입니다. 남북 불교계가 함께 복원해 2007년에 다시 세웠습니다.',
  chilbo: '일곱 가지 보물이 묻혀 있다는 전설에서 이름이 나온 산입니다. 함경북도 동해안 가까이에 있습니다.',
  guwol: '단군 이야기의 아사달로 보는 견해가 있는 산입니다. 황해남도에 있습니다.',
  jangsan: '황해도 서쪽 끝에서 바다로 길게 튀어나온 곶입니다. 남한의 백령도와 마주 보고 있습니다.',
  wonsan: '고운 모래밭이 약 4km 이어진 해변이 있는 동해안 도시입니다. 1880년에 개항했습니다.',
  yalu: '1911년 압록강 위에 놓인 철교입니다. 1950년 폭격으로 끊어졌습니다.',
  wihwado: '압록강 가운데 있는 섬입니다. 1388년 이성계가 이곳에서 군대를 돌렸습니다.',
  uiju: '조선 시대 사신이 중국으로 가며 지나던 국경 관문 도시입니다. 압록강을 내려다보는 정자가 있습니다.',
  supung: '압록강을 막아 만든 수력 발전 댐입니다. 완공 당시 아시아에서 가장 큰 규모였습니다.',
  tumen: '북한·중국·러시아 세 나라 국경이 만나는 강 하구입니다. 1991년 경제특구로 지정된 도시가 있습니다.',
  hoeryong: '세종 때 김종서가 두만강 가에 설치한 6진 가운데 하나입니다.',
  pyongyang: '427년 고구려 장수왕이 도읍을 옮긴 곳입니다. 성의 동쪽 문이 남아 있습니다.',
  anhak: '평지의 궁궐 터와 가까운 산성이 함께 있는 고구려 유적입니다. 평양 북동쪽에 있습니다.',
  gangseo: '고구려 후기 벽화 무덤 세 기가 모여 있는 곳입니다. 청룡·백호·주작·현무가 그려져 있습니다.',
  anak: '357년이라는 연도가 적힌 4세기 고구려 벽화 무덤입니다. 대행렬도가 그려져 있습니다.',
  dangun: '1994년 피라미드 모양으로 새로 지은 무덤입니다. 고조선을 세웠다고 전하는 인물과 관련됩니다.',
  dongmyeong: '북한이 고구려 시조 주몽의 무덤이라고 소개하는 고분입니다. 앞에 정릉사 절터가 있습니다.',
  salsu: '612년 을지문덕이 수나라 별동대를 크게 무찌른 강입니다. 서해로 흘러드는 길이 약 200km의 강입니다.',
  gwiju: '1019년 강감찬이 거란군을 크게 무찌른 곳입니다. 서희가 외교 담판으로 얻은 강동 6주의 하나입니다.',
  manwoldae: '고려 왕궁이 있던 터입니다. 남북 역사학자들이 여러 차례 함께 발굴했습니다.',
  seonjuk: '1392년 정몽주가 죽임을 당한 돌다리입니다.',
  seonggyun: '고려의 최고 교육 기관이 있던 곳입니다. 지금은 고려박물관으로 사용합니다.',
  wanggeon: '918년 고려를 세운 왕의 무덤입니다.',
  gongmin: '원나라 간섭에서 벗어나려 한 고려 왕과 왕비의 쌍릉입니다.',
  bakyeon: '송도삼절의 하나인 폭포입니다. 개성 북쪽 천마산에 있습니다.',
  seongbul: '산성 안에 절이 있는 곳입니다. 황해북도의 도 소재지인 사리원에 있습니다.',
  hamhung: '조선을 세운 태조가 왕이 되기 전에 살던 집입니다. 함경남도의 도 소재지에 있습니다.',
  hungnam: '1950년 12월 피란민 약 10만 명이 배를 타고 남쪽으로 떠난 부두입니다.',
  jangjin: '개마고원에 있는 인공 호수입니다. 1950년 겨울 큰 전투가 벌어졌습니다.',
  bukgwan: '임진왜란 때 함경도 의병의 승리를 기록한 비석입니다. 2006년 원래 있던 곳으로 돌아갔습니다.',
  osan: '1907년 이승훈이 세운 민족 교육 학교의 터입니다. 김소월과 백석이 이 학교에서 공부했습니다.',
  bukcheong: '발해의 남경 남해부로 추정되는 토성이 있는 고장입니다. 사자놀음으로 알려져 있습니다.',
  westsea: '대동강 하구를 가로질러 쌓은 길이 약 8km의 둑과 수문입니다.',
  jolbon: '주몽이 고구려를 세웠다고 전하는 첫 도읍입니다. 절벽이 둘러싼 산 위에 있으며, 지금은 중국 땅입니다.',
  gungnae: '427년까지 고구려의 도읍이었던 곳입니다. 광개토대왕의 업적을 새긴 비석이 있으며, 지금은 중국 땅입니다.',
  panmunjom: '1953년 정전협정이 서명된 곳입니다. 남북 군인이 함께 경비하는 구역이 있습니다.',
  kaesong_ic: '남한 기업이 공장을 짓고 북한 노동자가 일한 공단입니다. 2016년 가동이 중단되었습니다.',
};

export const BADGES = [
  { id: 'b_m1', name: '고구려 전문가', desc: '「고구려의 길」을 정답률 70% 이상으로 완주', color: '#ff5a4e' },
  { id: 'b_m2', name: '개성 박사', desc: '「고려의 수도 개성」을 정답률 70% 이상으로 완주', color: '#19b5a6' },
  { id: 'b_m3', name: '국경 비행사', desc: '「북쪽 국경을 따라」를 정답률 70% 이상으로 완주', color: '#ffb02e' },
  { id: 'b_m4', name: '산악 탐사원', desc: '「산과 고원」을 정답률 70% 이상으로 완주', color: '#5cc96b' },
  { id: 'b_m5', name: '동해안 탐사원', desc: '「동해안과 함경도」를 정답률 70% 이상으로 완주', color: '#4aa8ff' },
  { id: 'b_m6', name: '서쪽 평야 탐사원', desc: '「평안도와 황해도」를 정답률 70% 이상으로 완주', color: '#b07cff' },
  { id: 'b_combo', name: '연속 정답 5', desc: '탐험 비행에서 5문제 연속 정답', color: '#ffc94a' },
  { id: 'b_sharp', name: '위치 명사수', desc: '위치 맞히기에서 오차 5km 이내', color: '#ff7ab6' },
  { id: 'b_map', name: '지도 박사', desc: '위치 맞히기 한 판 8,000점 이상', color: '#7cc7ff' },
  { id: 'b_dex50', name: '도감 절반', desc: '장소 22곳 이상 발견', color: '#9be15d' },
  { id: 'b_dexall', name: '도감 완성', desc: '장소 43곳 모두 발견', color: '#ffd84a' },
];

export const LEVELS = {
  1: { name: '기초', explore: '문제가 쉽고 연료가 천천히 줄어듭니다. 지명과 도 경계가 모두 보입니다.', guess: '널리 알려진 장소 위주. 지역 힌트와 도 경계가 보입니다. 제한 시간 30초.' },
  2: { name: '보통', explore: '문제가 조금 어려워집니다. 가까운 장소 이름만 보입니다.', guess: '알려진 장소 위주. 시대 힌트와 도 이름이 보입니다. 제한 시간 20초.' },
  3: { name: '도전', explore: '어려운 문제와 빠른 연료 소모. 지도 표시가 최소로 줄어듭니다.', guess: '모든 장소가 나옵니다. 힌트와 지도 표시가 없습니다. 제한 시간 15초.' },
};

export const ERA_COLORS = {
  '고조선': '#a1887f', '고구려': '#ff5a4e', '발해': '#b07cff', '신라': '#f2c230', '고려': '#19b5a6',
  '조선': '#4a8dff', '근대': '#c98a5a', '근현대': '#c98a5a', '현대': '#8fa3b5', '자연': '#5cc96b',
};

export function eraList(site) {
  return site.era.split('·').map((e) => e.replace(/\(.*\)/, ''));
}

export function eraMatch(site, chip) {
  return eraList(site).some((e) => e === chip || (e === '근현대' && (chip === '근대' || chip === '현대')));
}

export function eraColor(site) {
  const list = eraList(site);
  const main = list.find((e) => e !== '자연') || list[0];
  return ERA_COLORS[main] || '#8fa3b5';
}

/** 한글 받침 여부에 맞는 조사 선택 */
export function josa(word, withB, withoutB) {
  const clean = word.replace(/\(.*?\)/g, '').trim();
  for (let i = clean.length - 1; i >= 0; i--) {
    const c = clean.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) return ((c - 0xac00) % 28 !== 0) ? withB : withoutB;
  }
  return withB;
}
