// language: JavaScript (ES module), file: main.js — Three.js 3D grand piano + Tone.js sampled audio
import * as THREE from 'three';

/* ============ config ============ */
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_AFTER = { C: true, D: true, E: false, F: true, G: true, A: true, B: false };
const START_OCTAVE = 4;          // octave shown in HUD label when centered
const NUM_OCTAVES = 2;           // keys built per octave band; camera frames the middle
const SUSTAIN_RELEASE = 1.4;
const ORBIT_TARGET = new THREE.Vector3(0, 0.5, 0.3); // pivot for orbit + framing

/* ============ audio (Tone.js) ============ */
let sampler = null;
let sustainOn = false;

async function initAudio() {
  // Salamander grand piano samples, served from Tone.js CDN
  const A = new TonePlayerUrls();
  sampler = new Tone.Sampler(A, { release: SUSTAIN_RELEASE }).toDestination();
  await Tone.loaded();
}

function TonePlayerUrls() {
  const urls = {};
  const base = 'https://tonejs.github.io/audio/salamander/';
  // 2 samples per octave (C, F#) — Tone.js pitch-stretches between them.
  // full 12-per-octave is ~20MB; this is ~4MB and sounds near-identical on phone speakers.
  for (let oct = 1; oct <= 7; oct++) {
    urls[`C${oct}`] = `${base}C${oct}.mp3`;
    urls[`F#${oct}`] = `${base}Fs${oct}.mp3`;
  }
  return urls;
}

function playNote(note) {
  if (!sampler) return;
  sampler.triggerAttack(note, Tone.now());
}

function releaseNote(note) {
  if (!sampler || sustainOn) return;
  sampler.triggerRelease(note, Tone.now());
}

function releaseAll() {
  if (!sampler) return;
  sampler.releaseAll();
}

/* ============ three.js scene ============ */
const wrap = document.getElementById('piano-canvas-wrap');
const canvas = document.getElementById('piano-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0908);
scene.fog = new THREE.Fog(0x0b0908, 14, 30);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 4.6, 5.2);
camera.lookAt(ORBIT_TARGET);

/* --- lights --- */
scene.add(new THREE.AmbientLight(0xf2e8d8, 0.55));

const key = new THREE.SpotLight(0xe6c88f, 90, 25, Math.PI / 5, 0.4, 1.6);
key.position.set(2, 9, 4);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key, key.target);

// soft fill from the front so the body and open lid read in the default view
const fill = new THREE.SpotLight(0xf2e8d8, 70, 25, Math.PI / 4, 0.5, 1.6);
fill.position.set(-3, 7, 5);
fill.target.position.set(0, 0.5, -2);
scene.add(fill, fill.target);

const rim = new THREE.PointLight(0x8c2f39, 12, 18);
rim.position.set(-5, 3, -4);
scene.add(rim);

/* --- floor --- */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(16, 48),
  new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.85 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* ============ piano build ============ */
const piano = new THREE.Group();
scene.add(piano);

const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2817, roughness: 0.35, metalness: 0.1 });
const woodMatDark = new THREE.MeshStandardMaterial({ color: 0x2a1d11, roughness: 0.35 });
const feltMat = new THREE.MeshStandardMaterial({ color: 0x8c2f39, roughness: 0.95 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.35 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.3 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.3, metalness: 0.7 });

const KEY_W = 0.24, KEY_L = 1.5, KEY_H = 0.12;
const BLACK_LIFT = 0.055;          // black keys sit higher than white keys, like a real piano
const HOVER_EMISSIVE = 0x6b4e1e;   // warm gold hover glow
const keys = [];           // { mesh, note, isBlack, baseX }
const activeTouches = new Map(); // touchId -> key

