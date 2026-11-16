// 개성 범위 전용 좌표 변환과 높이 격자 (1 단위 = 1m, 원점 = 범위 중심, x = 동쪽, z = 남쪽, y = 위)
export const BOUNDS = { lon0: 126.40, lon1: 126.72, lat0: 37.90, lat1: 38.10 };
export const LATC = (BOUNDS.lat0 + BOUNDS.lat1) / 2;
export const LONC = (BOUNDS.lon0 + BOUNDS.lon1) / 2;
// 위도 38도 부근 1도의 길이(m)
export const M_LAT = 110996.5;
export const M_LON = 87832.6;
export const WORLD_W = (BOUNDS.lon1 - BOUNDS.lon0) * M_LON; // 약 28.1km
export const WORLD_H = (BOUNDS.lat1 - BOUNDS.lat0) * M_LAT; // 약 22.2km
export const EXAG = 1.2; // 고도 과장 배율

export function ll2w(lat, lon) {
  return { x: (lon - LONC) * M_LON, z: (LATC - lat) * M_LAT };
}
export function w2ll(x, z) {
  return { lat: LATC - z / M_LAT, lon: LONC + x / M_LON };
}

export async function loadGrid(url, w, h) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('높이 자료를 불러오지 못했습니다: ' + url);
  const buf = await res.arrayBuffer();
  return new Ground(w, h, new Int16Array(buf));
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Ground {
  constructor(w, h, raw) {
    this.w = w; this.h = h;
    this.dx = WORLD_W / w; this.dz = WORLD_H / h;
    this.orig = new Float32Array(w * h);
    for (let k = 0; k < w * h; k++) this.orig[k] = Math.max(0, raw[k]) * EXAG;
    this.y = Float32Array.from(this.orig);
  }
  // 격자 좌표: 정점 i는 x = -W/2 + (i + 0.5) dx
  vx(i) { return -WORLD_W / 2 + (i + 0.5) * this.dx; }
  vz(j) { return -WORLD_H / 2 + (j + 0.5) * this.dz; }
  // 메시 삼각형과 똑같이 보간한다(a,c,b / b,c,d 분할)
  heightAt(x, z, arr = this.y) {
    const { w, h } = this;
    let fi = (x + WORLD_W / 2) / this.dx - 0.5, fj = (z + WORLD_H / 2) / this.dz - 0.5;
    fi = Math.min(w - 1.0001, Math.max(0, fi)); fj = Math.min(h - 1.0001, Math.max(0, fj));
    const i = Math.floor(fi), j = Math.floor(fj), fx = fi - i, fz = fj - j;
    const a = arr[j * w + i], b = arr[j * w + i + 1], c = arr[(j + 1) * w + i], d = arr[(j + 1) * w + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  origAt(x, z) { return this.heightAt(x, z, this.orig); }
  slopeAt(x, z) {
    const e = this.dx;
    const gx = (this.origAt(x + e, z) - this.origAt(x - e, z)) / (2 * e);
    const gz = (this.origAt(x, z + e) - this.origAt(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }
  // 유적 부지를 평평하게 다듬는다. core 안은 h0, 그 바깥 blend 거리 동안 원래 지형으로 이어진다.
  flatten(cx, cz, core, blend, h0) {
    const { w, h } = this;
    const r = core + blend;
    const i0 = Math.max(0, Math.floor((cx - r + WORLD_W / 2) / this.dx)), i1 = Math.min(w - 1, Math.ceil((cx + r + WORLD_W / 2) / this.dx));
    const j0 = Math.max(0, Math.floor((cz - r + WORLD_H / 2) / this.dz)), j1 = Math.min(h - 1, Math.ceil((cz + r + WORLD_H / 2) / this.dz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(this.vx(i) - cx, this.vz(j) - cz);
      if (d > r) continue;
      const t = sstep(core, r, d);
      const k = j * w + i;
      this.y[k] = h0 + (this.y[k] - h0) * t;
    }
  }
}
