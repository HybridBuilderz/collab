// language: JavaScript (ES module), file: main.js — Jenni's Keyboard
// Three.js 3D keybed + Tone.js audio. No build step, no dependencies.
import * as THREE from 'three';

/* ============ config ============ */
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_AFTER = { C: true, D: true, E: false, F: true, G: true, A: true, B: false };
const START_OCTAVE = 2;                    // lowest C on the bed
const NUM_OCTAVES = 5;                     // C2 .. C7
const TOTAL_WHITE = NUM_OCTAVES * 7 + 1;   // 36 white keys
const KEY_W = 0.24, KEY_L = 1.5, KEY_H = 0.12;
const BLACK_LIFT = 0.055;
const SUSTAIN_RELEASE = 1.4;
const HOVER_EMISSIVE = 0x6b4e1e;
const PRESS_DIP = 0.055;
// camera sits along this unit vector from the look target; distance is chosen
// per aspect ratio so the same number of keys fills the width on any screen
const CAM_UNIT = new THREE.Vector3(0, 0.881, 0.473);
const CAM_BASE = new THREE.Vector3(0, 0.05, 0.7);
const VISIBLE_WHITE = 16;
const BPM_DEFAULT = 96;
const REC_MAX_SECONDS = 60;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ============ state ============ */
const state = {
  audioReady: false,
  instrument: 'grand',
  volume: 0.8,
  sustain: false,
  labels: false,
  bpm: BPM_DEFAULT,
  metroOn: false,
  panX: 0,
  panTarget: 0,
  maxPan: 0,
  recState: 'idle',        // idle | recording | playing
  recStart: 0,
  recEvents: [],
  playTimers: [],
  status: '',
};

/* ============ dom ============ */
const stage = document.getElementById('kb-stage');
const canvas = document.getElementById('kb-canvas');
const wrap = document.getElementById('kb-canvas-wrap');
const labelsWrap = document.getElementById('kb-labels');
const scrollEl = document.getElementById('kb-scroll');
const scrollThumb = document.getElementById('kb-scroll-thumb');
const rangeLabel = document.getElementById('range-label');
const statusEl = document.getElementById('kb-status');
const gate = document.getElementById('audio-gate');
const btnEnter = document.getElementById('btn-enter');
const selInstrument = document.getElementById('sel-instrument');
const labelsBtn = document.getElementById('btn-labels');
const sustainBtn = document.getElementById('btn-sustain');
const metroBtn = document.getElementById('btn-metro');
const bpmSlider = document.getElementById('bpm');
const bpmLabel = document.getElementById('bpm-label');
const recBtn = document.getElementById('btn-rec');
const playBtn = document.getElementById('btn-play');
const volSlider = document.getElementById('vol');
const fsBtn = document.getElementById('btn-fullscreen');
const octDown = document.getElementById('btn-oct-down');
const octUp = document.getElementById('btn-oct-up');

/* ============ audio ============ */
let master = null;
let instruments = {};
let activeInstrument = null;
let clickSynth = null;
let metroId = null;
let beat = 0;

function grandUrls() {
  const urls = {};
  const base = 'https://tonejs.github.io/audio/salamander/';
  // 2 samples per octave (C, F#) — Tone.js pitch-stretches between them. ~4 MB.
  for (let oct = 1; oct <= 7; oct++) {
    urls[`C${oct}`] = `${base}C${oct}.mp3`;
    urls[`F#${oct}`] = `${base}Fs${oct}.mp3`;
  }
  return urls;
}

function volumeDb(v) {
  return v <= 0.001 ? -60 : Math.max(-60, Tone.gainToDb(v));
}

function makePoly(Voice, opts, filterFreq, volume) {
  const poly = new Tone.PolySynth(Voice, opts);
  poly.maxPolyphony = 32;
  poly.volume.value = volume;
  let node = poly;
  if (filterFreq) {
    const filt = new Tone.Filter(filterFreq, 'lowpass');
    poly.connect(filt);
    node = filt;
  }
  node.connect(master);
  return poly;
}

