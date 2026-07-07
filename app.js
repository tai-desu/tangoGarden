/**
 * app.js — 言葉の庭
 * -----------------
 * Every word is a plant. Reviews are watering. Memory strength is
 * growth stage. Tags are 花壇 (garden beds) and can be studied alone.
 * The garden reflects live Tokyo weather (weather.js).
 * Depends on: dict.js, storage.js, jisho.js, srs.js, weather.js, sound.js
 */

const SESSION_NEW_LIMIT = 8;
const GARDEN_MAX_PLANTS = 16;

// ---------------- Navigation ----------------

function goTo(screenId) {
  softTap();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'gardenScreen') renderHome();
  if (screenId === 'addScreen') resetAddScreen();
  if (screenId === 'listScreen') renderWordList();
  if (screenId === 'flashcardScreen' && !session) startStudySession('srs', null, homeBed);
}

document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.go));
});
document.getElementById('goAddBtn').addEventListener('click', () => goTo('addScreen'));
document.getElementById('goListBtn').addEventListener('click', () => goTo('listScreen'));
document.getElementById('soundToggle').addEventListener('click', toggleSound);

// あそぶ: shuffle-play the WHOLE garden, ignoring the selected bed
document.getElementById('goPlayBtn').addEventListener('click', () => {
  if (getAllWords().length === 0) { goTo('addScreen'); return; }
  softTap();
  startStudySession('practice', null, null);
  goTo('flashcardScreen');
});

// ---------------- Small utilities ----------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function parseTags(str) {
  return Array.from(new Set(
    String(str || '').split(/[、,\s]+/).map(t => t.trim()).filter(Boolean)
  )).slice(0, 8);
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

function isThirsty(w) { return w.appearances > 0 && w.nextDue <= todayIso(); }

function wordsInBed(bed) {
  const all = getAllWords();
  return bed ? all.filter(w => (w.tags || []).includes(bed)) : all;
}

function sessionCounts(bed) {
  const words = wordsInBed(bed);
  const due = words.filter(isThirsty).length;
  const fresh = Math.min(words.filter(w => w.appearances === 0).length, SESSION_NEW_LIMIT);
  return { due, fresh, total: due + fresh, all: words.length };
}

// ---------------- Home: the garden ----------------

let homeBed = null;          // null = whole garden
let currentWeather = 'sunny';
let weatherLoaded = false;

const GREETINGS = [
  [0, 'おはようございます'], [11, 'こんにちは'], [18, 'こんばんは']
];

function greetingNow() {
  const h = new Date().getHours();
  let g = GREETINGS[0][1];
  GREETINGS.forEach(([from, text]) => { if (h >= from) g = text; });
  return g;
}

// 15 gentle daily encouragements — one per day, looping
const DAILY_QUOTES = [
  '小さな一歩が、遠くまで連れていってくれます',
  '昨日の自分より、一語だけ前へ',
  '焦らなくていい。芽は静かに育ちます',
  '続けることが、いちばんの才能です',
  '忘れても大丈夫。思い出すたびに根が深くなります',
  '今日の五分が、未来のあなたの言葉になります',
  '雨の日も、庭は育っています',
  '覚えられない日は、種をまく日です',
  'ことばは、育てた分だけ味方になります',
  'ゆっくりでも、止まらなければ庭は茂ります',
  '一輪咲けば、庭はもう庭です',
  '苦手な言葉ほど、咲いたときが嬉しい',
  '毎日でなくても、戻ってくれば続いています',
  '今日のあなたに、ちょうどいい分だけ',
  '水をやった分、必ずどこかで根づいています'
];

function renderHome() {
  const d = new Date();
  document.getElementById('gardenSub').textContent =
    `${d.getMonth() + 1}月${d.getDate()}日 · ${greetingNow()}、タイさん`;

  const dayIndex = Math.floor(d.getTime() / 86400000);
  document.getElementById('gardenQuote').textContent =
    DAILY_QUOTES[dayIndex % DAILY_QUOTES.length];

  renderBedRow();
  renderWaterButton();
  renderStageLegend();
  renderGarden();
  resetPlantInfo();

  // weather stays invisible UI-wise — it just paints the garden
  fetchTokyoWeather().then(kind => {
    weatherLoaded = true;
    if (kind !== currentWeather) {
      currentWeather = kind;
      renderGarden();
    }
  });
}

const WEATHER_ICON_REMOVED = true; // weather badge removed — garden visuals only

function renderBedRow() {
  const row = document.getElementById('bedRow');
  const tags = getAllTags();
  if (tags.length === 0) { row.innerHTML = ''; homeBed = null; return; }
  if (homeBed && !tags.some(t => t.tag === homeBed)) homeBed = null;

  const allC = sessionCounts(null);
  let html = `<button class="bed-chip ${homeBed === null ? 'selected' : ''}" data-bed="">庭ぜんぶ<span class="bed-count">${allC.total}</span></button>`;
  tags.forEach(({ tag }) => {
    const c = sessionCounts(tag);
    html += `<button class="bed-chip ${homeBed === tag ? 'selected' : ''}" data-bed="${escapeAttr(tag)}">${escapeHtml(tag)}<span class="bed-count">${c.total}</span></button>`;
  });
  row.innerHTML = html;

  row.querySelectorAll('.bed-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      softTap();
      homeBed = chip.dataset.bed || null;
      renderHome();
    });
  });
}

function renderWaterButton() {
  const btn = document.getElementById('waterBtn');
  const title = document.getElementById('waterBtnTitle');
  const sub = document.getElementById('waterBtnSub');
  const c = sessionCounts(homeBed);
  const bedName = homeBed ? `「${homeBed}」` : '';

  btn.onclick = null;
  if (c.all === 0 && !homeBed) {
    title.textContent = '種をまく';
    sub.textContent = 'まずは最初の言葉を植えましょう';
    btn.onclick = () => goTo('addScreen');
  } else if (c.total > 0) {
    title.textContent = '水やりをする';
    sub.textContent = `${bedName}今日は ${c.total}語 が水を待っています`;
    btn.onclick = () => {
      softTap();
      startStudySession('srs', null, homeBed);
      goTo('flashcardScreen');
    };
  } else {
    title.textContent = '庭あるきをする';
    sub.textContent = `${bedName}うるおっています — 練習モードで散歩`;
    btn.onclick = () => {
      softTap();
      startStudySession('practice', null, homeBed);
      goTo('flashcardScreen');
    };
  }
}

