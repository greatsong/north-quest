// 화면 UI: 알림, 자막, 카드, 문제, 답사 수첩, 결과, 효과
import { sfx } from './audio.js';
import { store } from './store.js';

export const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

export function toast(msg, ms = 2400) {
  const d = document.createElement('div'); d.textContent = msg;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), ms);
}
export function banner(text, ms = 1400) {
  const b = $('#banner'); b.innerHTML = `<div>${esc(text)}</div>`;
  clearTimeout(banner._t); banner._t = setTimeout(() => { b.innerHTML = ''; }, ms);
}
export function caption(title, text, skip) {
  const c = $('#caption');
  if (!title && !text) { c.innerHTML = ''; return; }
  c.innerHTML = (title ? `<div class="cap-title">${esc(title)}</div>` : '') + (text ? `<div class="cap-text">${esc(text)}</div>` : '') + (skip ? '<div><button class="ghost cap-skip" id="cap-skip">건너뛰기 ▶▶</button></div>' : '');
  if (skip) $('#cap-skip').onclick = skip;
}
export function obsPop(kind, name, text, ms = 7000) {
  const p = $('#obs-pop');
  p.innerHTML = `<div class="op"><div class="op-k">${esc(kind)}</div><div class="op-n">${esc(name)}</div><div class="op-t">${esc(text)}</div></div>`;
  clearTimeout(obsPop._t); obsPop._t = setTimeout(() => { p.innerHTML = ''; }, ms);
  p.onclick = () => { p.innerHTML = ''; };
}
export function shake() { const b = document.body; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
export function confetti(n = 70) {
  const fx = $('#fx'); const cols = ['#ffc247', '#4fd1a5', '#e0402f', '#59b8ff', '#fff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div'); c.className = 'conf';
    c.style.background = cols[i % cols.length];
    const x0 = 50 + (Math.random() - 0.5) * 20, dx = (Math.random() - 0.5) * 90, dy = 60 + Math.random() * 50, rot = Math.random() * 720;
    c.style.left = x0 + 'vw'; c.style.top = '40vh';
    fx.appendChild(c);
    c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}vw, ${-30 + Math.random() * -20}vh) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx * 1.2}vw, ${dy}vh) rotate(${rot}deg)`, opacity: 0 }], { duration: 1600 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => c.remove();
  }
}
export function popScore(n, x = innerWidth / 2, y = innerHeight * 0.45) {
  const d = document.createElement('div'); d.className = 'pop-score'; d.textContent = (n > 0 ? '+' : '') + n;
  d.style.left = x + 'px'; d.style.top = y + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1000);
}
export function stampHTML(name) { return `<div class="stamp">${esc(shortName(name))}</div>`; }
export function shortName(n) { return n.replace('와 개성 첨성대', '').replace('고려의 도읍 ', ''); }
export function bigStamp(name) {
  const d = document.createElement('div'); d.className = 'stamp-big'; d.innerHTML = stampHTML(name);
  document.body.appendChild(d);
  setTimeout(() => { shake(); sfx.stamp(); }, 260);
  setTimeout(() => d.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }], { duration: 400 }).onfinish = () => d.remove(), 1700);
}

// ---------- 모달 ----------
export function openModal(html, onClose) {
  const m = $('#modal'); m.innerHTML = html; m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m && onClose) onClose(); };
  return m;
}
export function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }
export const modalOpen = () => !$('#modal').classList.contains('hidden');

const ERA_COL = { 고려: '#ffc247', 조선: '#59b8ff', '고려·조선': '#ffc247', 현대: '#c39bff', '자연·고려': '#4fd1a5', '자연·조선': '#4fd1a5' };

// 장소 카드. photo: {src, caption, author, license, license_url, source} 또는 null. thumb: 3D 렌더 dataURL
export function siteCard(site, { photo, thumb, obsTotal = 0, obsFound = 0, quizBest = null, canQuiz = false, buttons = [] }) {
  const rar = ERA_COL[site.era] || '#ffc247';
  const stars = '★'.repeat(site.fame || 1) + '☆'.repeat(3 - (site.fame || 1));
  let media;
  if (photo) {
    media = `<div class="c-photo"><img src="${esc(photo.src)}" alt="${esc(photo.caption || site.name)}" loading="lazy"></div>
      <div class="c-credit">사진: ${esc(photo.caption || '')} · ${esc(photo.author || '작가 미상')} · ${photo.license_url ? `<a href="${esc(photo.license_url)}" target="_blank" rel="noopener">${esc(photo.license || '라이선스')}</a>` : esc(photo.license || '')}${photo.source ? ` · <a href="${esc(photo.source)}" target="_blank" rel="noopener">출처</a>` : ''}</div>`;
  } else {
    media = `<div class="c-photo">${thumb ? `<img src="${thumb}" alt="${esc(site.name)} 3D 모형">` : ''}<span class="tag3d">3D 모형 화면</span></div>`;
  }
  const stamped = store.hasStamp(site.id);
  return `<div class="card" style="--rar:${rar}">
    <button class="x" data-act="close" aria-label="닫기">✕</button>
    ${stamped ? `<div class="stamp-mini">${stampHTML(site.name)}</div>` : ''}
    ${media}
    <div class="c-head"><div><h2>${esc(site.name)}</h2>
      <div class="c-meta"><span class="era">${esc(site.era)}</span><span>${esc(site.region)}</span><span>${site.type === 'nature' ? '자연' : '역사'}</span>${site.approx ? '<span>위치는 근삿값</span>' : ''}</div></div>
      <div class="c-stars" title="유명한 정도">${stars}</div></div>
    <div class="c-body">
      <div class="c-sum">${esc(site.summary)}</div>
      <details><summary>이야기 더 보기</summary><div>${esc(site.story)}</div></details>
      ${site.unify ? `<div class="c-unify">${esc(site.unify)}</div>` : ''}
      <div class="c-prog">
        ${obsTotal ? `<span>관찰 ${obsFound}/${obsTotal}</span>` : ''}
        <span>${stamped ? '도장 받음' : '도장 없음'}</span>
        ${quizBest !== null ? `<span>문제 최고 ${quizBest}점</span>` : ''}
      </div>
    </div>
    <div class="c-btns">${buttons.map((b) => `<button class="btn2 ${b.cls || ''}" data-act="${b.act}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}</div>
  </div>`;
}

// ---------- 문제 ----------
// qs: [{q, choices, answer, explain, level}], opt: {title, timer(초|0), hints, onDone(result)}
export function runQuiz(qs, opt) {
  return new Promise((resolve) => {
    let i = 0, correct = 0, score = 0, combo = 0, hints = opt.hints || 0, timer = null, left = 0;
    const log = [];
    const shuffle = (q) => {
      const idx = q.choices.map((_, k) => k).sort(() => Math.random() - 0.5);
      return { ...q, choices: idx.map((k) => q.choices[k]), answer: idx.indexOf(q.answer) };
    };
    const list = qs.map(shuffle);
    const show = () => {
      const q = list[i];
      openModal(`<div class="quiz">
        <div class="qz-top"><span>${esc(opt.title)}</span><span class="lv">${['', '기초', '보통', '도전'][q.level] || ''}</span><span>${i + 1} / ${list.length}</span><span class="spacer" style="flex:1"></span><span class="combo">${combo > 1 ? combo + '연속 정답' : ''}</span><span>점수 ${score}</span></div>
        ${opt.timer ? '<div class="timer"><i id="qt" style="width:100%"></i></div>' : '<div style="height:10px"></div>'}
        <h3>${esc(q.q)}</h3>
        <div class="ch">${q.choices.map((c, k) => `<button data-k="${k}"><i>${k + 1}</i><span>${esc(c)}</span></button>`).join('')}</div>
        <div id="qx"></div>
        <div class="qz-btns">${hints > 0 ? `<button class="btn2 alt" id="qh">힌트: 오답 2개 지우기 (${hints})</button>` : ''}</div>
      </div>`);
      const btns = [...document.querySelectorAll('.quiz .ch button')];
      const answer = (k) => {
        if (timer) { clearInterval(timer); timer = null; }
        btns.forEach((b) => (b.disabled = true));
        const ok = k === q.answer;
        if (k >= 0) btns[k].classList.add(ok ? 'ok' : 'no');
        btns[q.answer].classList.add('ok');
        let gain = 0;
        if (ok) {
          correct++; combo++;
          gain = 100 + q.level * 50 + (opt.timer ? Math.round(left) * 5 : 0);
          if (combo > 1) gain = Math.round(gain * (1 + Math.min(0.5, (combo - 1) * 0.1)));
          score += gain; sfx.correct(); popScore(gain); if (combo >= 3) confetti(30);
        } else { combo = 0; sfx.wrong(); shake(); }
        log.push({ q, ok, k });
        $('#qx').innerHTML = `<div class="ex"><b style="color:${ok ? 'var(--jade)' : '#ff8a7a'}">${ok ? '정답입니다' : k < 0 ? '시간이 끝났습니다' : '아쉽습니다'}</b><br>${esc(q.explain)}</div>`;
        document.querySelector('.qz-btns').innerHTML = `<button class="btn2" id="qn">${i + 1 < list.length ? '다음 문제' : '결과 보기'}</button>`;
        $('#qn').onclick = () => { sfx.click(); i++; if (i < list.length) show(); else finish(); };
      };
      btns.forEach((b) => (b.onclick = () => answer(+b.dataset.k)));
      const hb = $('#qh');
      if (hb) hb.onclick = () => {
        hints--; sfx.click();
        const wrong = q.choices.map((_, k) => k).filter((k) => k !== q.answer).sort(() => Math.random() - 0.5).slice(0, 2);
        wrong.forEach((k) => { btns[k].classList.add('gone'); btns[k].disabled = true; });
        hb.remove();
      };
      if (opt.timer) {
        left = opt.timer; const t0 = performance.now();
        timer = setInterval(() => {
          left = opt.timer - (performance.now() - t0) / 1000;
          const el = $('#qt'); if (el) el.style.width = Math.max(0, (left / opt.timer) * 100) + '%';
          if (left <= 3 && Math.floor(left * 4) % 4 === 0) sfx.tick();
          if (left <= 0) answer(-1);
        }, 100);
      }
    };
    const finish = () => { resolve({ correct, total: list.length, score, log }); };
    show();
  });
}

export function resultScreen({ heading, grade, score, correct, total, title, record, buttons }) {
  openModal(`<div class="result">
    <div class="r-title">${esc(heading)}</div>
    <div class="grade">${esc(grade)}</div>
    <div class="r-score">${score}점</div>
    <div>${correct} / ${total} 정답</div>
    ${title ? `<div class="r-name">칭호: ${esc(title)}</div>` : ''}
    ${record ? `<div class="r-rec">${esc(record)}</div>` : ''}
    <div class="r-row">${buttons.map((b) => `<button class="btn2 ${b.cls || ''}" data-act="${b.act}">${esc(b.label)}</button>`).join('')}</div>
  </div>`);
  confetti(grade === 'S' || grade === 'A' ? 120 : 40);
  sfx.fanfare();
}

export function titleFor(stamps, examPct) {
  if (stamps >= 14 && examPct !== null && examPct >= 80) return '개경 답사왕';
  if (stamps >= 10) return '고려 도읍 탐사대장';
  if (stamps >= 6) return '송악 길잡이';
  if (stamps >= 3) return '개경 답사생';
  return '개경 새내기';
}
export function gradeFor(pct) { return pct >= 95 ? 'S' : pct >= 80 ? 'A' : pct >= 60 ? 'B' : 'C'; }