function buildInstruments() {
  instruments.grand = new Tone.Sampler(grandUrls(), { release: SUSTAIN_RELEASE }).connect(master);

  instruments.epiano = makePoly(Tone.FMSynth, {
    harmonicity: 3.0,
    modulationIndex: 12,
    oscillator: { type: 'sine' },
    modulator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 0.35, sustain: 0.05, release: 1.0 },
    modulationEnvelope: { attack: 0.002, decay: 0.15, sustain: 0, release: 0.4 },
  }, null, -6);

  instruments.synth = makePoly(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.9 },
  }, 2400, -14);

  instruments.musicbox = makePoly(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.6, sustain: 0.01, release: 1.6 },
  }, 5200, -10);
}

async function initAudio() {
  master = new Tone.Volume(volumeDb(state.volume)).toDestination();
  buildInstruments();
  setInstrument(state.instrument);
  clickSynth = new Tone.MembraneSynth({
    pitchDecay: 0.004,
    octaves: 1.2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
  }).connect(master);
  state.audioReady = true;
  try { await Tone.loaded(); } catch (e) { /* keys work, just silent */ }
}

function setInstrument(name) {
  if (!instruments[name]) return;
  if (activeInstrument && activeInstrument !== name) {
    try { instruments[activeInstrument].releaseAll(); } catch (e) {}
  }
  state.instrument = name;
  activeInstrument = name;
}

function playNote(note) {
  if (!state.audioReady) return;
  try { instruments[state.instrument].triggerAttack(note, Tone.now()); } catch (e) {}
}

function releaseNote(note) {
  if (!state.audioReady || state.sustain) return;
  try { instruments[state.instrument].triggerRelease(note, Tone.now()); } catch (e) {}
}

function releaseAllNotes() {
  if (!state.audioReady) return;
  try { instruments[state.instrument].releaseAll(); } catch (e) {}
}

/* ---- metronome ---- */
function startMetronome() {
  if (!state.audioReady) return;
  stopMetronome();
  beat = 0;
  Tone.Transport.bpm.value = state.bpm;
  metroId = Tone.Transport.scheduleRepeat((time) => {
    beat++;
    clickSynth.triggerAttackRelease(beat % 4 === 1 ? 'C7' : 'G6', '32n', time);
  }, '4n');
  Tone.Transport.start();
  state.metroOn = true;
  metroBtn.setAttribute('aria-pressed', 'true');
}

function stopMetronome() {
  if (metroId !== null) {
    try { Tone.Transport.clear(metroId); } catch (e) {}
    metroId = null;
  }
  if (state.metroOn) Tone.Transport.stop();
  state.metroOn = false;
  metroBtn.setAttribute('aria-pressed', 'false');
}

/* ---- recorder ---- */
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function startRecording() {
  stopPlayback();
  state.recState = 'recording';
  state.recStart = performance.now();
  state.recEvents = [];
  recBtn.classList.add('is-recording');
  recBtn.setAttribute('aria-pressed', 'true');
}

function stopRecording() {
  if (state.recState !== 'recording') return;
  state.recState = 'idle';
  recBtn.classList.remove('is-recording');
  recBtn.setAttribute('aria-pressed', 'false');
}

function recNoteOn(note) {
  if (state.recState !== 'recording') return;
  const t = (performance.now() - state.recStart) / 1000;
  if (t > REC_MAX_SECONDS) { stopRecording(); return; }
  state.recEvents.push({ t, type: 'on', note });
}

function recNoteOff(note) {
  if (state.recState !== 'recording') return;
  state.recEvents.push({ t: (performance.now() - state.recStart) / 1000, type: 'off', note });
}

function startPlayback() {
  if (state.recState === 'playing' || !state.recEvents.length) return;
  state.recState = 'playing';
  playBtn.textContent = '■ stop';
  for (const ev of state.recEvents) {
    const timer = setTimeout(() => {
      const mesh = keyByNote.get(ev.note);
      if (!mesh) return;
      if (ev.type === 'on') pressKey(mesh);
      else liftKey(mesh);
    }, ev.t * 1000);
    state.playTimers.push(timer);
  }
  const total = state.recEvents[state.recEvents.length - 1].t;
  state.playTimers.push(setTimeout(() => {
    if (state.recState === 'playing') stopPlayback();
  }, total * 1000 + 250));
}