function renderStageLegend() {
  const words = wordsInBed(homeBed);
  const el = document.getElementById('stageLegend');
  if (words.length === 0) { el.innerHTML = ''; return; }
  const counts = { seed: 0, sprout: 0, bud: 0, bloom: 0, wilt: 0 };
  words.forEach(w => counts[growthStage(w)]++);
  const shown = Math.min(words.length, GARDEN_MAX_PLANTS);
  const extra = words.length > shown ? `<span>· 表示 ${shown}/${words.length}</span>` : '';
  el.innerHTML =
    `<span>種 ${counts.seed}</span><span>芽 ${counts.sprout}</span><span>蕾 ${counts.bud}</span>` +
    `<span>満開 ${counts.bloom}</span><span class="amber">しおれ ${counts.wilt}</span>${extra}`;
}

// ----- garden SVG -----

const GROUND_Y = 176;
let gardenPlantMap = {};

function gardenPickWords() {
  const words = wordsInBed(homeBed).slice();
  if (words.length <= GARDEN_MAX_PLANTS) return words;
  // prioritize what needs attention, then the newest plantings
  const score = w => (growthStage(w) === 'wilt' ? 0 : isThirsty(w) ? 1 : 2);
  words.sort((a, b) => score(a) - score(b) || (a.dateAdded < b.dateAdded ? 1 : -1));
  return words.slice(0, GARDEN_MAX_PLANTS);
}

function renderGarden() {
  const svg = document.getElementById('gardenSvg');
  const words = gardenPickWords();
  gardenPlantMap = {};

  let inner = weatherLayer(currentWeather);

  if (words.length === 0) {
    inner += `
      <g stroke="#1D5C4D" fill="none" stroke-width="1.1" stroke-linecap="round">
        <line x1="164" y1="${GROUND_Y}" x2="164" y2="${GROUND_Y - 18}"/>
        <path d="M164 ${GROUND_Y - 10} Q156 ${GROUND_Y - 14} 154 ${GROUND_Y - 21}"/>
      </g>
      <text x="170" y="${GROUND_Y - 26}" font-size="12" fill="#4E7A66" text-anchor="middle" font-family="Zen Kaku Gothic New">まだ種がありません</text>`;
  } else {
    // ---- group plants into 花壇 zones along the ground ----
    const bedOf = w => (w.tags && w.tags.length) ? w.tags[0] : '';
    const tagOrder = getAllTags().map(t => t.tag);
    const groups = [];
    const byBed = {};
    words.forEach(w => {
      const b = bedOf(w);
      if (!byBed[b]) { byBed[b] = []; groups.push(b); }
      byBed[b].push(w);
    });
    groups.sort((a, b) => {
      const ia = a === '' ? 999 : tagOrder.indexOf(a);
      const ib = b === '' ? 999 : tagOrder.indexOf(b);
      return ia - ib;
    });

    const X0 = 22, X1 = 318, usable = X1 - X0;
    const n = words.length;
    const showZones = !homeBed && groups.length > 1; // zone labels only for the mixed view
    let cursor = X0;

    groups.forEach((bed, gi) => {
      const members = byBed[bed].slice().sort((a, b) => hashStr(a.id) - hashStr(b.id));
      const segW = usable * (members.length / n);
      members.forEach((w, i) => {
        const jitter = (hashStr(w.id) % 9) - 4;
        const x = Math.round(cursor + (segW * (i + 0.5)) / members.length + jitter);
        gardenPlantMap[w.id] = w;
        inner += plantSvg(w, Math.min(X1 - 4, Math.max(X0 + 4, x)));
      });
      if (showZones) {
        const cx = (cursor + segW / 2).toFixed(0);
        const label = bed === '' ? 'その他' : bed;
        inner += `<text x="${cx}" y="${GROUND_Y + 18}" font-size="11" fill="#4E7A66" text-anchor="middle" font-family="Zen Kaku Gothic New">${escapeHtml(label)}</text>`;
        if (gi > 0) {
          inner += `<line x1="${cursor.toFixed(0)}" y1="${GROUND_Y + 4}" x2="${cursor.toFixed(0)}" y2="${GROUND_Y + 14}" stroke="#B7D2C0" stroke-width="1.1" stroke-linecap="round"/>`;
        }
      }
      cursor += segW;
    });
  }

  inner += `<line x1="8" y1="${GROUND_Y}" x2="332" y2="${GROUND_Y}" stroke="#1D5C4D" stroke-width="1.2" stroke-linecap="round"/>`;
  inner += faunaLayer(words.length);

  svg.innerHTML = inner;
}

// individual plant forms (monoline, light 1.1px linework)
// leaf: a defined pointed-oval silhouette, drawn from its stem-attachment point
function leafAt(x, y, angleDeg, len) {
  const w = (len * 0.3).toFixed(1);
  const mx = (len * 0.38).toFixed(1);
  return `<g transform="translate(${x} ${y}) rotate(${angleDeg})"><path d="M0 0 Q${mx} -${w} ${len} 0 Q${mx} ${w} 0 0 Z"/></g>`;
}

function flowerHead(type, x, cy) {
  let out = '';
  if (type === 0) {
    // rosette: ring of outward loops (spirograph guilloche)
    for (let k = 0; k < 9; k++) {
      const a = (Math.PI * 2 * k) / 9 - Math.PI / 2;
      const px = (x + Math.cos(a) * 9.5).toFixed(1);
      const py = (cy + Math.sin(a) * 9.5).toFixed(1);
      const deg = (a * 180 / Math.PI + 90).toFixed(1);
      out += `<ellipse cx="${px}" cy="${py}" rx="4.8" ry="10.5" transform="rotate(${deg} ${px} ${py})"/>`;
    }
  } else if (type === 1) {
    // daisy: small center, petals radiating from it
    out += `<circle cx="${x}" cy="${cy}" r="3.2"/>`;
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8 - Math.PI / 2;
      const px = (x + Math.cos(a) * 8.6).toFixed(1);
      const py = (cy + Math.sin(a) * 8.6).toFixed(1);
      const deg = (a * 180 / Math.PI + 90).toFixed(1);
      out += `<ellipse cx="${px}" cy="${py}" rx="3.4" ry="6.4" transform="rotate(${deg} ${px} ${py})"/>`;
    }
  } else {
    // aster: overlapping pointed petals through the center
    for (let k = 0; k < 6; k++) {
      out += `<ellipse cx="${x}" cy="${cy}" rx="4" ry="13" transform="rotate(${k * 30} ${x} ${cy})"/>`;
    }
  }
  return out;
}