function buildKeybed() {
  const totalWhite = NUM_OCTAVES * 7 + 1;
  const bedW = totalWhite * KEY_W;

  // keybed base: thicker now, and run back into the body so there is no seam
  const bed = new THREE.Mesh(new THREE.BoxGeometry(bedW + 0.46, 0.3, KEY_L + 0.7), woodMat);
  bed.position.set(0, -0.14, KEY_L / 2 - 0.05);
  bed.castShadow = bed.receiveShadow = true;
  piano.add(bed);

  // side cheeks: the case walls the keys sit between, tops above the keys
  const cheekGeo = new THREE.BoxGeometry(0.16, 0.42, KEY_L + 0.55);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, woodMat);
    cheek.position.set(side * (bedW / 2 + 0.15), 0.05, KEY_L / 2 - 0.05);
    cheek.castShadow = cheek.receiveShadow = true;
    piano.add(cheek);
  }

  // front key slip: low board across the key fronts, keys emerge from behind it
  const slip = new THREE.Mesh(new THREE.BoxGeometry(bedW + 0.3, 0.14, 0.08), woodMat);
  slip.position.set(0, 0.0, KEY_L + 0.32);
  slip.castShadow = slip.receiveShadow = true;
  piano.add(slip);

  // red felt strip behind keys
  const felt = new THREE.Mesh(new THREE.BoxGeometry(bedW, 0.02, 0.08), feltMat);
  felt.position.set(0, 0.012, 0);
  piano.add(felt);

  // gold rail across the front, sitting on the key slip
  const rail = new THREE.Mesh(new THREE.BoxGeometry(bedW + 0.3, 0.04, 0.06), goldMat);
  rail.position.set(0, 0.09, KEY_L + 0.32);
  piano.add(rail);

  // gold trim along the top of the body's front edge, ties the case together
  const trim = new THREE.Mesh(new THREE.BoxGeometry(bedW + 0.3, 0.03, 0.05), goldMat);
  trim.position.set(0, 0.99, -0.02);
  piano.add(trim);
  return { bedW, totalWhite };
}

function addKey(note, isBlack, x, totalWhite) {
  const geo = new THREE.BoxGeometry(
    isBlack ? KEY_W * 0.52 : KEY_W - 0.02,
    KEY_H,
    isBlack ? KEY_L * 0.62 : KEY_L
  );
  // each key gets its own material so hover and press can light one key only
  const mesh = new THREE.Mesh(geo, (isBlack ? blackMat : whiteMat).clone());
  mesh.castShadow = true;
  // pivot at the back of the key (balance pin), like a real action
  mesh.geometry.translate(0, 0, isBlack ? KEY_L * 0.31 : KEY_L / 2);
  // black keys sit higher than white keys, like a real piano: their tops
  // never share a plane with the white keys, so no more flicker
  mesh.position.set(x, KEY_H / 2 + 0.02 + (isBlack ? BLACK_LIFT : 0), isBlack ? 0.06 : 0);
  mesh.userData = { note, isBlack, pressed: false };
  piano.add(mesh);
  keys.push(mesh);
}

function buildKeys(bedW) {
  let x = -bedW / 2 + KEY_W / 2;
  for (let oct = 0; oct < NUM_OCTAVES; oct++) {
    for (let i = 0; i < 7; i++) {
      const letter = WHITE_NOTES[i];
      const octaveNum = START_OCTAVE - 1 + Math.floor(oct + i / 7) + (i === 0 && oct > 0 ? 0 : 0);
      // correct octave numbering: octave bumps at C each cycle
      const note = `${letter}${START_OCTAVE + oct}`;
      addKey(note, false, x, 0);
      if (BLACK_AFTER[letter]) {
        addKey(note.replace(letter, `${letter}#`), true, x + KEY_W / 2, 0);
      }
      x += KEY_W;
    }
  }
  // final closing C
  addKey(`C${START_OCTAVE + NUM_OCTAVES}`, false, x, 0);
}