function stopPlayback() {
  state.playTimers.forEach(clearTimeout);
  state.playTimers = [];
  if (state.recState === 'playing') {
    state.recState = 'idle';
    playBtn.textContent = '▶ play';
    [...pressed].forEach(liftKey);
  }
}

/* ============ scene ============ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0908);
scene.fog = new THREE.Fog(0x0b0908, 14, 30);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 3, 3);
camera.lookAt(0, 0.05, 0.7);

let camDist = 3.5;

function frameCamera() {
  const aspect = camera.aspect || 1;
  const targetWidth = VISIBLE_WHITE * KEY_W;
  camDist = clamp(targetWidth / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect), 1.6, 6);
}

/* --- lights --- */
scene.add(new THREE.AmbientLight(0xf2e8d8, 0.55));

const keyLight = new THREE.SpotLight(0xe6c88f, 90, 30, Math.PI / 5, 0.4, 1.6);
keyLight.position.set(2, 10, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.target.position.set(0, 0, 0);
scene.add(keyLight, keyLight.target);

const fill = new THREE.SpotLight(0xf2e8d8, 60, 30, Math.PI / 4, 0.5, 1.6);
fill.position.set(-5, 8, 6);
fill.target.position.set(0, 0.4, -1);
scene.add(fill, fill.target);

const rim = new THREE.PointLight(0x8c2f39, 10, 20);
rim.position.set(-7, 3, -6);
scene.add(rim);

/* --- stage floor --- */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(22, 48),
  new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.85 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.32;
floor.receiveShadow = true;
scene.add(floor);

/* ============ keyboard build ============ */
const piano = new THREE.Group();
scene.add(piano);

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c130c, roughness: 0.45 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1d11, roughness: 0.4 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.3, metalness: 0.7 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.32 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.28 });

const BED_W = TOTAL_WHITE * KEY_W;
const BED_HALF = BED_W / 2;

const keys = [];
const whiteKeys = [];
const keyByNote = new Map();
const pressed = new Set();
const pointers = new Map();
let hoveredKey = null;

function addKey(note, isBlack, x) {
  const geo = new THREE.BoxGeometry(
    isBlack ? KEY_W * 0.52 : KEY_W - 0.02,
    KEY_H,
    isBlack ? KEY_L * 0.62 : KEY_L
  );
  // pivot at the back of the key (balance pin), like a real action
  geo.translate(0, 0, isBlack ? KEY_L * 0.31 : KEY_L / 2);
  const mesh = new THREE.Mesh(geo, (isBlack ? blackMat : whiteMat).clone());
  mesh.castShadow = true;
  mesh.position.set(x, KEY_H / 2 + 0.02 + (isBlack ? BLACK_LIFT : 0), isBlack ? 0.06 : 0);
  mesh.userData = { note, isBlack, rotTarget: 0 };
  piano.add(mesh);
  keys.push(mesh);
  keyByNote.set(note, mesh);
  if (!isBlack) whiteKeys.push(mesh);
}

function buildBody() {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.5, 0.32, KEY_L + 1.1), bodyMat);
  slab.position.set(0, -0.14, KEY_L / 2 - 0.25);
  slab.castShadow = slab.receiveShadow = true;
  piano.add(slab);

  const backRail = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.5, 0.42, 0.1), woodMat);
  backRail.position.set(0, 0.21, -0.72);
  backRail.castShadow = backRail.receiveShadow = true;
  piano.add(backRail);

  const trim = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.5, 0.035, 0.03), goldMat);
  trim.position.set(0, 0.435, -0.67);
  piano.add(trim);

  const cheekGeo = new THREE.BoxGeometry(0.18, 0.42, KEY_L + 1.0);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, woodMat);
    cheek.position.set(side * (BED_HALF + 0.22), 0.05, KEY_L / 2 - 0.25);
    cheek.castShadow = cheek.receiveShadow = true;
    piano.add(cheek);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), goldMat);
    cap.position.set(side * (BED_HALF + 0.22), 0.28, KEY_L + 0.24);
    piano.add(cap);
  }

  const lip = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.5, 0.1, 0.06), goldMat);
  lip.position.set(0, -0.02, KEY_L + 0.28);
  piano.add(lip);
}