function plantSvg(w, x) {
  const stage = growthStage(w);
  const h = hashStr(w.id + w.word);
  const g = GROUND_Y;
  const swayStyle = plantSway(stage, h);
  let body = '';
  let topY = g;

  if (stage === 'seed') {
    topY = g - 4;
    body = `<circle cx="${x}" cy="${g - 4}" r="2.4" fill="#1D5C4D" stroke="none"/>
            <line x1="${x - 8}" y1="${g + 5}" x2="${x + 8}" y2="${g + 5}" stroke-width="1" stroke-dasharray="2.5 3"/>`;
  } else if (stage === 'sprout') {
    topY = g - 32;
    body = `<line x1="${x}" y1="${g}" x2="${x}" y2="${g - 26}"/>` +
           leafAt(x, g - 22, -138, 11) +
           leafAt(x, g - 15, -42, 9);
  } else if (stage === 'bud') {
    const bTop = g - 58;
    topY = bTop - 2;
    body = `<line x1="${x}" y1="${g}" x2="${x}" y2="${bTop + 14}"/>
            <path d="M${x} ${bTop + 14} Q${x - 4.6} ${bTop + 8} ${x} ${bTop} Q${x + 4.6} ${bTop + 8} ${x} ${bTop + 14} Z"/>` +
           leafAt(x, g - 26, -140, 12) +
           leafAt(x, g - 17, -40, 10);
  } else if (stage === 'bloom') {
    const tall = 74 + (h % 24);
    const cy = g - tall;
    topY = cy - 15;
    const type = h % 3;
    const headGap = type === 2 ? 13 : 14;
    body = `<line x1="${x}" y1="${g}" x2="${x}" y2="${cy + headGap}"/>` +
           leafAt(x, g - 38 - (h % 8), -142, 13) +
           leafAt(x, g - 24 - (h % 6), -38, 11) +
           flowerHead(type, x, cy);
  } else { // wilt — the only amber form
    topY = g - 56;
    const tx = x - 11, ty = g - 52; // drooping tip
    body = `<path d="M${x} ${g} Q${x} ${g - 32} ${x - 4} ${g - 44} Q${tx + 4} ${ty + 6} ${tx} ${ty}"/>` +
           leafAt(tx, ty, 150, 9) +
           leafAt(tx, ty, 195, 9) +
           leafAt(tx, ty, 240, 8) +
           leafAt(x, g - 18, -35, 9) +
           leafAt(x - 20, g - 2, 168, 8); // one fallen petal
  }

  const color = stage === 'wilt' ? '#C08A3E' : '#1D5C4D';
  const drop = (isThirsty(w) && stage !== 'wilt')
    ? `<path d="M${x + 12} ${topY - 2} c0 0 -3.6 4.6 -3.6 7 a3.6 3.6 0 0 0 7.2 0 c0 -2.4 -3.6 -7 -3.6 -7 Z" stroke="#C08A3E" fill="none" stroke-width="1.1"/>`
    : '';
  return `<g class="plant" data-id="${w.id}" ${swayStyle}>
    <g stroke="${color}" fill="none" stroke-width="1.1">${body}</g>${drop}</g>`;
}

function plantSway(stage, h) {
  if (stage === 'seed') return '';
  const delay = -((h % 30) / 10).toFixed(1);
  if (currentWeather === 'wind') {
    return `style="animation: sway ${(2.2 + (h % 10) / 10).toFixed(1)}s ease-in-out ${delay}s infinite alternate;"`;
  }
  if (stage === 'bloom' || stage === 'bud') {
    return `style="animation: swayGentle ${(3.2 + (h % 12) / 10).toFixed(1)}s ease-in-out ${delay}s infinite alternate;"`;
  }
  return '';
}

// weather layer: sky elements + animated precipitation
function weatherLayer(kind) {
  const soft = '#4E7A66';
  if (kind === 'sunny') {
    return `<g stroke="${soft}" fill="none" stroke-width="1.2" stroke-linecap="round">
      <circle cx="299" cy="34" r="12"/>
      <path d="M299 14v6M299 48v6M279 34h6M313 34h6M285 20l4.2 4.2M308.8 43.8l4.2 4.2M313 20l-4.2 4.2M289.2 43.8L285 48"/>
    </g>`;
  }
  const cloud = (cx, cy, s) => `<path d="M${cx - 16 * s} ${cy} a${9 * s} ${9 * s} 0 1 1 ${3 * s} -${14 * s} a${11 * s} ${11 * s} 0 0 1 ${21 * s} ${2 * s} a${7.5 * s} ${7.5 * s} 0 0 1 -${1 * s} ${12 * s} Z" stroke="${soft}" fill="none" stroke-width="1.2"/>`;
  if (kind === 'cloudy') return cloud(292, 40, 1) + cloud(60, 30, 0.7);
  if (kind === 'wind') {
    return `<g stroke="${soft}" fill="none" stroke-width="1.2" stroke-linecap="round">
      <path d="M30 44 h64 a7 7 0 1 0 -7 -7"/>
      <path d="M52 66 h88 a7 7 0 1 1 -7 7"/>
      <path d="M226 52 h74 a6 6 0 1 0 -6 -6"/>
    </g>`;
  }
  if (kind === 'rain') {
    let drops = '';
    for (let i = 0; i < 14; i++) {
      const x = 18 + ((i * 47) % 306);
      const dur = (1 + (i % 4) * 0.18).toFixed(2);
      const delay = (-(i * 0.37) % 2).toFixed(2);
      drops += `<line class="wx-anim" x1="${x}" y1="-16" x2="${x - 2}" y2="-7" stroke="${soft}" stroke-width="1.2" stroke-linecap="round" opacity="0.7" style="animation: rainFall ${dur}s linear ${delay}s infinite;"/>`;
    }
    return cloud(288, 34, 0.9) + cloud(64, 26, 0.65) + drops;
  }
  if (kind === 'snow') {
    let flakes = '';
    for (let i = 0; i < 11; i++) {
      const x = 24 + ((i * 61) % 296);
      const dur = (5 + (i % 5) * 0.8).toFixed(1);
      const delay = (-(i * 1.1) % 6).toFixed(1);
      flakes += `<circle class="wx-anim" cx="${x}" cy="-10" r="2" fill="${soft}" opacity="0.7" style="animation: snowFall ${dur}s linear ${delay}s infinite;"/>`;
    }
    return cloud(288, 34, 0.9) + cloud(64, 26, 0.65) + flakes;
  }
  return '';
}

