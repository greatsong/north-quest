// North Quest 공통 지리 모듈 (세 버전이 함께 사용)
// 월드 좌표: 1 단위 = 1 km. x = 동쪽(+), z = 남쪽(+), y = 위(+). 지도 중심이 원점.
// 지형 범위·해상도는 shared/data/geo.json 과 같다.

export const BOUNDS = { lon0: 123.6, lon1: 131.0, lat0: 37.4, lat1: 43.1 };
const MID_LAT = (BOUNDS.lat0 + BOUNDS.lat1) / 2;
export const KM_PER_DEG_LAT = 111.32;
export const KM_PER_DEG_LON = 111.32 * Math.cos((MID_LAT * Math.PI) / 180);
export const WORLD_W = (BOUNDS.lon1 - BOUNDS.lon0) * KM_PER_DEG_LON; // 약 629 km
export const WORLD_H = (BOUNDS.lat1 - BOUNDS.lat0) * KM_PER_DEG_LAT; // 약 635 km

/** 경위도 → 월드 x,z (km) */
export function lonLatToWorld(lon, lat) {
  return {
    x: (lon - BOUNDS.lon0) * KM_PER_DEG_LON - WORLD_W / 2,
    z: (BOUNDS.lat1 - lat) * KM_PER_DEG_LAT - WORLD_H / 2,
  };
}

/** 월드 x,z (km) → 경위도 */
export function worldToLonLat(x, z) {
  return {
    lon: (x + WORLD_W / 2) / KM_PER_DEG_LON + BOUNDS.lon0,
    lat: BOUNDS.lat1 - (z + WORLD_H / 2) / KM_PER_DEG_LAT,
  };
}

/** 두 지점 사이 실제 거리(km, 대원 거리) */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 방위(0=북, 90=동) */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/**
 * 높이 격자 불러오기. size: '768x775'(기본, 데스크톱) 또는 '384x387'(모바일·저사양).
 * 값은 미터(바다는 음수). 반환: { w, h, data(Float32Array, 행 우선, 북→남), sampleWorld(x,z) }
 */
export async function loadHeights(baseUrl, size = '768x775') {
  const [w, h] = size.split('x').map(Number);
  const buf = await (await fetch(`${baseUrl}/height_${size}.i16`)).arrayBuffer();
  const i16 = new Int16Array(buf);
  const data = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) data[i] = i16[i];
  function sampleUV(u, v) { // u,v ∈ [0,1], v=0 이 북쪽
    const fx = Math.min(Math.max(u * w - 0.5, 0), w - 1.001);
    const fy = Math.min(Math.max(v * h - 0.5, 0), h - 1.001);
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const i = y0 * w + x0;
    return data[i] * (1 - tx) * (1 - ty) + data[i + 1] * tx * (1 - ty) +
      data[i + w] * (1 - tx) * ty + data[i + w + 1] * tx * ty;
  }
  return {
    w, h, data, sampleUV,
    /** 월드 x,z(km) 지점의 고도(m) */
    sampleWorld(x, z) { return sampleUV((x + WORLD_W / 2) / WORLD_W, (z + WORLD_H / 2) / WORLD_H); },
  };
}

/** 게임 콘텐츠(장소·문제·도 정보) 불러오기 */
export async function loadContent(baseUrl) {
  const [content, geo] = await Promise.all([
    fetch(`${baseUrl}/content.json`).then((r) => r.json()),
    fetch(`${baseUrl}/geo.json`).then((r) => r.json()),
  ]);
  for (const s of content.sites) Object.assign(s, lonLatToWorld(s.lon, s.lat));
  return { ...content, geo };
}