function buildKeys() {
  for (let i = 0; i < TOTAL_WHITE; i++) {
    const letter = WHITE_NOTES[i % 7];
    const octave = START_OCTAVE + Math.floor(i / 7);
    const x = (i - (TOTAL_WHITE - 1) / 2) * KEY_W;
    addKey(`${letter}${octave}`, false, x);
    if (BLACK_AFTER[letter] && i < TOTAL_WHITE - 1) {
      addKey(`${letter}#${octave}`, true, x + KEY_W / 2);
    }
  }
}

buildBody();
buildKeys();

/* ============ key labels ============ */
const labelDivs = [];
const labelVec = new THREE.Vector3();

function buildLabels() {
  for (const k of whiteKeys) {
    const el = document.createElement('div');
    el.className = 'kb-key-label';
    el.textContent = k.userData.note;
    el.style.display = 'none';
    labelsWrap.appendChild(el);
    labelDivs.push({ el, key: k });
  }
}
buildLabels();

function updateLabels() {
  const rect = stage.getBoundingClientRect();
  const show = state.labels;
  for (const { el, key } of labelDivs) {
    if (!show) { el.style.display = 'none'; continue; }
    key.localToWorld(labelVec.set(0, KEY_H / 2, KEY_L * 0.8));
    labelVec.project(camera);
    if (labelVec.z > 1 || labelVec.x < -1.05 || labelVec.x > 1.05 || labelVec.y < -1.05 || labelVec.y > 1.05) {
      el.style.display = 'none';
      continue;
    }
    const x = (labelVec.x * 0.5 + 0.5) * rect.width;
    const y = (-labelVec.y * 0.5 + 0.5) * rect.height;
    el.style.display = 'block';
    el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  }
}

/* ============ camera pan / scroll ============ */
function visibleWidth() {
  return 2 * camDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
}

function updateMaxPan() {
  const half = BED_HALF;
  state.maxPan = Math.max(0, half - visibleWidth() / 2 + 0.05);
  state.panX = clamp(state.panX, -state.maxPan, state.maxPan);
  state.panTarget = clamp(state.panTarget, -state.maxPan, state.maxPan);
}

function whiteIndexAtPan(pan) {
  return clamp(Math.round(pan / KEY_W + (TOTAL_WHITE - 1) / 2), 0, TOTAL_WHITE - 1);
}

function shiftOctave(delta) {
  if (pressed.size) return;              // bed is locked while playing
  const center = whiteIndexAtPan(state.panTarget);
  const next = clamp(center + delta * 7, 0, TOTAL_WHITE - 1);
  const x = (next - (TOTAL_WHITE - 1) / 2) * KEY_W;
  state.panTarget = clamp(x, -state.maxPan, state.maxPan);
}

function updateRangeLabel() {
  const rect = stage.getBoundingClientRect();
  const v = new THREE.Vector3();
  let first = null, last = null;
  for (const k of whiteKeys) {
    k.localToWorld(v.set(0, 0, KEY_L * 0.8));
    v.project(camera);
    if (v.z > 1) continue;
    const x = (v.x * 0.5 + 0.5) * rect.width;
    if (x < -40 || x > rect.width + 40) continue;
    if (!first) first = k.userData.note;
    last = k.userData.note;
  }
  rangeLabel.textContent = first ? `${first} – ${last}` : '—';
}

function updateScrollThumb() {
  const span = BED_W;
  const view = visibleWidth();
  const frac = Math.min(1, view / span);
  const thumbW = Math.max(6, frac * 100);
  const pos = state.maxPan > 0.0001 ? (state.panX + state.maxPan) / (2 * state.maxPan) : 0.5;
  scrollThumb.style.width = thumbW.toFixed(2) + '%';
  scrollThumb.style.left = (pos * (100 - thumbW)).toFixed(2) + '%';
}