// fauna: a butterfly always; a bee joins once the garden has a few plants
function faunaLayer(plantCount) {
  if (plantCount === 0) return '';
  const butterfly = `
  <g class="fauna"><g>
    <animateMotion dur="19s" repeatCount="indefinite" path="M 42 66 C 120 26, 235 96, 300 48 C 238 112, 112 38, 42 66 Z"/>
    <g stroke="#1D5C4D" fill="none" stroke-width="1.1" stroke-linecap="round">
      <line x1="0" y1="-4" x2="0" y2="4"/>
      <path d="M0 -2 C -9 -11, -15 -2, -1.5 1"/>
      <path d="M0 -2 C 9 -11, 15 -2, 1.5 1"/>
      <path d="M-0.5 1 C -7 9, -12 4, -1.5 2.5"/>
      <path d="M0.5 1 C 7 9, 12 4, 1.5 2.5"/>
      <path d="M-1 -5 l-2.5 -3 M1 -5 l2.5 -3"/>
    </g>
  </g></g>`;
  const bee = plantCount < 4 ? '' : `
  <g class="fauna"><g>
    <animateMotion dur="13s" repeatCount="indefinite" path="M 70 120 C 130 90, 190 140, 250 104 C 200 150, 120 96, 70 120 Z"/>
    <g stroke="#1D5C4D" fill="none" stroke-width="1.1" stroke-linecap="round">
      <ellipse cx="0" cy="0" rx="5.5" ry="3.6"/>
      <line x1="-2" y1="-3.2" x2="-2" y2="3.2"/>
      <line x1="1" y1="-3.4" x2="1" y2="3.4"/>
      <ellipse cx="-1" cy="-6" rx="3.4" ry="2.2" transform="rotate(-24 -1 -6)"/>
      <ellipse cx="2.5" cy="-5.5" rx="3" ry="2" transform="rotate(18 2.5 -5.5)"/>
    </g>
  </g></g>`;
  return butterfly + bee;
}

// tap a plant → show which word it is
document.getElementById('gardenSvg').addEventListener('click', e => {
  const plant = e.target.closest('.plant');
  if (!plant) return;
  const w = gardenPlantMap[plant.dataset.id];
  if (!w) return;
  softTap();
  const stage = growthStage(w);
  const thirst = isThirsty(w)
    ? ' <span class="pi-amber">· 水やり待ち</span>'
    : ` · 次回 ${dueLabel(w)}`;
  document.getElementById('plantInfo').innerHTML =
    `<span class="pi-word">${escapeHtml(w.word)}</span>` +
    `<span>${escapeHtml(w.reading)} · ${STAGE_LABEL[stage]}${thirst}</span>`;
});

function resetPlantInfo() {
  document.getElementById('plantInfo').textContent = '花をタップすると、その言葉が見えます';
}

// ---------------- Study session (watering) ----------------

let session = null;

function startStudySession(mode, wordIds = null, tag = null) {
  const pool = wordsInBed(tag);
  let queue;

  if (mode === 'practice') {
    const src = wordIds ? pool.filter(w => wordIds.includes(w.id)) : pool.slice();
    queue = shuffle(src.slice());
  } else {
    queue = buildStudyQueue(pool, SESSION_NEW_LIMIT);
  }

  session = {
    mode, tag, queue,
    index: 0, correct: 0, seen: 0,
    revealed: false,
    wordIds: new Set(queue.map(w => w.id))
  };

  document.getElementById('studyModeTitle').textContent =
    mode === 'practice' ? '庭あるき' : '水やり';
  document.getElementById('sessionLabel').textContent =
    tag ? `花壇：${tag}` : (mode === 'practice' ? '庭ぜんぶ' : 'きょうの水やり');

  renderVine();
  renderCurrentCard();
}

