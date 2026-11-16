# 북녘 탐험대 (North Quest)

3D 지도로 한반도 북쪽(조선민주주의인민공화국)의 역사 유적과 지형지물을 배우는 중·고등학생용 웹 게임입니다. 같은 데이터로 디자인이 다른 세 버전을 만들었습니다.

- `index.html` 버전 선택 화면
- `v1/` 하늘길 탐험대: 비행 탐험
- `v2/` 미니어처 디오라마: 보드게임형 탐험
- `v3/` 시간 여행 관제실: 시대 다이얼 탐험

각 버전에는 탐험 모드, 위치 맞히기 모드, 도감, 난이도(기초·보통·도전)가 있습니다.

## 데이터
- `shared/data/content.json` 장소 43곳, 장소 문제 215개, 종합 문제 36개
- `shared/data/colormap.jpg`, `height_*.i16`, `mask.png`, `geo.json` 지형 자산
- `shared/geo.js` 경위도↔월드 좌표 변환, 높이 읽기

## 다시 만들기
1. 고도 타일(AWS Terrain Tiles, Terrarium z8 x215–221 y93–99)과 Natural Earth 10m GeoJSON을 `raw/`에 내려받습니다.
2. `python3 -I tools/build_terrain.py <raw> shared/data`
3. 장소 사실은 `tools/brief_sites.json`(Claude 작성)을 고칩니다. 설명글·문제는 `tools/writer_prompt*.md`로 GPT 솔이 집필해 `tools/out/out_*.json`에 저장합니다.
4. `python3 tools/assemble_content.py` 로 `content.json`을 만듭니다. 검증 보고서는 `tools/review/`.

## 출처
- 고도: Mapzen/Tilezen Terrain Tiles on AWS Open Data
- 경계·하천·호수: Natural Earth 1:10m (퍼블릭 도메인)
- 장소 좌표: 위키백과 좌표 대조, 일부 근사(content.json의 `approx`)
- 지명 표기: 북한 현행 행정구역 표기