let scrollDrag = false;
function scrollJump(e) {
  const rect = scrollEl.getBoundingClientRect();
  if (rect.width < 2) return;
  const frac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const span = BED_W;
  const view = visibleWidth();
  const leftEdge = -span / 2 + frac * (span - view);
  state.panTarget = clamp(leftEdge + view / 2, -state.maxPan, state.maxPan);
  state.panX = state.panTarget;
}
scrollEl.addEventListener('pointerdown', (e) => {
  if (pressed.size) return;              // bed is locked while playing
  scrollDrag = true;
  try { scrollEl.setPointerCapture(e.pointerId); } catch (err) {}
  scrollJump(e);
});
scrollEl.addEventListener('pointermove', (e) => { if (scrollDrag) scrollJump(e); });
scrollEl.addEventListener('pointerup', () => { scrollDrag = false; });
scrollEl.addEventListener('pointercancel', () => { scrollDrag = false; });

/* ============ key interaction ============ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickKey(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(keys, false);
  return hits.length ? hits[0].object : null;
}

function setGlow(mesh, on) {
  if (!mesh) return;
  mesh.material.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
  mesh.material.emissiveIntensity = on ? 0.55 : 0;
}

function setHover(mesh) {
  if (mesh === hoveredKey) return;
  if (hoveredKey && !pressed.has(hoveredKey)) setGlow(hoveredKey, false);
  hoveredKey = mesh;
  if (hoveredKey && !pressed.has(hoveredKey)) setGlow(hoveredKey, true);
}

function cancelPans() {
  for (const [id, p] of pointers) {
    if (p.type === 'pan') pointers.delete(id);
  }
}

function pressKey(mesh) {
  if (!mesh || pressed.has(mesh)) return;
  pressed.add(mesh);
  mesh.userData.rotTarget = PRESS_DIP;
  setGlow(mesh, true);
  cancelPans();                       // never slide the bed while a key is held
  playNote(mesh.userData.note);
  recNoteOn(mesh.userData.note);
}

function liftKey(mesh) {
  if (!mesh || !pressed.has(mesh)) return;
  pressed.delete(mesh);
  mesh.userData.rotTarget = 0;
  setGlow(mesh, mesh === hoveredKey);
  releaseNote(mesh.userData.note);
  recNoteOff(mesh.userData.note);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (state.recState === 'playing') stopPlayback();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}

  const k = pickKey(e.clientX, e.clientY);
  if (k) {
    pointers.set(e.pointerId, { type: 'key', mesh: k });
    pressKey(k);
  } else if (pressed.size === 0) {
    pointers.set(e.pointerId, { type: 'pan', lastX: e.clientX });
    state.panTarget = state.panX;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') setHover(pickKey(e.clientX, e.clientY));
    return;
  }
  if (p.type === 'key') {
    const k = pickKey(e.clientX, e.clientY);
    if (k !== p.mesh) {
      if (p.mesh) liftKey(p.mesh);
      p.mesh = k;
      if (k) pressKey(k);
    }
  } else if (p.type === 'pan') {
    const rect = stage.getBoundingClientRect();
    const worldPerPx = visibleWidth() / Math.max(1, rect.width);
    state.panX = clamp(state.panX - (e.clientX - p.lastX) * worldPerPx, -state.maxPan, state.maxPan);
    state.panTarget = state.panX;
    p.lastX = e.clientX;
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (p.type === 'key' && p.mesh) liftKey(p.mesh);
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  if (pressed.size) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  state.panTarget = clamp(state.panTarget + d * 0.0025, -state.maxPan, state.maxPan);
}, { passive: true });

/* ============ controls ============ */
selInstrument.addEventListener('change', () => setInstrument(selInstrument.value));

labelsBtn.addEventListener('click', () => {
  state.labels = !state.labels;
  labelsBtn.setAttribute('aria-pressed', String(state.labels));
});