function requeueCurrent(word) {
  const pos = Math.min(session.index + 3, session.queue.length);
  session.queue.splice(pos, 0, word);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ----- vine progress: a stem that grows a leaf per finished card -----

function renderVine() {
  const svg = document.getElementById('vineSvg');
  const total = session.queue.length;
  const done = session.index;
  document.getElementById('sessionCount').textContent = `${done} / ${total}`;

  if (total === 0) { svg.innerHTML = ''; return; }

  const x0 = 6, x1 = 334, y = 16;
  const xAt = i => x0 + ((x1 - x0) * (i + 0.5)) / total;
  const xDone = done >= total ? x1 : (done === 0 ? x0 : xAt(done - 1) + 4);

  let inner = `<line class="v-stem" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
  inner += `<line class="v-stem-done" x1="${x0}" y1="${y}" x2="${xDone}" y2="${y}"/>`;

  if (total <= 30) {
    for (let i = 0; i < total; i++) {
      const x = xAt(i);
      if (i < done) {
        const up = i % 2 === 0;
        const a = up ? -42 : 42;
        inner += `<g class="v-leaf" transform="translate(${x.toFixed(1)} ${y}) rotate(${a})"><path d="M0 0 Q3.4 -2.7 9 0 Q3.4 2.7 0 0 Z"/></g>`;
      } else if (i === done) {
        inner += `<circle class="v-bud" cx="${x.toFixed(1)}" cy="${y}" r="3.2"/>`;
      } else {
        inner += `<circle class="v-dot" cx="${x.toFixed(1)}" cy="${y}" r="1.5"/>`;
      }
    }
  }
  svg.innerHTML = inner;
}

// ----- stage glyphs (small, reused on cards + list) -----

function stageGlyph(stage) {
  const pine = '#1D5C4D', amber = '#C08A3E';
  const wrap = (inner, color) =>
    `<svg viewBox="0 0 24 24"><g stroke="${color}" fill="none" stroke-width="1.2" stroke-linecap="round">${inner}</g></svg>`;
  const leaf = (x, y, a, len) => {
    const w = (len * 0.3).toFixed(1), m = (len * 0.38).toFixed(1);
    return `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M0 0 Q${m} -${w} ${len} 0 Q${m} ${w} 0 0 Z"/></g>`;
  };
  if (stage === 'seed')
    return wrap(`<circle cx="12" cy="14" r="2.2" fill="${pine}" stroke="none"/><line x1="5" y1="19" x2="19" y2="19" stroke-dasharray="2.2 2.6"/>`, pine);
  if (stage === 'sprout')
    return wrap(`<line x1="12" y1="21" x2="12" y2="9"/>${leaf(12, 12, -138, 8)}${leaf(12, 16, -42, 7)}`, pine);
  if (stage === 'bud')
    return wrap(`<line x1="12" y1="21" x2="12" y2="12"/><path d="M12 12 Q9 8.5 12 3.5 Q15 8.5 12 12 Z"/>${leaf(12, 16, -140, 7)}`, pine);
  if (stage === 'bloom')
    return wrap(
      `<circle cx="12" cy="9" r="2.4"/>` +
      [0,1,2,3,4,5].map(k => {
        const a = Math.PI * 2 * k / 6 - Math.PI / 2;
        const px = (12 + Math.cos(a) * 5.6).toFixed(1), py = (9 + Math.sin(a) * 5.6).toFixed(1);
        const deg = (a * 180 / Math.PI + 90).toFixed(0);
        return `<ellipse cx="${px}" cy="${py}" rx="2.2" ry="4" transform="rotate(${deg} ${px} ${py})"/>`;
      }).join('') +
      `<line x1="12" y1="15.5" x2="12" y2="22"/>`, pine);
  return wrap(`<path d="M12 21 Q12 14 9 11"/>${leaf(9, 11, 150, 7)}${leaf(9, 11, 205, 7)}`, amber);
}

// ----- flashcard rendering -----

const gardenArt = (() => {
  const leaf = (x, y, a, len) => {
    const w = (len * 0.3).toFixed(1), m = (len * 0.38).toFixed(1);
    return `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M0 0 Q${m} -${w} ${len} 0 Q${m} ${w} 0 0 Z"/></g>`;
  };
  let rosette = '';
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * 2 * k / 9 - Math.PI / 2;
    const px = (37 + Math.cos(a) * 10).toFixed(1), py = (22 + Math.sin(a) * 10).toFixed(1);
    const deg = (a * 180 / Math.PI + 90).toFixed(1);
    rosette += `<ellipse cx="${px}" cy="${py}" rx="5" ry="11" transform="rotate(${deg} ${px} ${py})"/>`;
  }
  return {
    bloom: `<svg class="es-art" viewBox="0 0 74 74"><g stroke="#1D5C4D" fill="none" stroke-width="1.2" stroke-linecap="round"><line x1="37" y1="68" x2="37" y2="37"/>${leaf(37, 52, -142, 13)}${leaf(37, 44, -38, 11)}${rosette}</g></svg>`,
    sprout: `<svg class="es-art" viewBox="0 0 74 74"><g stroke="#1D5C4D" fill="none" stroke-width="1.2" stroke-linecap="round"><line x1="37" y1="66" x2="37" y2="30"/>${leaf(37, 40, -142, 17)}${leaf(37, 50, -38, 14)}</g></svg>`,
    seed: `<svg class="es-art" viewBox="0 0 74 74"><g stroke="#1D5C4D" fill="none" stroke-width="1.2" stroke-linecap="round"><circle cx="37" cy="44" r="4.4" fill="#1D5C4D" stroke="none"/><line x1="16" y1="58" x2="58" y2="58" stroke-dasharray="3.5 4"/><path d="M37 30 v-6 M28 33 l-4 -5 M46 33 l4 -5"/></g></svg>`
  };
})();

function renderCurrentCard() {
  const stage = document.getElementById('cardStage');
  const srsDock = document.getElementById('ratingDock');
  const practiceDock = document.getElementById('practiceDock');
  srsDock.style.display = 'none';
  practiceDock.style.display = 'none';
  session.revealed = false;

  if (getAllWords().length === 0) {
    stage.innerHTML = `
      <div class="empty-state">
        ${gardenArt.seed}
        <div class="empty-state-title">まだ種がありません</div>
        <div class="empty-state-sub">まずは最初の言葉を植えましょう</div>
        <button class="stage-btn stage-btn-primary" id="stageAddBtn">種をまく</button>
      </div>`;
    document.getElementById('stageAddBtn').addEventListener('click', () => goTo('addScreen'));
    renderVine();
    return;
  }

  if (session.queue.length === 0) {
    const bedName = session.tag ? `「${session.tag}」の花壇は` : '庭は';
    stage.innerHTML = `
      <div class="empty-state">
        ${gardenArt.sprout}
        <div class="empty-state-title">${escapeHtml(bedName)}うるおっています</div>
        <div class="empty-state-sub">今日の水やりはありません。<br>庭あるき（練習）ならいつでもできます</div>
        <button class="stage-btn stage-btn-primary" id="stagePracticeBtn">庭あるきをする</button>
      </div>`;
    document.getElementById('stagePracticeBtn').addEventListener('click', () => {
      softTap();
      startStudySession('practice', null, session.tag);
    });
    renderVine();
    return;
  }

  const word = session.queue[session.index];

  if (!word) {
    const isPractice = session.mode === 'practice';
    const summary = isPractice
      ? `${session.seen}枚 歩きました`
      : `${session.seen}回のうち ${session.correct}回 思い出せました`;
    const ids = Array.from(session.wordIds);
    const tag = session.tag;
    stage.innerHTML = `
      <div class="empty-state">
        ${gardenArt.bloom}
        <div class="empty-state-title">${isPractice ? '庭あるき、おわり' : '水やり、おわり'}</div>
        <div class="empty-state-sub">お疲れさまでした — ${escapeHtml(summary)}</div>
        <button class="stage-btn stage-btn-primary" id="stageReplayBtn">もう一度 庭あるき</button>
        <button class="stage-btn stage-btn-ghost" id="stageHomeBtn">庭へ戻る</button>
      </div>`;
    document.getElementById('stageReplayBtn').addEventListener('click', () => {
      softTap();
      startStudySession('practice', ids, tag);
    });
    document.getElementById('stageHomeBtn').addEventListener('click', () => goTo('gardenScreen'));
    renderVine();
    return;
  }

  const isReview = word.appearances > 0;
  const tagLeft = session.mode === 'practice'
    ? '庭あるき'
    : (isReview ? `水やり・${word.appearances + 1}回目` : '新しい種');
  const bedTag = (word.tags && word.tags.length)
    ? `<span class="tag tag-bed">${escapeHtml(word.tags[0])}</span>` : '';

  stage.innerHTML = `
    <div class="card-meta">
      <span class="tag">${escapeHtml(tagLeft)}</span>
      <span class="card-meta-right">${bedTag}<span class="tag">${escapeHtml(word.partOfSpeech || '—')}</span></span>
    </div>
    <div class="flashcard" id="flashcard">
      <span class="fc-stage-glyph">${stageGlyph(growthStage(word))}</span>
      <div class="fc-reveal fc-reading-row">
        <span class="fc-reading">${escapeHtml(word.reading)}</span>
        <button class="fc-speak" id="fcSpeak" aria-label="読み上げ">
          <svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>
        </button>
      </div>
      <div class="fc-word">${escapeHtml(word.word)}</div>
      ${word.example ? `<div class="fc-reveal fc-example">${escapeHtml(word.example)}</div>` : ''}
      <div class="fc-hint">タップして読み方を表示</div>
    </div>
  `;

  document.getElementById('flashcard').addEventListener('click', revealCurrentCard);
  document.getElementById('fcSpeak').addEventListener('click', e => {
    e.stopPropagation();
    if (!session || !session.revealed) return;
    speakWord(word.reading);
  });
  renderVine();
}