function buildBody(bedW) {
  const bodyW = bedW + 0.6;
  const bodyL = 5.2;
  const bodyH = 0.85;

  // main body slab (curved grand shape approximated with an extruded shape)
  const shape = new THREE.Shape();
  const w = bodyW / 2;
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.quadraticCurveTo(w + 0.4, -bodyL * 0.55, -w * 0.35, -bodyL);
  shape.quadraticCurveTo(-w - 0.1, -bodyL * 0.5, -w, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: bodyH, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(geo, woodMat);
  body.position.set(0, 0.12, -bodyL);
  body.castShadow = body.receiveShadow = true;
  piano.add(body);

  // raised lid (propped grand lid) — two planes
  const lidGeo = new THREE.BoxGeometry(bodyW * 0.96, 0.06, bodyL * 0.52);
  const lid = new THREE.Mesh(lidGeo, woodMatDark);
  lid.position.set(0, bodyH + 0.75, -bodyL * 0.52);
  lid.rotation.x = 0.22;
  lid.castShadow = true;
  piano.add(lid);

  // lid prop stick
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15), goldMat);
  stick.position.set(bodyW * 0.34, bodyH + 0.3, -bodyL * 0.72);
  stick.rotation.z = 0.35;
  stick.rotation.x = 0.15;
  piano.add(stick);

  // inner plate glow (soundboard hint under the lid)
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW * 0.8, 0.02, bodyL * 0.42),
    new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.5, metalness: 0.3 })
  );
  board.position.set(0, bodyH * 0.55, -bodyL * 0.52);
  piano.add(board);

  // music stand
  const stand = new THREE.Mesh(new THREE.BoxGeometry(bedW * 0.55, 0.04, 0.42), woodMatDark);
  stand.position.set(0, 0.55, -0.75);
  stand.rotation.x = -0.35;
  piano.add(stand);

  // legs (3, like a real grand)
  const legGeo = new THREE.CylinderGeometry(0.09, 0.07, 1.05, 12);
  const legPos = [
    [bedW / 2 + 0.15, -bodyL + 0.1],
    [-bedW / 2 - 0.15, -bodyL + 0.1],
    [0, -0.55],
  ];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(lx, -0.55, lz);
    leg.castShadow = true;
    piano.add(leg);
  }
}

const { bedW } = (() => {
  const r = buildKeybed();
  buildKeys(r.bedW);
  buildBody(r.bedW);
  return r;
})();

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

/* --- hover: a soft gold glow on the key under the mouse --- */
let hoveredKey = null;

function setGlow(mesh, on) {
  if (!mesh) return;
  mesh.material.emissive.setHex(on ? HOVER_EMISSIVE : 0x000000);
  mesh.material.emissiveIntensity = on ? 0.55 : 0;
}

function setHover(mesh) {
  if (mesh === hoveredKey) return;
  if (hoveredKey && !hoveredKey.userData.pressed) setGlow(hoveredKey, false);
  hoveredKey = mesh;
  if (hoveredKey && !hoveredKey.userData.pressed) setGlow(hoveredKey, true);
}

function pressKey(mesh) {
  if (!mesh || mesh.userData.pressed) return;
  mesh.userData.pressed = true;
  mesh.rotation.x = 0.055; // dip the front of the key
  setGlow(mesh, true);
  playNote(mesh.userData.note);
}

function liftKey(mesh) {
  if (!mesh || !mesh.userData.pressed) return;
  mesh.userData.pressed = false;
  mesh.rotation.x = 0;
  setGlow(mesh, mesh === hoveredKey);
  releaseNote(mesh.userData.note);
}

/* --- touch: multi-touch chords --- */
canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    const k = pickKey(t.clientX, t.clientY);
    activeTouches.set(t.identifier, k);
    if (k) { pressKey(k); e.preventDefault(); }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  // glissando: dragging a finger across keys plays them
  for (const t of e.changedTouches) {
    const prev = activeTouches.get(t.identifier);
    const k = pickKey(t.clientX, t.clientY);
    if (k !== prev) {
      if (prev) liftKey(prev);
      activeTouches.set(t.identifier, k);
      if (k) pressKey(k);
    }
  }
  e.preventDefault();
}, { passive: false });

const endTouch = (e) => {
  for (const t of e.changedTouches) {
    const k = activeTouches.get(t.identifier);
    if (k) liftKey(k);
    activeTouches.delete(t.identifier);
  }
};
canvas.addEventListener('touchend', endTouch);
canvas.addEventListener('touchcancel', endTouch);

/* --- mouse fallback --- */
let mouseDown = false;
canvas.addEventListener('mousedown', (e) => {
  mouseDown = true;
  const k = pickKey(e.clientX, e.clientY);
  if (k) pressKey(k);
});
window.addEventListener('mousemove', (e) => {
  if (!mouseDown && !mOrbit) setHover(pickKey(e.clientX, e.clientY));
  if (!mouseDown) return;
  const k = pickKey(e.clientX, e.clientY);
  if (k) pressKey(k);
});
window.addEventListener('mouseup', () => {
  mouseDown = false;
  keys.forEach(liftKey);
});

/* ============ camera orbit / zoom (touch-first) ============ */
let orbiting = false;
let orbitLast = null;
let pinchDist = 0;