sustainBtn.addEventListener('click', () => {
  state.sustain = !state.sustain;
  sustainBtn.setAttribute('aria-pressed', String(state.sustain));
  if (!state.sustain) releaseAllNotes();
});

metroBtn.addEventListener('click', () => {
  if (state.metroOn) stopMetronome();
  else startMetronome();
});

bpmSlider.addEventListener('input', () => {
  state.bpm = parseInt(bpmSlider.value, 10);
  bpmLabel.textContent = state.bpm;
  if (state.metroOn) Tone.Transport.bpm.value = state.bpm;
});

recBtn.addEventListener('click', () => {
  if (state.recState === 'recording') stopRecording();
  else startRecording();
});

playBtn.addEventListener('click', () => {
  if (state.recState === 'playing') stopPlayback();
  else startPlayback();
});

volSlider.addEventListener('input', () => {
  state.volume = parseInt(volSlider.value, 10) / 100;
  if (master) master.volume.value = volumeDb(state.volume);
});

octDown.addEventListener('click', () => shiftOctave(-1));
octUp.addEventListener('click', () => shiftOctave(1));

/* ---- fullscreen ---- */
const isFullscreen = () => document.fullscreenElement === wrap || wrap.classList.contains('fake-fullscreen');

function syncFsButton() {
  fsBtn.textContent = isFullscreen() ? 'exit fullscreen' : 'fullscreen';
}

let fsBusy = false;

async function toggleFullscreen() {
  if (fsBusy) return;
  fsBusy = true;
  try {
    if (!isFullscreen()) {
      if (wrap.requestFullscreen) {
        try { await wrap.requestFullscreen(); }
        catch (e) { wrap.classList.add('fake-fullscreen'); }
      } else {
        wrap.classList.add('fake-fullscreen');
      }
      if (screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock('landscape'); } catch (e) { /* hint covers it */ }
      }
    } else if (document.fullscreenElement === wrap) {
      await document.exitFullscreen();
    } else {
      wrap.classList.remove('fake-fullscreen');
    }
  } catch (err) { /* stay in the normal view */ }
  finally {
    fsBusy = false;
    syncFsButton();
    resize();
  }
}

fsBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement !== wrap && screen.orientation && screen.orientation.unlock) {
    screen.orientation.unlock();
  }
  syncFsButton();
  resize();
});

/* ============ audio gate ============ */
btnEnter.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  btn.textContent = 'tuning…';
  gate.classList.add('hidden');
  Tone.start()
    .then(() => initAudio())
    .catch(() => { btn.textContent = 'sound unavailable — try again'; });
});

/* ============ resize + loop ============ */
function resize() {
  const rect = stage.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  frameCamera();
  updateMaxPan();
}

new ResizeObserver(resize).observe(stage);
resize();

function updateStatus() {
  let text = '';
  if (state.recState === 'recording') {
    text = `rec ${fmtTime((performance.now() - state.recStart) / 1000)}`;
  } else if (state.recState === 'playing') {
    text = 'playing';
  } else if (state.recEvents.length) {
    text = `${state.recEvents.length} notes saved`;
  }
  if (text !== state.status) {
    state.status = text;
    statusEl.textContent = text;
  }
}

renderer.setAnimationLoop(() => {
  if (Math.abs(state.panTarget - state.panX) > 0.0005) {
    state.panX += (state.panTarget - state.panX) * 0.18;
  }

  camera.position.set(
    state.panX,
    CAM_BASE.y + CAM_UNIT.y * camDist,
    CAM_BASE.z + CAM_UNIT.z * camDist
  );
  camera.lookAt(state.panX, CAM_BASE.y, CAM_BASE.z);

  for (const k of keys) {
    const target = k.userData.rotTarget;
    if (Math.abs(k.rotation.x - target) > 0.0005) {
      k.rotation.x += (target - k.rotation.x) * 0.3;
    }
  }

  updateLabels();
  updateRangeLabel();
  updateScrollThumb();
  updateStatus();

  renderer.render(scene, camera);
});