function revealCurrentCard() {
  if (!session || session.revealed) return;
  session.revealed = true;
  softTap();
  const card = document.getElementById('flashcard');
  if (card) card.classList.add('revealed');
  const dock = session.mode === 'practice'
    ? document.getElementById('practiceDock')
    : document.getElementById('ratingDock');
  dock.style.display = 'block';

  const word = session.queue[session.index];
  if (word) speakWord(word.reading); // hear it the moment you see it
}

function rateCurrentCard(rating) {
  if (!session || !session.revealed) return;
  const word = session.queue[session.index];
  if (!word) return;

  softTap();
  session.seen += 1;

  if (session.mode === 'srs') {
    updateWordAfterRating(word.id, rating);
    if (rating === 'good' || rating === 'easy') session.correct += 1;
    if (rating === 'again') requeueCurrent(word);
  } else {
    if (rating === 'again') requeueCurrent(word);
    else session.correct += 1;
  }

  session.index += 1;
  renderCurrentCard();
}

document.querySelectorAll('#ratingDock .rate-btn, #practiceDock .rate-btn').forEach(btn => {
  btn.addEventListener('click', () => rateCurrentCard(btn.dataset.rating));
});

// ---------------- Sow (add word) ----------------

let currentLookupResult = null;

function resetAddScreen() {
  document.getElementById('wordInput').value = '';
  const statusEl = document.getElementById('lookupStatus');
  statusEl.textContent = '';
  statusEl.classList.remove('error');
  document.getElementById('lookupResult').classList.remove('show');
  document.getElementById('manualEntry').classList.remove('show');
  document.getElementById('manualReadingInput').value = '';
  document.getElementById('savedToast').classList.remove('show');
  currentLookupResult = null;
  updateSaveButtonState();
  renderTagSuggestions();
  renderRecentWords();
}

function renderTagSuggestions() {
  const wrap = document.getElementById('tagSuggest');
  const tags = getAllTags();
  wrap.innerHTML = '';
  tags.slice(0, 10).forEach(({ tag }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      softTap();
      const input = document.getElementById('tagInput');
      const current = parseTags(input.value);
      if (current.includes(tag)) {
        input.value = current.filter(t => t !== tag).join('、');
        chip.classList.remove('selected');
      } else {
        current.push(tag);
        input.value = current.join('、');
        chip.classList.add('selected');
      }
    });
    if (parseTags(document.getElementById('tagInput').value).includes(tag)) {
      chip.classList.add('selected');
    }
    wrap.appendChild(chip);
  });
}

function renderRecentWords() {
  const list = document.getElementById('recentList');
  const recent = getRecentWords(5);
  if (recent.length === 0) {
    list.innerHTML = '<div class="recent-empty">まだ単語がありません</div>';
    return;
  }
  list.innerHTML = recent.map(w => `
    <div class="recent-item">
      <span class="recent-word">${escapeHtml(w.word)}</span>
      <span class="recent-reading">${escapeHtml(w.reading)}</span>
    </div>
  `).join('');
}

async function doLookup() {
  const query = document.getElementById('wordInput').value.trim();
  const statusEl = document.getElementById('lookupStatus');
  const resultEl = document.getElementById('lookupResult');
  const manualEl = document.getElementById('manualEntry');
  const lookupBtn = document.getElementById('lookupBtn');

  resultEl.classList.remove('show');
  manualEl.classList.remove('show');
  currentLookupResult = null;
  updateSaveButtonState();

  if (!query) {
    statusEl.textContent = '単語を入力してください';
    statusEl.classList.add('error');
    return;
  }

  softTap();
  statusEl.classList.remove('error');
  statusEl.textContent = '検索中…';
  lookupBtn.disabled = true;

  try {
    const result = await lookupWord(query);
    statusEl.textContent = '';
    currentLookupResult = result;
    renderLookupResult(result);
  } catch (err) {
    statusEl.textContent = err.message || '検索に失敗しました。手動で入力してください。';
    statusEl.classList.add('error');
    manualEl.classList.add('show');
    document.getElementById('manualReadingInput').focus();
  } finally {
    lookupBtn.disabled = false;
    updateSaveButtonState();
  }
}

document.getElementById('lookupBtn').addEventListener('click', doLookup);
document.getElementById('wordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
});

