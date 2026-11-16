// 카드 그림: 랜드마크 모형을 작은 화면에 그려 이미지로 만든다
import * as THREE from 'three';
import { buildLandmark } from './models.js';

const cache = new Map();
let r = null, scene = null, cam = null, failed = false;

function setup() {
  r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(200, 200);
  r.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#f4fbff', '#f1d3b5', 1.6));
  const d = new THREE.DirectionalLight('#fff4e2', 2.2);
  d.position.set(-6, 12, 8);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  cam.position.set(10.5, 9, 13.5);
  cam.lookAt(0, 3.0, 0);
}

export function thumb(type) {
  if (cache.has(type)) return cache.get(type);
  if (failed) return '';
  try {
    if (!r) setup();
    const g = buildLandmark(type);
    g.rotation.y = -0.35;
    scene.add(g);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(g);
    cache.set(type, url);
    return url;
  } catch (e) {
    failed = true;
    return '';
  }
}
