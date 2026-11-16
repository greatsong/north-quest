"""실제 고도(AWS Terrarium 타일)와 Natural Earth 경계로 게임용 지형 자산을 만든다.

사용: python3 -I tools/build_terrain.py <raw 폴더> <출력 폴더>
raw 폴더 구조: tiles/8_{x}_{y}.png, ne/*.geojson

출력
- heightmap.png : 16비트 그레이스케일, 0 = -200m, 65535 = 3000m (선형)
- colormap.jpg  : 고도 색 + 음영 + 강 + 국경 + 도 경계가 구워진 색 지도
- mask.png      : R=북한 영토(255), G=바다(255), B=강(255)
- geo.json      : 범위·해상도·도 경계 선·국경 선·강 선(경위도)
"""
import json, math, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import shape, box, mapping, LineString, MultiLineString
from shapely.ops import unary_union

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

Z = 8
X0, X1, Y0, Y1 = 215, 221, 93, 99
LON0, LON1, LAT0, LAT1 = 123.6, 131.0, 37.4, 43.1   # 잘라 낼 범위(남서~북동)
W = 1536                                            # 출력 가로 픽셀

def lon2x(lon): return (lon + 180) / 360 * 2 ** Z * 256
def lat2y(lat):
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z * 256

# 1) 타일 모자이크 (메르카토르 픽셀)
mos = np.zeros(((Y1 - Y0 + 1) * 256, (X1 - X0 + 1) * 256), dtype=np.float32)
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        im = np.asarray(Image.open(f"{RAW}/tiles/{Z}_{x}_{y}.png").convert("RGB")).astype(np.float32)
        h = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
        mos[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = h

# 2) 등간격 경위도 격자로 재표본 (게임 좌표는 경위도 선형, 위도 보정은 축척으로)
H = int(round(W * (LAT1 - LAT0) / (LON1 - LON0) / math.cos(math.radians((LAT0 + LAT1) / 2))))
lons = LON0 + (np.arange(W) + 0.5) / W * (LON1 - LON0)
lats = LAT1 - (np.arange(H) + 0.5) / H * (LAT1 - LAT0)
px = np.array([lon2x(v) for v in lons]) - X0 * 256
py = np.array([lat2y(v) for v in lats]) - Y0 * 256
PX, PY = np.meshgrid(px, py)
x0 = np.floor(PX).astype(int); y0 = np.floor(PY).astype(int)
fx = PX - x0; fy = PY - y0
def g(yy, xx): return mos[np.clip(yy, 0, mos.shape[0] - 1), np.clip(xx, 0, mos.shape[1] - 1)]
elev = (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
        + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)
print("grid", W, H, "elev", elev.min(), elev.max())

def to_px(lon, lat):
    return ((lon - LON0) / (LON1 - LON0) * W, (LAT1 - lat) / (LAT1 - LAT0) * H)

# 3) 벡터 데이터
bb = box(LON0 - 0.5, LAT0 - 0.5, LON1 + 0.5, LAT1 + 0.5)
countries = json.load(open(f"{RAW}/ne/ne_10m_admin_0_countries.geojson"))
prk = None; others = []
for f in countries["features"]:
    gg = shape(f["geometry"])
    if f["properties"]["ADM0_A3"] == "PRK": prk = gg
    elif gg.intersects(bb): others.append((f["properties"]["ADM0_A3"], gg.intersection(bb)))
adm1 = [f for f in json.load(open(f"{RAW}/ne/ne_10m_admin_1_states_provinces.geojson"))["features"]
        if f["properties"].get("adm0_a3") == "PRK"]
rivers = [f for f in json.load(open(f"{RAW}/ne/ne_10m_rivers_lake_centerlines.geojson"))["features"]
          if shape(f["geometry"]).intersects(bb) and f["properties"]["name"] in ("Yalu", "Tumen")]
lakes = [f for f in json.load(open(f"{RAW}/ne/ne_10m_lakes.geojson"))["features"]
         if shape(f["geometry"]).intersects(bb)]

def polys(gm):
    return [gm] if gm.geom_type == "Polygon" else list(gm.geoms) if hasattr(gm, "geoms") else []

def lines(gm):
    if gm.is_empty: return []
    if gm.geom_type == "LineString": return [gm]
    if gm.geom_type == "MultiLineString": return list(gm.geoms)
    if gm.geom_type in ("Polygon", "MultiPolygon"):
        out = []
        for p in polys(gm):
            out.append(LineString(p.exterior.coords))
        return out
    if hasattr(gm, "geoms"):
        out = []
        for gg in gm.geoms: out += lines(gg)
        return out
    return []

# 4) 마스크 (북한 영토 / 바다)
SS = 2  # 슈퍼샘플
def raster(geoms, ss=SS):
    im = Image.new("L", (W * ss, H * ss), 0); d = ImageDraw.Draw(im)
    for gm in geoms:
        for p in polys(gm):
            d.polygon([(a * ss, b * ss) for a, b in (to_px(*c) for c in p.exterior.coords)], fill=255)
            for hole in p.interiors:
                d.polygon([(a * ss, b * ss) for a, b in (to_px(*c) for c in hole.coords)], fill=0)
    return np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
prk_mask = raster([prk])
land_mask = raster([prk] + [g for _, g in others])
sea = (land_mask < 0.5) & (elev < 5)
elev_g = elev.copy()
elev_g[sea] = np.minimum(elev_g[sea], -2)          # 바다는 0 아래로
elev_g[(~sea) & (elev_g < 1)] = 1                   # 땅은 바다 위로

# 5) 강: Natural Earth 압록·두만 + 고도에서 계산한 흐름 누적(대동강·청천강 등)
def flow_accum(z):
    h, w = z.shape
    zz = z.copy()
    # 웅덩이를 얕게 메워 흐름이 끊기지 않게(반복 평활)
    order = np.argsort(-zz, axis=None)
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    best = np.full(z.shape, -1, dtype=np.int64); bestdrop = np.zeros(z.shape)
    pad = np.pad(zz, 1, mode="edge")
    for k, (dy, dx) in enumerate(nb):
        nbz = pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
        drop = (zz - nbz) / math.hypot(dy, dx)
        m = drop > bestdrop
        bestdrop[m] = drop[m]; best[m] = k
    acc = np.ones(h * w)
    bflat = best.ravel()
    dys = np.array([d[0] for d in nb]); dxs = np.array([d[1] for d in nb])
    for idx in order:
        k = bflat[idx]
        if k < 0: continue
        r, c = divmod(idx, w)
        r2, c2 = r + dys[k], c + dxs[k]
        if 0 <= r2 < h and 0 <= c2 < w:
            acc[r2 * w + c2] += acc[idx]
    return acc.reshape(h, w)

# 흐름 계산은 절반 해상도에서(속도), 평활한 고도 사용
small = np.asarray(Image.fromarray(elev_g).resize((W // 2, H // 2), Image.BILINEAR))
def blur(a, n=2):
    for _ in range(n):
        p = np.pad(a, 1, mode="edge")
        a = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 2 * p[1:-1, 1:-1]) / 6
    return a
small = blur(small.astype(np.float64), 2)

def priority_flood(z, sea_m):
    """웅덩이를 메워 모든 칸이 바다나 가장자리로 흘러가게 한다(아주 작은 기울기 추가)."""
    import heapq
    h, w = z.shape
    out = z.copy(); done = np.zeros(z.shape, bool); pq = []
    for r in range(h):
        for c in range(w):
            if r in (0, h - 1) or c in (0, w - 1) or sea_m[r, c]:
                heapq.heappush(pq, (out[r, c], r, c)); done[r, c] = True
    while pq:
        v, r, c = heapq.heappop(pq)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                r2, c2 = r + dy, c + dx
                if 0 <= r2 < h and 0 <= c2 < w and not done[r2, c2]:
                    done[r2, c2] = True
                    if out[r2, c2] <= v: out[r2, c2] = v + 1e-3
                    heapq.heappush(pq, (out[r2, c2], r2, c2))
    return out
sea_small = small < 0
small = priority_flood(small, sea_small)
acc = flow_accum(small)
acc_big = np.asarray(Image.fromarray(acc.astype(np.float32)).resize((W, H), Image.BILINEAR))
lg = np.log10(acc_big + 1)
lgp = np.pad(lg, 1, mode="edge")
lg_w = np.maximum.reduce([lgp[1+dy:1+dy+lg.shape[0], 1+dx:1+dx+lg.shape[1]] - (0.35 if dy or dx else 0) for dy in (-1,0,1) for dx in (-1,0,1)])
river_strength = np.clip((np.where(lg > 4.0, lg_w, lg) - 3.1) / 0.6, 0, 1) * 0.95
land_small = np.asarray(Image.fromarray((land_mask * 255).astype(np.uint8)).resize((W, H)))
river_strength[(land_mask < 0.5)] = 0

# 6) 색 지도
def ramp(z):
    stops = [(-3000, (18, 44, 82)), (-200, (30, 76, 128)), (-20, (52, 112, 166)), (0, (78, 140, 186)),
             (1, (88, 140, 84)), (150, (122, 160, 92)), (400, (170, 178, 112)), (800, (186, 160, 108)),
             (1300, (160, 124, 90)), (1900, (140, 120, 112)), (2400, (210, 206, 202)), (3000, (250, 250, 250))]
    out = np.zeros(z.shape + (3,), np.float32)
    zs = [s[0] for s in stops]; cs = np.array([s[1] for s in stops], np.float32)
    for i in range(3):
        out[..., i] = np.interp(z, zs, cs[:, i])
    return out
col = ramp(elev_g)
# 음영(북서 광원)
gy, gx = np.gradient(elev_g, 1.0)
cell = (LON1 - LON0) / W * 111000 * math.cos(math.radians(40))
nx, ny = -gx / cell * 2.2, gy / cell * 2.2
nz = np.ones_like(nx)
nrm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
L = np.array([-0.6, 0.6, 0.55]); L /= np.linalg.norm(L)
shade = (nx * L[0] + ny * L[1] + nz * L[2]) / nrm
shade = np.clip(shade, 0, 1)
shade_land = 0.55 + 0.6 * shade
col[~sea] *= shade_land[~sea][:, None]
# 이웃 나라는 채도·밝기를 낮춤
nb_mask = (land_mask - prk_mask).clip(0, 1)
grey = col.mean(axis=2, keepdims=True)
col = col * (1 - 0.55 * nb_mask[..., None]) + grey * 0.55 * nb_mask[..., None] * 0.9
# 강
rc = np.array([70, 140, 205], np.float32)
col = col * (1 - 0.85 * river_strength[..., None]) + rc * 0.85 * river_strength[..., None]
col = np.clip(col, 0, 255)

img = Image.fromarray(col.astype(np.uint8)).resize((W * SS, H * SS), Image.BICUBIC)
d = ImageDraw.Draw(img, "RGBA")
def draw_line(ls, fill, width):
    pts = [(a * SS, b * SS) for a, b in (to_px(*c[:2]) for c in ls.coords)]
    if len(pts) > 1: d.line(pts, fill=fill, width=width, joint="curve")
for f in rivers:
    for ls in lines(shape(f["geometry"])): draw_line(ls, (70, 140, 205, 255), 5)
for f in lakes:
    for p in polys(shape(f["geometry"])):
        d.polygon([(a * SS, b * SS) for a, b in (to_px(*c) for c in p.exterior.coords)], fill=(70, 140, 205, 255))
# 도 경계(점선 느낌의 얇은 선)
adm_lines = []
for f in adm1:
    for p in polys(shape(f["geometry"])):
        ls = LineString(p.exterior.coords)
        adm_lines.append(ls)
        draw_line(ls, (255, 255, 255, 70), 2)
# 국경(북한 외곽 육상 경계) — 해안선은 제외
prk_outline = unary_union(lines(prk))
land_others = unary_union([g for _, g in others]).buffer(0.01)
border = prk_outline.intersection(land_others)
for ls in lines(border): draw_line(ls, (255, 214, 90, 230), 5)
img = img.resize((W, H), Image.LANCZOS)
img.save(f"{OUT}/colormap.jpg", quality=90)

# 7) 높이 지도(16비트)
hm = np.clip((elev_g + 200) / 3200 * 65535, 0, 65535).astype(np.uint16)
Image.fromarray(hm).save(f"{OUT}/heightmap.png")
# 작은 높이 지도(모바일·충돌용)
hm_small = np.asarray(Image.fromarray(elev_g).resize((W // 2, H // 2), Image.BILINEAR))
Image.fromarray(np.clip((hm_small + 200) / 3200 * 65535, 0, 65535).astype(np.uint16)).save(f"{OUT}/heightmap_half.png")

mask = np.zeros((H, W, 3), np.uint8)
mask[..., 0] = (prk_mask * 255).astype(np.uint8)
mask[..., 1] = (sea * 255).astype(np.uint8)
mask[..., 2] = (river_strength * 255).astype(np.uint8)
Image.fromarray(mask).save(f"{OUT}/mask.png")

def coords_list(ls, tol=0.01):
    s = ls.simplify(tol)
    return [[round(c[0], 4), round(c[1], 4)] for c in s.coords]
provinces = []
for f in adm1:
    gm = shape(f["geometry"])
    c = gm.representative_point()
    provinces.append({
        "name_dprk": f["properties"]["name_ko"],
        "name_en": f["properties"]["name"],
        "label_lon": round(c.x, 3), "label_lat": round(c.y, 3),
        "rings": [coords_list(LineString(p.exterior.coords)) for p in polys(gm) if p.area > 0.002],
    })
geo = {
    "bounds": {"lon0": LON0, "lon1": LON1, "lat0": LAT0, "lat1": LAT1},
    "size": {"w": W, "h": H},
    "height_encoding": "uint16 v -> v/65535*3200-200 metres",
    "provinces": provinces,
    "border_lines": [coords_list(ls, 0.005) for ls in lines(border)],
    "coast_lines": [coords_list(LineString(p.exterior.coords), 0.005) for p in polys(prk) if p.area > 0.001],
    "sources": [
        "Elevation: Mapzen/Tilezen Terrain Tiles on AWS Open Data (Terrarium, zoom 8)",
        "Boundaries, provinces, Yalu/Tumen: Natural Earth 1:10m (public domain)",
        "Inner rivers: flow accumulation computed from the elevation data",
    ],
}
json.dump(geo, open(f"{OUT}/geo.json", "w"), ensure_ascii=False)
print("done", W, H)

# 8) 브라우저용 높이 바이너리(int16 little-endian, 미터). 브라우저 PNG 디코딩은 8비트로 줄어 계단이 생긴다.
for div in (2, 4):
    hw, hh = W // div, H // div
    hs = np.asarray(Image.fromarray(elev_g.astype(np.float32)).resize((hw, hh), Image.BILINEAR))
    np.clip(np.round(hs), -32768, 32767).astype("<i2").tofile(f"{OUT}/height_{hw}x{hh}.i16")
    print("bin", hw, hh)
for fn in ("heightmap.png", "heightmap_half.png"):
    p = f"{OUT}/{fn}"
    if os.path.exists(p): os.remove(p)