function renderLookupResult(result) {
  const resultEl = document.getElementById('lookupResult');
  document.getElementById('resultWord').textContent = result.word;
  document.getElementById('resultReading').textContent = result.readings[0];
  document.getElementById('resultPos').textContent = result.partOfSpeech;

  const altWrap = document.getElementById('altReadings');
  altWrap.innerHTML = '';
  if (result.readings.length > 1) {
    result.readings.forEach((reading, i) => {
      const chip = document.createElement('div');
      chip.className = 'alt-chip' + (i === 0 ? ' selected' : '');
      chip.textContent = reading;
      chip.addEventListener('click', () => {
        softTap();
        altWrap.querySelectorAll('.alt-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        currentLookupResult.selectedReading = reading;
        document.getElementById('resultReading').textContent = reading;
      });
      altWrap.appendChild(chip);
    });
  }
  currentLookupResult.selectedReading = result.readings[0];
  resultEl.classList.add('show');
}

function updateSaveButtonState() {
  const saveBtn = document.getElementById('saveBtn');
  const wordTyped = document.getElementById('wordInput').value.trim().length > 0;
  const manualReading = document.getElementById('manualReadingInput').value.trim().length > 0;
  saveBtn.disabled = !wordTyped || !(currentLookupResult || manualReading);
}

document.getElementById('wordInput').addEventListener('input', () => {
  currentLookupResult = null;
  document.getElementById('lookupResult').classList.remove('show');
  updateSaveButtonState();
});
document.getElementById('manualReadingInput').addEventListener('input', updateSaveButtonState);

document.getElementById('saveBtn').addEventListener('click', () => {
  const word = document.getElementById('wordInput').value.trim();
  if (!word) return;

  let reading, partOfSpeech;
  if (currentLookupResult) {
    reading = currentLookupResult.selectedReading || currentLookupResult.readings[0];
    partOfSpeech = currentLookupResult.partOfSpeech;
  } else {
    reading = document.getElementById('manualReadingInput').value.trim();
    partOfSpeech = '—';
  }
  if (!reading) return;

  const tags = parseTags(document.getElementById('tagInput').value);
  const example = document.getElementById('exampleInput').value.trim();

  softTap();
  addWord({ word, reading, partOfSpeech, tags, example });

  const toast = document.getElementById('savedToast');
  toast.textContent = `種をまきました — ${word}（${reading}）`;
  toast.classList.add('show');

  document.getElementById('wordInput').value = '';
  document.getElementById('lookupResult').classList.remove('show');
  document.getElementById('manualEntry').classList.remove('show');
  document.getElementById('manualReadingInput').value = '';
  document.getElementById('exampleInput').value = '';
  // keep the bed (tag) — sowing several seeds in the same bed is common
  currentLookupResult = null;
  updateSaveButtonState();
  renderTagSuggestions();
  renderRecentWords();

  setTimeout(() => toast.classList.remove('show'), 2400);
  document.getElementById('wordInput').focus();
});

// ---------------- Garden record (word list) ----------------

let listTagFilter = null;
let listSort = 'recent';

function dueLabel(w) {
  if (w.appearances === 0) return '未発芽';
  const today = todayIso();
  if (w.nextDue <= today) return '今日';
  const diff = Math.round((new Date(w.nextDue) - new Date(today)) / 86400000);
  return diff === 1 ? '明日' : `${diff}日後`;
}

function accuracyOf(w) { return w.appearances > 0 ? w.correct / w.appearances : 0; }

function renderInsights(words) {
  const block = document.getElementById('insightBlock');
  if (words.length === 0) { block.innerHTML = ''; return; }

  const counts = { bloom: 0, bud: 0, sprout: 0, wilt: 0, seed: 0 };
  words.forEach(w => counts[growthStage(w)]++);
  const vib = gardenVibrance(words);
  const total = words.length;
  const pct = k => (counts[k] / total * 100).toFixed(2) + '%';

  block.innerHTML = `
    <div class="vibrance-row">
      <span class="vibrance-label">庭の元気度</span>
      <span class="vibrance-value">${vib}%</span>
    </div>
    <div class="insight-bar">
      <span class="seg seg-bloom" style="width:${pct('bloom')}"></span>
      <span class="seg seg-bud" style="width:${pct('bud')}"></span>
      <span class="seg seg-sprout" style="width:${pct('sprout')}"></span>
      <span class="seg seg-wilt" style="width:${pct('wilt')}"></span>
      <span class="seg seg-seed" style="width:${pct('seed')}"></span>
    </div>
    <div class="insight-legend">
      <span class="leg"><i class="dot dot-bloom"></i>満開 ${counts.bloom}</span>
      <span class="leg"><i class="dot dot-bud"></i>蕾 ${counts.bud}</span>
      <span class="leg"><i class="dot dot-sprout"></i>芽 ${counts.sprout}</span>
      <span class="leg"><i class="dot dot-wilt"></i>しおれ ${counts.wilt}</span>
      <span class="leg"><i class="dot dot-seed"></i>種 ${counts.seed}</span>
    </div>
  `;
}

function renderTagFilterChips() {
  const wrap = document.getElementById('tagFilter');
  const tags = getAllTags();
  if (tags.length === 0) { wrap.innerHTML = ''; listTagFilter = null; return; }
  if (listTagFilter && !tags.some(t => t.tag === listTagFilter)) listTagFilter = null;

  const all = getAllWords().length;
  let html = `<button class="tag-chip filter-chip ${listTagFilter === null ? 'selected' : ''}" data-tag="">すべての花壇 ${all}</button>`;
  tags.forEach(({ tag, count }) => {
    html += `<button class="tag-chip filter-chip ${listTagFilter === tag ? 'selected' : ''}" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)} ${count}</button>`;
  });
  wrap.innerHTML = html;

  wrap.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      softTap();
      listTagFilter = chip.dataset.tag || null;
      renderWordList();
    });
  });
}

document.querySelectorAll('#sortToggle .sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (listSort === btn.dataset.sort) return;
    softTap();
    listSort = btn.dataset.sort;
    document.querySelectorAll('#sortToggle .sort-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    renderWordList();
  });
});

