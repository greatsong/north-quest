"""개성 특별편 지형 자산: AWS Terrarium z13(약 19m) → 등간격 경위도 격자.

사용: python3 -I tools/build_kaesong.py <ktiles 폴더> <출력 폴더(shared/kaesong)>
출력: height_1024x{H}.i16 (int16 LE, m, 북→남), height_512x{H/2}.i16, colormap.jpg(2048 폭), meta.json
"""
import json, math, sys, os
import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
Z = 13
LON0, LON1, LAT0, LAT1 = 126.40, 126.72, 37.90, 38.10
W = 1024
H = int(round(W * (LAT1 - LAT0) / (LON1 - LON0) / math.cos(math.radians((LAT0 + LAT1) / 2))))

def lon2x(lon): return (lon + 180) / 360 * 2 ** Z * 256
def lat2y(lat):
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z * 256
X0, X1 = int(lon2x(LON0) // 256), int(lon2x(LON1) // 256)
Y0, Y1 = int(lat2y(LAT1) // 256), int(lat2y(LAT0) // 256)
mos = np.zeros(((Y1 - Y0 + 1) * 256, (X1 - X0 + 1) * 256), np.float32)
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        im = np.asarray(Image.open(f"{SRC}/{Z}_{x}_{y}.png").convert("RGB")).astype(np.float32)
        mos[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768

def resample(w, h):
    lons = LON0 + (np.arange(w) + 0.5) / w * (LON1 - LON0)
    lats = LAT1 - (np.arange(h) + 0.5) / h * (LAT1 - LAT0)
    px = np.array([lon2x(v) for v in lons]) - X0 * 256
    py = np.array([lat2y(v) for v in lats]) - Y0 * 256
    PX, PY = np.meshgrid(px, py)
    x0 = np.floor(PX).astype(int); y0 = np.floor(PY).astype(int); fx = PX - x0; fy = PY - y0
    g = lambda yy, xx: mos[np.clip(yy, 0, mos.shape[0] - 1), np.clip(xx, 0, mos.shape[1] - 1)]
    return (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy) + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)

elev = resample(W, H)
print("grid", W, H, "elev", round(float(elev.min()), 1), round(float(elev.max()), 1))
for w, h in ((W, H), (W // 2, H // 2)):
    e = elev if w == W else resample(w, h)
    np.clip(np.round(e), -32768, 32767).astype("<i2").tofile(f"{OUT}/height_{w}x{h}.i16")

# 색 지도(2048 폭): 고도 + 경사 기반 식생 + 음영 + 물길
CW = 2048; CH = int(round(CW * H / W))
e = resample(CW, CH)
cell = (LON1 - LON0) / CW * 111320 * math.cos(math.radians(38))
gy, gx = np.gradient(e, cell)
slope = np.sqrt(gx ** 2 + gy ** 2)
nx, ny, nz = -gx, gy, np.ones_like(gx)
n = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
L = np.array([-0.55, 0.6, 0.58]); L /= np.linalg.norm(L)
shade = np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / n, 0, 1)
field = np.array([176, 178, 120], np.float32)    # 평지(논·밭)
grass = np.array([128, 156, 92], np.float32)     # 완경사
forest = np.array([62, 104, 60], np.float32)     # 산림
rock = np.array([138, 128, 112], np.float32)
t_fl = np.clip((slope - 0.03) / 0.08, 0, 1)[..., None]
t_fo = np.clip((slope - 0.12) / 0.15, 0, 1)[..., None]
t_hi = np.clip((e - 350) / 200, 0, 1)[..., None] * np.clip((slope - 0.35) / 0.3, 0, 1)[..., None]
col = field * (1 - t_fl) + grass * t_fl
col = col * (1 - t_fo) + forest * t_fo
col = col * (1 - t_hi) + rock * t_hi
# 약간의 얼룩(밭 경계 느낌)
rng = np.random.default_rng(7)
noise = np.asarray(Image.fromarray((rng.random((CH // 16, CW // 16)) * 255).astype(np.uint8)).resize((CW, CH), Image.BICUBIC)).astype(np.float32) / 255
col *= (0.92 + 0.16 * noise)[..., None] * (1 - 0.0 * t_fo)
col *= (0.5 + 0.7 * shade)[..., None]
# 물길(흐름 누적, 절반 해상도)
def flow(z):
    import heapq
    h, w = z.shape; out = z.copy(); done = np.zeros(z.shape, bool); pq = []
    for r in range(h):
        for c in (0, w - 1): heapq.heappush(pq, (out[r, c], r, c)); done[r, c] = True
    for c in range(w):
        for r in (0, h - 1):
            if not done[r, c]: heapq.heappush(pq, (out[r, c], r, c)); done[r, c] = True
    while pq:
        v, r, c = heapq.heappop(pq)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                r2, c2 = r + dy, c + dx
                if 0 <= r2 < h and 0 <= c2 < w and not done[r2, c2]:
                    done[r2, c2] = True
                    if out[r2, c2] <= v: out[r2, c2] = v + 1e-3
                    heapq.heappush(pq, (out[r2, c2], r2, c2))
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    pad = np.pad(out, 1, mode="edge"); best = np.full(z.shape, -1); bd = np.zeros(z.shape)
    for k, (dy, dx) in enumerate(nb):
        d = (out - pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]) / math.hypot(dy, dx); m = d > bd; bd[m] = d[m]; best[m] = k
    acc = np.ones(h * w); bf = best.ravel()
    for idx in np.argsort(-out, axis=None):
        k = bf[idx]
        if k < 0: continue
        r, c = divmod(idx, w); r2, c2 = r + nb[k][0], c + nb[k][1]
        if 0 <= r2 < h and 0 <= c2 < w: acc[r2 * w + c2] += acc[idx]
    return acc.reshape(h, w)
acc = flow(resample(W // 2, H // 2).astype(np.float64))
acc_b = np.asarray(Image.fromarray(acc.astype(np.float32)).resize((CW, CH), Image.BILINEAR))
river = np.clip((np.log10(acc_b + 1) - 3.0) / 0.7, 0, 1) * 0.85
water = np.array([88, 140, 180], np.float32)
col = col * (1 - river[..., None]) + water * river[..., None]
img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))

# 군사분계선(Natural Earth, 개략)
geo = json.load(open(os.path.join(os.path.dirname(__file__), "..", "shared", "data", "geo.json")))
d = ImageDraw.Draw(img, "RGBA")
def px(lon, lat): return ((lon - LON0) / (LON1 - LON0) * CW, (LAT1 - lat) / (LAT1 - LAT0) * CH)
mdl = []
for line in geo["border_lines"]:
    seg = [c for c in line if LON0 - 0.05 < c[0] < LON1 + 0.05 and LAT0 - 0.05 < c[1] < LAT1 + 0.05]
    if len(seg) > 1:
        pass  # Natural Earth 10m 경계는 이 축척에서 실제 군사분계선(판문점 통과)과 크게 어긋나 그리지 않는다
img.save(f"{OUT}/colormap.jpg", quality=88)

# 송악산 꼭대기 찾기: 만월대(37.985,126.5433) 북쪽 4km 안 최고점
lat = LAT1 - (np.arange(H) + 0.5) / H * (LAT1 - LAT0); lon = LON0 + (np.arange(W) + 0.5) / W * (LON1 - LON0)
LA, LO = np.meshgrid(lat, lon, indexing="ij")
m = (LA > 37.985) & (LA < 38.025) & (np.abs(LO - 126.545) < 0.03)
i = np.argmax(np.where(m, elev, -1e9)); r, c = divmod(i, W)
print("songak peak", round(float(lat[r]), 4), round(float(lon[c]), 4), round(float(elev[r, c]), 1), "m")
meta = {"bounds": {"lon0": LON0, "lon1": LON1, "lat0": LAT0, "lat1": LAT1},
        "height": {"w": W, "h": H, "file": f"height_{W}x{H}.i16", "low": f"height_{W // 2}x{H // 2}.i16"},
        "colormap": {"w": CW, "h": CH, "file": "colormap.jpg"},
        "songak_peak": [round(float(lat[r]), 4), round(float(lon[c]), 4), round(float(elev[r, c]), 1)],
        "mdl_note": "군사분계선은 판문점 공동경비구역을 지난다. 정확한 선 자료가 없어 지도에 그리지 않았다.",
        "sources": ["Elevation: Mapzen/Tilezen Terrain Tiles on AWS Open Data (Terrarium, zoom 13, 약 19m)",
                    "물길: 고도 데이터로 계산"]}
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False)
print("done")