const isOnKey = (x, y) => !!pickKey(x, y);

wrap.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  } else if (e.touches.length === 1 && !isOnKey(e.touches[0].clientX, e.touches[0].clientY)) {
    orbiting = true;
    orbitLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: true });

wrap.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    // pinch zoom
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const factor = pinchDist / d;
    const r = camera.position.length();
    const nr = THREE.MathUtils.clamp(r * factor, 3.5, 14);
    camera.position.multiplyScalar(nr / r);
    pinchDist = d;
  } else if (orbiting && orbitLast && e.touches.length === 1) {
    // orbit around the piano
    const dx = e.touches[0].clientX - orbitLast.x;
    const dy = e.touches[0].clientY - orbitLast.y;
    const target = ORBIT_TARGET;
    const off = camera.position.clone().sub(target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta -= dx * 0.005;
    sph.phi = THREE.MathUtils.clamp(sph.phi - dy * 0.004, 0.55, Math.PI / 2.05);
    off.setFromSpherical(sph);
    camera.position.copy(target).add(off);
    camera.lookAt(target);
    orbitLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: true });

wrap.addEventListener('touchend', (e) => {
  if (e.touches.length === 0) { orbiting = false; orbitLast = null; }
  if (e.touches.length < 2) pinchDist = 0;
});

/* --- desktop orbit (mouse drag on empty space) --- */
let mOrbit = null;
canvas.addEventListener('mousedown', (e) => {
  if (!pickKey(e.clientX, e.clientY)) mOrbit = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousemove', (e) => {
  if (!mOrbit) return;
  const dx = e.clientX - mOrbit.x, dy = e.clientY - mOrbit.y;
  const target = ORBIT_TARGET;
  const off = camera.position.clone().sub(target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.theta -= dx * 0.005;
  sph.phi = THREE.MathUtils.clamp(sph.phi - dy * 0.004, 0.55, Math.PI / 2.05);
  off.setFromSpherical(sph);
  camera.position.copy(target).add(off);
  camera.lookAt(target);
  mOrbit = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => { mOrbit = null; });
canvas.addEventListener('wheel', (e) => {
  const r = camera.position.length();
  const nr = THREE.MathUtils.clamp(r + e.deltaY * 0.004, 3.5, 14);
  camera.position.multiplyScalar(nr / r);
}, { passive: true });

/* ============ HUD controls ============ */
const octLabel = document.getElementById('octave-label');
let octaveShift = 0;

// re-note keys on octave shift (transposition without rebuilding geometry)
function transpose(amount) {
  octaveShift = THREE.MathUtils.clamp(octaveShift + amount, -2, 2);
  for (const k of keys) {
    const m = k.userData.note.match(/^([A-G]#?)(\d)$/);
    k.userData.note = `${m[1]}${parseInt(m[2]) + amount}`;
  }
  octLabel.textContent = `${'C'}${START_OCTAVE + octaveShift}`;
}

document.getElementById('btn-oct-down').addEventListener('click', () => transpose(-1));
document.getElementById('btn-oct-up').addEventListener('click', () => transpose(1));

const sustainBtn = document.getElementById('btn-sustain');
sustainBtn.addEventListener('click', () => {
  sustainOn = !sustainOn;
  sustainBtn.setAttribute('aria-pressed', String(sustainOn));
  if (!sustainOn) releaseAll();
});

/* ============ audio gate ============ */
const gate = document.getElementById('audio-gate');
document.getElementById('btn-enter').addEventListener('click', async (e) => {
  e.currentTarget.textContent = 'tuning…';
  try {
    await Tone.start();        // unlock audio on user gesture (mobile policy)
    gate.classList.add('hidden');
    e.currentTarget.textContent = 'open the lid'; // reset for the next visit state
    // samples load in the background; the piano opens right away and
    // the keys start sounding as soon as the samples arrive
    initAudio().catch(() => { /* piano stays playable, just silent */ });
  } catch (err) {
    e.currentTarget.textContent = 'something went wrong — try again';
  }
});

/* ============ resize + loop ============ */
function resize() {
  const rect = wrap.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  // frame the piano tighter on narrow screens
  const dist = rect.width < 480 ? 7.6 : 6.4;
  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(ORBIT_TARGET);
}
new ResizeObserver(resize).observe(wrap);
resize();

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