function renderWordList() {
  const listEl = document.getElementById('wordList');
  const summaryEl = document.getElementById('listSummary');

  renderTagFilterChips();

  let words = getAllWords();
  if (listTagFilter) words = words.filter(w => (w.tags || []).includes(listTagFilter));

  renderInsights(words);

  words = words.slice();
  if (listSort === 'weak') {
    words.sort((a, b) =>
      (STRENGTH_ORDER[wordStrength(a)] - STRENGTH_ORDER[wordStrength(b)]) ||
      (accuracyOf(a) - accuracyOf(b)));
  } else {
    words.sort((a, b) => (b.dateAdded > a.dateAdded ? 1 : -1));
  }

  const today = todayIso();
  const dueCount = words.filter(w => w.nextDue <= today).length;
  summaryEl.textContent = getAllWords().length === 0
    ? 'まだ単語がありません'
    : `${listTagFilter ? '「' + listTagFilter + '」' : '全'} ${words.length} 語 · 今日 ${dueCount} 語`;

  if (words.length === 0) {
    listEl.innerHTML = '<div class="recent-empty">「種をまく」から追加できます</div>';
    return;
  }

  listEl.innerHTML = words.map(w => {
    const stage = growthStage(w);
    const thirsty = isThirsty(w);
    const acc = w.appearances > 0 ? Math.round(accuracyOf(w) * 100) + '%' : '—';
    return `
    <div class="list-item ${thirsty ? 'thirsty' : ''}" data-id="${w.id}">
      <button class="list-item-main" data-action="toggle">
        <span class="li-glyph">${stageGlyph(stage)}</span>
        <span class="li-word">${escapeHtml(w.word)}</span>
        <span class="li-reading">${escapeHtml(w.reading)}</span>
        <span class="li-stage ${stage === 'wilt' || thirsty ? 'amber' : ''}">${STAGE_LABEL[stage]}${thirsty ? ' · 水やり' : ''}</span>
      </button>
      <div class="list-item-edit">
        <label class="input-label">単語</label>
        <input type="text" class="word-input edit-input" data-field="word" value="${escapeAttr(w.word)}">
        <label class="input-label">読み方</label>
        <input type="text" class="word-input edit-input" data-field="reading" value="${escapeAttr(w.reading)}">
        <label class="input-label">例文（任意）</label>
        <input type="text" class="word-input edit-input edit-example" data-field="example" value="${escapeAttr(w.example || '')}" placeholder="例文があると練習が深まります">
        <label class="input-label">花壇（「、」区切り）</label>
        <input type="text" class="word-input edit-input" data-field="tags" value="${escapeAttr((w.tags || []).join('、'))}" placeholder="例：建築">
        <div class="edit-meta">植えた日 ${escapeHtml(w.dateAdded)} · 水やり ${w.appearances}回 · 正解率 ${acc} · 次回 ${dueLabel(w)}</div>
        <div class="edit-actions">
          <button class="edit-btn edit-save" data-action="save">保存</button>
          <button class="edit-btn edit-delete" data-action="delete">抜く</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('wordList').addEventListener('click', e => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const item = actionEl.closest('.list-item');
  const id = item.dataset.id;
  const action = actionEl.dataset.action;

  if (action === 'toggle') {
    softTap();
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.list-item.open').forEach(el => el.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
    return;
  }

  if (action === 'save') {
    const word = item.querySelector('[data-field="word"]').value.trim();
    const reading = item.querySelector('[data-field="reading"]').value.trim();
    const tags = parseTags(item.querySelector('[data-field="tags"]').value);
    const example = item.querySelector('[data-field="example"]').value;
    if (!word || !reading) return;
    softTap();
    updateWord(id, { word, reading, tags, example });
    renderWordList();
    return;
  }

  if (action === 'delete') {
    if (!actionEl.classList.contains('confirming')) {
      softTap();
      actionEl.classList.add('confirming');
      actionEl.textContent = 'もう一度タップで抜く';
      setTimeout(() => {
        actionEl.classList.remove('confirming');
        actionEl.textContent = '抜く';
      }, 3000);
      return;
    }
    softTap();
    deleteWord(id);
    renderWordList();
  }
});

// ---------------- Backup & sync ----------------

function onSyncStatus(msg, isError) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

document.getElementById('exportBtn').addEventListener('click', () => {
  softTap();
  const n = exportBackup();
  onSyncStatus(`${n}語をファイルに保存しました`, false);
});

document.getElementById('importBtn').addEventListener('click', () => {
  softTap();
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const current = getAllWords().length;
  if (!window.confirm(`いまの ${current}語 をファイルの内容で置き換えます。よろしいですか？\n（心配なら先に「ファイルに保存」でバックアップを）`)) return;
  try {
    const n = await importBackupFile(file);
    onSyncStatus(`${n}語を復元しました`, false);
    renderWordList();
  } catch (err) {
    onSyncStatus(err.message || '復元に失敗しました', true);
  }
});

document.getElementById('syncBtn').addEventListener('click', async () => {
  softTap();
  const input = document.getElementById('tokenInput');
  const token = input.value.trim();
  const cfg = getSyncConfig();
  if (token) { cfg.token = token; saveSyncConfig(cfg); }
  if (!getSyncConfig().token) {
    onSyncStatus('トークンを入力してください', true);
    return;
  }
  onSyncStatus('同期中…', false);
  try {
    const result = await syncNow();
    const msg = {
      created: '非公開Gistを作成して保存しました',
      pushed: 'Gistに保存しました',
      pulled: 'Gistから最新のデータを取り込みました',
      uptodate: 'すでに最新です'
    }[result];
    const t = new Date();
    onSyncStatus(`${msg}（${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}）`, false);
    input.value = '';
    input.placeholder = '設定済み（変更する場合のみ入力）';
    if (result === 'pulled') { renderWordList(); }
  } catch (err) {
    onSyncStatus(err.message || '同期に失敗しました', true);
  }
});

function renderSyncState() {
  const cfg = getSyncConfig();
  const input = document.getElementById('tokenInput');
  if (cfg.token) input.placeholder = '設定済み（変更する場合のみ入力）';
}

// on launch: if sync is configured, quietly pull the newest data
async function initSync() {
  const cfg = getSyncConfig();
  if (!cfg.token) return;
  try {
    const result = await syncNow();
    if (result === 'pulled') renderHome();
  } catch (e) { /* offline etc. — local data is fine */ }
}

// ---------------- Init ----------------

renderHome();
renderSyncState();
initSync();
