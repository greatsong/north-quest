// 3D 위치를 따라다니는 DOM 라벨
import * as THREE from 'three';

const v = new THREE.Vector3();

export class LabelLayer {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.hidden = new Set();
  }

  add(html, pos, o = {}) {
    const el = document.createElement('div');
    el.className = 'lbl ' + (o.cls || '');
    el.innerHTML = html;
    el.style.opacity = '0';
    this.root.appendChild(el);
    const it = {
      el, pos: pos.clone(), maxDist: o.maxDist ?? 250, minDist: o.minDist ?? 0,
      group: o.group || 'default', visible: true, shownOp: -1, data: o.data,
    };
    this.items.push(it);
    return it;
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    it.el.remove();
  }

  clearGroup(group) {
    for (const it of this.items.filter((x) => x.group === group)) this.remove(it);
  }

  setGroupVisible(group, on) {
    if (on) this.hidden.delete(group); else this.hidden.add(group);
  }

  update(camera, w, h) {
    for (const it of this.items) {
      let op = 0;
      if (it.visible && !this.hidden.has(it.group)) {
        const d = camera.position.distanceTo(it.pos);
        if (d < it.maxDist && d > it.minDist) {
          v.copy(it.pos).project(camera);
          if (v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15) {
            op = Math.min(1, (it.maxDist - d) / (it.maxDist * 0.25));
            if (it.minDist > 0) op = Math.min(op, (d - it.minDist) / (it.minDist * 0.5));
            const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
            it.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
            it.el.style.zIndex = String(1000 - Math.round(d));
          }
        }
      }
      op = Math.max(0, Math.round(op * 20) / 20);
      if (op !== it.shownOp) {
        it.shownOp = op;
        it.el.style.opacity = String(op);
        it.el.style.visibility = op > 0 ? 'visible' : 'hidden';
      }
    }
  }
}
