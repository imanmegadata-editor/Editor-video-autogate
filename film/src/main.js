// JANGAN PANDANG BELAKANG — deterministic shot-based renderer.
// window.renderFrame(t) draws the frame at time t (seconds) and returns a JPEG data URL.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeAmir, makeGhost, lerp } from './characters.js';
import { buildWorld, buildCar, cloudTexture } from './world.js';

const W = 1080, H = 1920;
const DEBUG_MIRROR = location.search.includes('mirror');
const RS = location.search.includes('fast') ? 0.5 : 1; // 3D render scale; overlay stays full-res
const TL = await (await fetch('./timeline.json')).json();
const LINES = await (await fetch('./lines.json')).json();

// ------------------------------------------------------------ helpers
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
const shake = (t, amp, f = 1) => new THREE.Vector3(noise1(t * 1.7 * f) * amp, noise1(t * 1.3 * f + 40) * amp, noise1(t * 1.1 * f + 90) * amp * 0.5);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function voiceEnv(id, t) {
  const st = TL.voices[id]; const L = LINES[id];
  if (st === undefined || !L) return 0;
  const k = (t - st) * 24; if (k < 0 || k >= L.env.length - 1) return 0;
  const i = Math.floor(k); return lerp(L.env[i], L.env[i + 1], k - i);
}
const speaking = (id, t) => { const st = TL.voices[id]; return t >= st && t <= st + LINES[id].dur; };

// ------------------------------------------------------------ car path
const SPEED = 9;
const zAt = []; { let z = 40; for (let i = 0; i <= 80 * 240; i++) { zAt.push(z); const t = i / 240; let v = SPEED; if (t > 43.6) v = SPEED * (1 - ss(43.6, 46.6, t)); z -= v / 240; } }
const carZ = (t) => zAt[Math.max(0, Math.min(zAt.length - 1, Math.round(t * 240)))];
const ROAD_X = -1.6;
const TREE_Z = carZ(21.9);
const STOP_Z = carZ(60);
const TREE2_Z = STOP_Z - 21;
const HOUSE_Z = carZ(8.4) - 6;

// ------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W * RS, H * RS);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
scene.fog = new THREE.FogExp2(0x0b1218, 0.022);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.02, 1500);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x2b3e55, 0x060708, 0.55); scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0x8ea8ff, 0.55); moonLight.position.set(-200, 300, -400); scene.add(moonLight);

const W0 = buildWorld(scene, { treeZ: TREE_Z, tree2Z: TREE2_Z, houseZ: HOUSE_Z });
const C = buildCar();
scene.add(C.car);
const wreck = buildCar({ wrecked: true });
wreck.car.position.set(-6.3, 0.05, TREE2_Z + 0.4);
wreck.car.rotation.set(0.02, Math.PI / 2 - 0.35, 0.04);
scene.add(wreck.car);
const wreckLight = new THREE.SpotLight(0xfff0d0, 120, 18, 0.5, 0.6, 2);
wreckLight.position.set(-4.2, 0.75, TREE2_Z - 0.4); wreckLight.target.position.set(-12, 0.5, TREE2_Z - 4);
scene.add(wreckLight, wreckLight.target);
// smoke from the wreck
const smokeTex = cloudTexture();
const smoke = [];
for (let i = 0; i < 26; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, color: 0x8a8f96, opacity: 0.0 }));
  s.userData.o = i / 26; scene.add(s); smoke.push(s);
}

const amir = makeAmir();
amir.root.position.set(0.38, 0, 0.2);
amir.root.rotation.y = Math.PI;
C.car.add(amir.root);

const ghost = makeGhost();
scene.add(ghost.root);
const ghostKey = new THREE.SpotLight(0xa8c4ff, 0, 9, 0.5, 0.8, 1.5); scene.add(ghostKey, ghostKey.target);
const ghostRim = new THREE.PointLight(0x9fb8ff, 0, 2.2, 2); scene.add(ghostRim);
const flash = new THREE.AmbientLight(0xc8d8ff, 0); scene.add(flash);

// composer
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W * RS / 2, H * RS / 2), 0.55, 0.6, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// 2D compositor
const out = document.createElement('canvas'); out.width = W; out.height = H;
document.body.appendChild(out);
const g2 = out.getContext('2d');
const grains = [];
for (let k = 0; k < 6; k++) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'); const id = x.createImageData(512, 512);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0); grains.push(c);
}
await Promise.all([
  new FontFace('Anton', 'url(../node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2)').load().then((f) => document.fonts.add(f)),
  new FontFace('Creepster', 'url(../node_modules/@fontsource/creepster/files/creepster-latin-400-normal.woff2)').load().then((f) => document.fonts.add(f)),
]);

// ------------------------------------------------------------ shot list
const SHOTS = [
  [0, 4.4, 'hook'], [4.4, 6.2, 'title'], [6.2, 10.0, 'aerial'], [10.0, 15.0, 'amirIntro'],
  [15.0, 17.6, 'povTree'], [17.6, 19.6, 'amirSees'], [19.6, 24.0, 'passGhost'], [24.0, 27.0, 'amirNervous'],
  [27.0, 29.2, 'radioOn'], [29.2, 30.2, 'amirRadio'], [30.2, 32.2, 'mirrorEmpty'], [32.2, 35.0, 'amirSniff'],
  [35.0, 38.2, 'mirrorGhost'], [38.2, 42.0, 'amirFreeze'], [42.0, 46.0, 'wideBack'], [46.0, 48.6, 'povWreck'],
  [48.6, 50.6, 'radioNews'], [50.6, 53.6, 'amirRealize'], [53.6, 56.0, 'lookBack'], [56.0, 59.45, 'ghostFront'],
  [59.45, 63.2, 'black'], [63.2, 70.01, 'finale'],
];
export const shotAt = (t) => SHOTS.find((s) => t >= s[0] && t < s[1]) || SHOTS[SHOTS.length - 1];

// car-local -> world
const CW = (x, y, z) => C.car.localToWorld(V(x, y, z));
function camLocal(p, look, fov, sh) {
  C.car.updateMatrixWorld(true);
  camera.position.copy(CW(...p));
  if (sh) camera.position.add(sh);
  camera.up.set(0, 1, 0);
  camera.lookAt(CW(...look));
  camera.fov = fov;
}
function camWorld(p, look, fov) {
  camera.position.copy(p); camera.up.set(0, 1, 0); camera.lookAt(look); camera.fov = fov;
}

function drawRadio(mode, t) {
  const c = C.radioCanvas, g = c.getContext('2d');
  g.fillStyle = '#020607'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (mode === 'off') { C.radioTex.needsUpdate = true; return; }
  if (mode === 'static') {
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(120,255,240,${Math.random() * 0.5})`; g.fillRect(Math.random() * 256, Math.random() * 96, 3, 2); }
    g.font = 'bold 46px monospace'; g.fillStyle = '#7ff7ea';
    const txt = Math.floor(t * 12) % 5 === 0 ? 'TUMPANG' : ['8#.#', '??.?', '88.8', 'T_MP_NG'][Math.floor(t * 9) % 4];
    g.fillText(txt, 128 + (Math.random() - 0.5) * 8, 50);
  } else if (mode === 'fm') {
    g.font = 'bold 50px monospace'; g.fillStyle = '#58e6d6'; g.fillText('FM 88.8', 128, 50);
  } else if (mode === 'clock') {
    g.font = 'bold 60px monospace'; g.fillStyle = '#ff4a3a';
    if (Math.floor(t * 2) % 2 === 0) g.fillText('02:00', 128, 50);
  }
  C.radioTex.needsUpdate = true;
}

// ------------------------------------------------------------ state per frame
function baseState(t) {
  // car on the road
  const z = carZ(t);
  C.car.position.set(ROAD_X, 0, z);
  const moving = t < 46.6;
  C.car.rotation.set(0, Math.sin(t * 0.37) * 0.01, 0);
  C.car.position.y = moving ? Math.abs(noise1(t * 6)) * 0.008 : 0;
  C.wheelSpin.rotation.z = Math.sin(t * 0.37) * 0.15 + noise1(t * 0.8) * 0.05;
  C.beads.rotation.z = Math.sin(t * 2.1) * 0.15 * (moving ? 1 : 0.3);
  C.beams.forEach((b) => (b.visible = true));
  if (DEBUG_MIRROR) {}
  C.headLights.forEach((l) => (l.intensity = 900));
  C.dashLight.intensity = 0.55; C.radioLight.intensity = 0; C.domeLight.intensity = 0; C.backFill.intensity = 0.0; C.faceKey.intensity = 0;
  C.cluster.visible = true;
  drawRadio('fm', t);
  hemi.intensity = 0.55; moonLight.intensity = 0.55; flash.intensity = 0;
  scene.fog.density = 0.022;
  renderer.toneMappingExposure = 1.0;
  W0.world.visible = true; W0.sky.visible = W0.moon.visible = W0.halo.visible = true;
  C.car.visible = true; wreck.car.visible = true;
  bloom.strength = 0.55;
  for (const f of W0.fogs) f.position.x = f.userData.x0 + Math.sin(t * 0.1 * f.userData.v + f.userData.x0) * 3;
  // smoke
  smoke.forEach((s) => { const k = (s.userData.o + t * 0.09) % 1; s.position.set(-7.2 + k * 1.2 + Math.sin(k * 9) * 0.4, 0.9 + k * 6, TREE2_Z + 0.6 + k * 1.5); s.scale.setScalar(1.2 + k * 4); s.material.opacity = Math.sin(k * Math.PI) * 0.35; });
  wreckLight.intensity = (Math.sin(t * 23) > -0.2 && noise1(t * 7) > -0.4) ? 120 : 8;

  // Amir default: driving
  const A = amir.state;
  Object.assign(A, { headYaw: noise1(t * 0.4) * 0.05, headPitch: 0.02, headRoll: 0, eyeX: noise1(t * 0.9 + 3) * 0.15, eyeY: 0, blink: 0, wide: 0, browUp: 0, browWorry: 0, browAngry: 0, mouthOpen: 0, mouthWide: 0, sweat: 0, torsoYaw: 0, breathe: 0, t });
  // natural blinks
  const bp = (t * 0.31) % 1; if (bp < 0.035) A.blink = Math.sin((bp / 0.035) * Math.PI);
  // lip sync for any Amir line
  for (const id of ['l1', 'l2', 'l3', 'l4', 'l6', 'l8']) if (speaking(id, t)) A.mouthOpen = clamp(voiceEnv(id, t) * 1.1);
  // hands follow wheel
  C.car.updateMatrixWorld(true);
  const hands = [];
  for (const a of [Math.PI * 0.82, Math.PI * 0.18]) {
    const pw = C.wheelSpin.localToWorld(V(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.02));
    hands.push(amir.root.worldToLocal(pw));
  }
  A.hands = [hands[1], hands[0]];

  // ghost default: hidden
  ghost.root.visible = false;
  Object.assign(ghost.state, { headYaw: 0, headPitch: 0, headRoll: 0, cover: 1, mouthOpen: 0, grin: 0, glow: 1, armsUp: 0, t, sway: 1 });
  ghostKey.intensity = 0; ghostRim.intensity = 0;
}

function ghostInBackSeat(lean = 0) {
  ghost.root.visible = true;
  C.car.updateMatrixWorld(true);
  ghost.root.position.copy(CW(0.0, -0.33, 1.08 - lean * 0.45));
  ghost.root.rotation.set(-lean * 0.35, C.car.rotation.y + Math.PI, 0);
  ghost.root.scale.setScalar(1);
}
function ghostUnderTree(t) {
  ghost.root.visible = true;
  ghost.root.position.set(-5.3, 0.04 + Math.sin(t * 0.8) * 0.02, TREE_Z + 1.0);
  ghost.root.rotation.set(0, -Math.PI / 2, 0);
}

// ------------------------------------------------------------ shots
const S = {
  hook(t, u) {
    // flash-forward: the mirror, in the dark, and her
    C.car.position.z = STOP_Z; C.car.position.x = ROAD_X;
    C.beams.forEach((b) => (b.visible = false)); C.headLights.forEach((l) => (l.intensity = 0));
    hemi.intensity = 0.05; moonLight.intensity = 0.06; C.dashLight.intensity = 0.15;
    const fl = (noise1(t * 9) > 0.1 && t > 0.9) ? 1 : 0.05;
    C.backFill.intensity = 1.6 * fl * ss(0.6, 1.4, t);
    C.domeLight.intensity = 0.4 * fl * ss(0.8, 1.5, t);
    ghostInBackSeat(0.15);
    Object.assign(ghost.state, { cover: t < 3.5 ? 1 : 0, headPitch: lerp(0.55, 0.05, ss(1.5, 3.4, t)), glow: ss(1.2, 2.2, t) * 1.3, grin: ss(3.55, 3.75, t) * 0.8, mouthOpen: ss(3.6, 3.8, t) * 0.3 });
    if (t > 3.55 && t < 3.85) { flash.intensity = 1.6 * (1 - ss(3.55, 3.85, t)); C.backFill.intensity = 6; }
    renderer.toneMappingExposure = 1.4;
    const push = ss(0, 4.4, t);
    camLocal([0.26 - push * 0.08, 1.2 + push * 0.02, 0.1 - push * 0.12], [0.02, 1.26, -0.36], 30 - push * 12, shake(t, 0.002));
    if (t > 3.9) renderer.toneMappingExposure = 0.0;
  },
  title(t, u) {
    ghostUnderTree(t);
    ghost.state.cover = 1; ghost.state.glow = 0.0;
    C.car.position.z = TREE_Z + 120;
    scene.fog.density = 0.03;
    ghostKey.intensity = 26; ghostKey.position.set(-4, 6, TREE_Z + 3); ghostKey.target.position.copy(ghost.root.position);
    renderer.toneMappingExposure = 1.3;
    camWorld(V(-1.2 - u * 0.4, 1.4 + u * 0.2, TREE_Z + 14 - u * 2.5), V(-6.4, 2.6, TREE_Z), 38);
  },
  aerial(t, u) {
    C.beams.forEach((b) => (b.visible = false));
    const cz = C.car.position.z;
    camWorld(V(9 - u * 4, 26 - u * 9, cz + 26 - u * 8), V(ROAD_X - 1, 0, cz - 16), 42);
    scene.fog.density = 0.014;
    renderer.toneMappingExposure = 1.35;
  },
  amirIntro(t, u) {
    const A = amir.state;
    if (t < 10.8) { A.mouthOpen = ss(10.05, 10.35, t) * (1 - ss(10.5, 10.75, t)) * 0.9; A.blink = Math.max(A.blink, ss(10.1, 10.3, t) * (1 - ss(10.5, 10.7, t)) * 0.7); A.headPitch = -0.08 * Math.sin(clamp((t - 10) / 0.8) * Math.PI); }
    A.browWorry = 0.2; A.eyeX = noise1(t * 0.7) * 0.25; A.blink = Math.max(A.blink, 0.18);
    if (t > 13.2) { A.headYaw = -0.25 * ss(13.2, 13.8, t); A.eyeX = 0.5 * ss(13.2, 13.6, t); }
    C.faceKey.intensity = 2.6; C.dashLight.intensity = 0.9;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.14 + u * 0.06, 1.24, -0.58 + u * 0.12], [0.38, 1.17, 0.2], 50 - u * 8, shake(t, 0.004));
  },
  povTree(t, u) {
    ghostUnderTree(t);
    ghost.state.cover = 1; ghost.state.glow = 0.5;
    ghostKey.intensity = 14; ghostKey.position.set(-4, 6, TREE_Z + 3); ghostKey.target.position.copy(ghost.root.position);
    renderer.toneMappingExposure = 1.25;
    camLocal([0.36, 1.25, 0.12], [0.1 - u * 0.25, 1.0, -8], 46 - u * 10, shake(t, 0.006, 2));
  },
  amirSees(t, u) {
    const A = amir.state;
    A.headYaw = -0.18 - 0.2 * ss(17.8, 19.4, t); A.headPitch = -0.04;
    A.eyeX = 0.45 + 0.2 * ss(18, 19.2, t); A.browWorry = 0.5; A.browUp = ss(18.5, 19, t) * 0.6; A.wide = ss(18.4, 18.9, t) * 0.7;
    C.faceKey.intensity = 2.8; C.dashLight.intensity = 0.9;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.24 + u * 0.03, 1.24, -0.6 + u * 0.08], [0.38, 1.22, 0.2], 36, shake(t, 0.002));
  },
  passGhost(t, u) {
    C.beams.forEach((b) => (b.visible = false));
    ghostUnderTree(t);
    const gs = ghost.state;
    gs.cover = t < 22.2 ? 1 : 0; gs.sway = 0.3;
    // the neck keeps turning past what a human neck can do
    gs.headYaw = lerp(0, Math.PI / 2, ss(20.0, 20.9, t)) + lerp(0, Math.PI / 2, ss(21.3, 22.2, t)) + lerp(0, 1.32, ss(22.4, 23.4, t));
    gs.headRoll = 0.25 * ss(22.4, 23.4, t); gs.glow = ss(22.3, 22.8, t) * 1.4; gs.grin = ss(23.2, 23.8, t) * 0.6;
    ghostKey.intensity = 22; ghostKey.position.set(-3.5, 5, TREE_Z - 2); ghostKey.target.position.copy(ghost.root.position);
    scene.fog.density = 0.03;
    renderer.toneMappingExposure = 1.3;
    const cp = V(-2.9, 1.15, TREE_Z - 6.5).add(shake(t, 0.01));
    camWorld(cp, V(-5.1, 1.55 + u * 0.1, TREE_Z + 1), 40 - u * 12);
  },
  amirNervous(t, u) {
    const A = amir.state;
    A.browWorry = 0.8; A.wide = 0.35; A.sweat = 0.6; A.breathe = 0.6;
    A.eyeX = 0.15 + noise1(t * 3) * 0.35; A.headYaw = noise1(t * 1.4) * 0.05;
    C.faceKey.intensity = 2.6; C.dashLight.intensity = 0.9;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.3, 1.24, -0.62 + u * 0.06], [0.38, 1.21, 0.2], 40, shake(t, 0.0025, 2));
  },
  radioOn(t, u) {
    drawRadio('static', t);
    const fl = noise1(t * 20) > -0.2 ? 1 : 0.1;
    C.radioLight.intensity = 0.8 * fl; C.dashLight.intensity = 0.9 * fl;
    renderer.toneMappingExposure = 1.5;
    bloom.strength = 0.9;
    camLocal([0.05, 0.93, -0.1 + u * 0.05], [0.0, 0.86, -0.35], 30, shake(t, 0.0015, 3));
  },
  amirRadio(t, u) {
    drawRadio('static', t);
    const A = amir.state;
    A.browWorry = 0.9; A.wide = 0.6; A.sweat = 0.7; A.eyeX = -0.35; A.eyeY = -0.5; A.headPitch = 0.12; A.headYaw = 0.12; A.mouthOpen = 0.2;
    C.radioLight.intensity = noise1(t * 20) > -0.2 ? 0.9 : 0.1;
    C.faceKey.intensity = 2.4; C.dashLight.intensity = 0.8;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.27, 1.17, -0.62], [0.38, 1.22, 0.2], 38, shake(t, 0.002, 2));
  },
  mirrorEmpty(t, u) {
    drawRadio('off', t);
    C.backFill.intensity = 0.9;
    renderer.toneMappingExposure = 1.6;
    camLocal([0.3, 1.2, 0.08], [0.02, 1.25, -0.36], 30 - u * 5, shake(t, 0.0015));
  },
  amirSniff(t, u) {
    drawRadio('off', t);
    const A = amir.state;
    A.headPitch = -0.12 * ss(32.2, 32.5, t) * (1 - ss(33, 33.4, t)); A.blink = Math.max(A.blink, 0.5 * ss(32.2, 32.4, t) * (1 - ss(32.9, 33.1, t)));
    A.browWorry = 0.6; A.browUp = 0.3; A.sweat = 0.6;
    if (t > 34.1) { A.eyeX = -0.5 * ss(34.1, 34.6, t); A.eyeY = 0.35 * ss(34.1, 34.6, t); A.headYaw = 0.1 * ss(34.2, 34.9, t); }
    C.faceKey.intensity = 2.6; C.dashLight.intensity = 0.8;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.17, 1.24, -0.64 + u * 0.08], [0.38, 1.18, 0.2], 46, shake(t, 0.002));
  },
  mirrorGhost(t, u) {
    drawRadio('off', t);
    ghostInBackSeat(0.05);
    Object.assign(ghost.state, { cover: 1, headPitch: lerp(0.5, 0.08, ss(36.2, 37.8, t)), glow: ss(36.6, 37.3, t) * 1.4, sway: 0.4 });
    C.backFill.intensity = 1.1;
    renderer.toneMappingExposure = 1.6;
    camLocal([0.3 - u * 0.04, 1.2, 0.08 - u * 0.1], [0.02, 1.26, -0.36], 26 - u * 10, shake(t, 0.0015));
  },
  amirFreeze(t, u) {
    drawRadio('off', t);
    ghostInBackSeat(ss(38.4, 41.5, t) * 0.9);
    Object.assign(ghost.state, { cover: 1, headPitch: 0.1, headYaw: -0.4 * ss(39, 41, t), glow: 1.2, sway: 0.4 });
    ghostRim.intensity = 0.6; ghostRim.position.copy(CW(-0.3, 1.35, 1.1));
    const A = amir.state;
    A.wide = 1; A.browUp = 0.8; A.browWorry = 1; A.sweat = 1; A.breathe = 1; A.eyeX = 0.1 + noise1(t * 6) * 0.05; A.eyeY = 0.05;
    A.mouthOpen = 0.18 + Math.abs(Math.sin(t * 9)) * 0.08; A.headYaw = noise1(t * 14) * 0.012; A.blink = 0;
    C.faceKey.intensity = 2.6; C.dashLight.intensity = 0.8;
    renderer.toneMappingExposure = 1.5;
    camLocal([0.31, 1.25, -0.6 + u * 0.1], [0.36, 1.22, 0.2], 44 - u * 10, shake(t, 0.002, 3));
  },
  wideBack(t, u) {
    drawRadio('off', t);
    const gone = t > 43.05;
    const fl = (t > 42.5 && t < 43.2) ? (noise1(t * 40) > 0 ? 1 : 0.0) : 1;
    if (!gone) { ghostInBackSeat(0.8); Object.assign(ghost.state, { cover: 1, headYaw: -0.4, glow: 1.0 }); }
    C.dashLight.intensity = 0.8 * fl; C.backFill.intensity = 0.5 * fl; hemi.intensity = 0.55 * fl;
    C.headLights.forEach((l) => (l.intensity = 900 * fl));
    const A = amir.state;
    A.wide = 1; A.browWorry = 1; A.sweat = 1; A.breathe = 1;
    renderer.toneMappingExposure = 1.5;
    const brake = ss(43.6, 44.2, t) * (1 - ss(46.0, 46.6, t));
    camLocal([-0.55, 1.22, 1.45], [0.3, 1.05, -1.2], 46, shake(t, 0.004 + brake * 0.01, 2));
  },
  povWreck(t, u) {
    drawRadio('fm', t);
    renderer.toneMappingExposure = 1.35;
    scene.fog.density = 0.026;
    camLocal([0.36, 1.24, 0.12], [-2.6, 0.9, -21], 34 - u * 8, shake(t, 0.002));
  },
  radioNews(t, u) {
    drawRadio('clock', t);
    C.radioLight.intensity = 0.5;
    renderer.toneMappingExposure = 1.5;
    camLocal([0.03, 0.92, -0.18 + u * 0.04], [0.0, 0.86, -0.35], 28, shake(t, 0.001));
  },
  amirRealize(t, u) {
    drawRadio('clock', t);
    const A = amir.state;
    A.wide = 0.8; A.browWorry = 1; A.browUp = 0.5; A.sweat = 1; A.breathe = 0.8;
    A.mouthOpen = 0.35 * ss(50.8, 51.4, t); A.headYaw = Math.sin(t * 4) * 0.06 * ss(51.5, 52, t); A.eyeY = -0.1;
    C.faceKey.intensity = 2.4; C.dashLight.intensity = 0.7; C.radioLight.intensity = 0.4;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.22 + u * 0.04, 1.24, -0.64 + u * 0.14], [0.38, 1.2, 0.2], 42 - u * 8, shake(t, 0.002));
  },
  lookBack(t, u) {
    drawRadio('clock', t);
    const A = amir.state;
    const turn = ss(54.4, 55.2, t) * (1 - ss(55.5, 56.0, t));
    A.headYaw = -turn * 1.25; A.torsoYaw = -turn * 0.5; A.eyeX = -turn * 0.6;
    A.wide = 1; A.browWorry = 1; A.browUp = 0.7; A.sweat = 1; A.breathe = 1;
    C.backFill.intensity = 0.7; C.faceKey.intensity = 2.2;
    renderer.toneMappingExposure = 1.55;
    camLocal([0.05, 1.18, 1.15], [0.36, 1.2, 0.1], 34, shake(t, 0.002));
  },
  ghostFront(t, u) {
    drawRadio('clock', t);
    amir.root.visible = false; // POV
    ghost.root.visible = true;
    const gs = ghost.state;
    const lunge = ss(58.95, 59.22, t);
    const d = lerp(0.52, 0.08, lunge);
    C.car.updateMatrixWorld(true);
    const eye = CW(0.36, 1.23, 0.2);
    const turn = 1 - ss(56.0, 56.55, t);
    const fwd = CW(0.36 - 0.25 * turn, 1.2, -1.0 + turn * 1.6);
    // place the ghost's face in front of the eyes, leaning in from the passenger seat
    const headTarget = CW(0.3, 1.21 - lunge * 0.01, 0.2 - d);
    ghost.root.rotation.set(0, 0.35 + C.car.rotation.y, 0.25);
    ghost.root.updateMatrixWorld(true);
    const hw = ghost.head.getWorldPosition(V(0, 0, 0)).add(V(0, 0.1, 0));
    ghost.root.position.add(headTarget.sub(hw));
    Object.assign(gs, { cover: 0, glow: 1.2 + lunge, headYaw: 0.5 - 0.1 * ss(56.6, 58, t), headRoll: -0.25, grin: ss(56.6, 58.0, t) * 0.7 + lunge * 0.4, mouthOpen: Math.max(clamp(voiceEnv('l9', t) * 0.6), lunge * 1.0), sway: 0.5 });
    ghostRim.intensity = 0.45 + lunge * 2; ghostRim.position.copy(CW(0.25, 1.38, 0.05));
    C.dashLight.intensity = 0.7; C.radioLight.intensity = 0.3;
    renderer.toneMappingExposure = 1.5;
    camWorld(eye.add(shake(t, 0.003 + lunge * 0.02, 3)), fwd, 50);
    if (t > 59.25) renderer.toneMappingExposure = 5;
  },
  black(t, u) { renderer.toneMappingExposure = 0; camLocal([0.36, 1.23, 0.2], [0.36, 1.2, -1], 40); },
  finale(t, u) {
    W0.world.visible = false; W0.sky.visible = W0.moon.visible = W0.halo.visible = false;
    C.car.visible = false; wreck.car.visible = false;
    hemi.intensity = 0; moonLight.intensity = 0;
    ghost.root.visible = true;
    ghost.root.position.set(0, 0, 0); ghost.root.rotation.set(0, 0, 0);
    const gs = ghost.state;
    Object.assign(gs, { cover: 0, glow: ss(63.5, 64.4, t) * 1.3 * (t > 69.35 ? 0 : 1), headPitch: 0.06, headRoll: lerp(-0.25, 0.15, ss(63.5, 67, t)), headYaw: 0, grin: ss(65.5, 67.0, t) * 0.75, mouthOpen: clamp(voiceEnv('end', t) * 0.35), sway: 0.5 });
    ghostRim.intensity = ss(64.0, 66.0, t) * 1.6 * (1 - ss(67.4, 68.4, t)); ghostRim.position.set(0.35, 1.75, 0.35);
    ghostKey.intensity = ss(64.5, 66.5, t) * 2.5 * (1 - ss(67.4, 68.4, t)); ghostKey.position.set(-0.4, 2.2, 1.2); ghostKey.target.position.set(0, 1.6, 0);
    renderer.toneMappingExposure = 1.4;
    const push = ss(63.2, 70, t);
    camWorld(V(0, 1.6, 1.05 - push * 0.55), V(0, 1.6, 0), 34);
  },
};

// ------------------------------------------------------------ 2D overlay: subtitles, titles, grade
const SUBS = TL.subs.map((s) => {
  if (s.start !== undefined) return { ...s, t0: s.start, t1: s.end };
  const st = TL.voices[s.id], d = LINES[s.id].dur;
  const f0 = s.from ?? 0, f1 = s.to ?? 1;
  return { ...s, t0: st + d * f0, t1: st + d * f1 };
});

function layoutWords(parts) {
  const words = [];
  for (const [txt, red] of parts) for (const w of txt.split(/(\s+)/)) if (w.trim()) words.push({ w: w.toUpperCase(), red: !!red });
  return words;
}

function drawSub(sub, t) {
  const words = layoutWords(sub.parts);
  const isText = sub.style === 'text';
  const fs = isText ? 62 : 74;
  g2.font = `${fs}px Anton`;
  const space = fs * 0.28, maxW = 920;
  const lines = [[]]; let lw = 0;
  for (const w of words) { const ww = g2.measureText(w.w).width; if (lw + ww > maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push({ ...w, ww }); lw += ww + space; }
  const total = words.reduce((a, w) => a + w.w.length + 1, 0);
  const span = (sub.t1 - sub.t0) * (isText ? 0.55 : 0.92);
  const fadeOut = 1 - ss(sub.t1 + 0.35, sub.t1 + 0.65, t);
  const baseY = isText ? 980 : 1470;
  const lh = fs * 1.22;
  let ci = 0;
  lines.forEach((line, li) => {
    const lwid = line.reduce((a, w) => a + w.ww, 0) + space * (line.length - 1);
    let x = W / 2 - lwid / 2;
    const y = baseY + (li - (lines.length - 1) / 2) * lh;
    for (const w of line) {
      const wt = sub.t0 + (ci / total) * span; ci += w.w.length + 1;
      const k = ss(wt - 0.02, wt + 0.14, t);
      if (k <= 0) { x += w.ww + space; continue; }
      const sc = 1 + (1 - k) * 0.35 + (w.red ? Math.max(0, Math.sin((t - wt) * 18) * Math.exp(-(t - wt) * 6)) * 0.12 : 0);
      let jx = 0, jy = 0;
      if (sub.style === 'ghost') { jx = noise1(t * 30 + ci) * 2.2; jy = noise1(t * 27 + ci * 3) * 2.2; }
      g2.save();
      g2.globalAlpha = k * fadeOut;
      g2.translate(x + w.ww / 2 + jx, y + jy); g2.scale(sc, sc);
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.lineJoin = 'round';
      g2.shadowColor = w.red ? 'rgba(255,0,0,0.9)' : 'rgba(0,0,0,0.9)'; g2.shadowBlur = w.red ? 28 : 18;
      g2.lineWidth = 10; g2.strokeStyle = 'rgba(0,0,0,0.95)'; g2.strokeText(w.w, 0, 0);
      g2.shadowBlur = w.red ? 22 : 0;
      g2.fillStyle = w.red ? '#ff1f1f' : (sub.style === 'radio' ? '#dff8ff' : '#ffffff');
      g2.fillText(w.w, 0, 0);
      g2.restore();
      x += w.ww + space;
    }
  });
}

function glitchText(txt, font, x, y, color, t, amt) {
  g2.font = font; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  if (amt > 0) {
    g2.save(); g2.globalCompositeOperation = 'lighter';
    g2.fillStyle = 'rgba(255,0,0,0.7)'; g2.fillText(txt, x - amt * 8, y);
    g2.fillStyle = 'rgba(0,200,255,0.5)'; g2.fillText(txt, x + amt * 8, y);
    g2.restore();
  }
  g2.shadowColor = color === '#ffffff' ? 'rgba(0,0,0,0.9)' : 'rgba(255,0,0,0.85)'; g2.shadowBlur = 30;
  g2.fillStyle = color; g2.fillText(txt, x + (amt > 0 ? (hash(Math.floor(t * 24)) - 0.5) * 20 * amt : 0), y);
  g2.shadowBlur = 0;
}

function drawTitle(t, t0, t1, y = 900) {
  const a = ss(t0, t0 + 0.35, t) * (1 - ss(t1 - 0.3, t1, t));
  if (a <= 0) return;
  const gl = (hash(Math.floor(t * 24) + 7) > 0.7 ? 1 : 0) * (t - t0 < 0.6 ? 1 : 0.4);
  g2.save(); g2.globalAlpha = a;
  g2.letterSpacing = '14px';
  glitchText('JANGAN PANDANG', '96px Anton', W / 2, y - 120, '#ffffff', t, gl);
  g2.letterSpacing = '4px';
  const sc = 1 + (1 - ss(t0, t0 + 0.6, t)) * 0.25;
  g2.translate(W / 2, y + 40); g2.scale(sc, sc);
  glitchText('BELAKANG', '210px Creepster', 0, 0, '#d40d0d', t, gl);
  g2.restore(); g2.letterSpacing = '0px';
}

function typewriter(txt, t, t0, cps) { const n = Math.floor(clamp((t - t0) * cps, 0, txt.length)); return txt.slice(0, n); }

function overlay(t, shot) {
  // grade
  g2.save();
  g2.globalCompositeOperation = 'soft-light'; g2.fillStyle = 'rgba(20,60,80,0.2)'; g2.fillRect(0, 0, W, H);
  g2.restore();
  // vignette
  const vg = g2.createRadialGradient(W / 2, H * 0.48, H * 0.22, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)');
  g2.fillStyle = vg; g2.fillRect(0, 0, W, H);
  // grain
  g2.save(); g2.globalCompositeOperation = 'overlay'; g2.globalAlpha = 0.11;
  const gi = grains[Math.floor(t * 24) % grains.length];
  const ox = -Math.floor(hash(t * 13.1) * 512), oy = -Math.floor(hash(t * 7.7) * 512);
  for (let x = ox; x < W; x += 512) for (let y = oy; y < H; y += 512) g2.drawImage(gi, x, y);
  g2.restore();
  // radio static scanlines
  if (shot === 'radioOn' || shot === 'amirRadio') { g2.fillStyle = 'rgba(255,255,255,0.03)'; for (let y = (t * 300) % 6; y < H; y += 6) g2.fillRect(0, y, W, 1); }

  // hook: tiny timestamp
  if (t < 4.0) {
    g2.save(); g2.globalAlpha = ss(0.4, 1.0, t) * 0.7 * (1 - ss(3.5, 3.6, t)); g2.font = '34px Anton'; g2.textAlign = 'left'; g2.fillStyle = '#e8e8e8'; g2.letterSpacing = '6px';
    g2.fillText('02:00 PAGI', 64, 120); g2.restore(); g2.letterSpacing = '0px';
  }
  if (t >= 4.4 && t < 6.2) drawTitle(t, 4.4, 6.2, 860);
  if (t >= 6.5 && t < 9.9) {
    const a = 1 - ss(9.5, 9.9, t);
    g2.save(); g2.globalAlpha = a; g2.textAlign = 'center'; g2.letterSpacing = '10px';
    g2.font = '58px Anton'; g2.fillStyle = '#f2f2f2'; g2.shadowColor = '#000'; g2.shadowBlur = 20;
    g2.fillText(typewriter('KAMPUNG SUNGAI MATI', t, 6.6, 14), W / 2, 330);
    g2.font = '40px Anton'; g2.fillStyle = '#ff2a2a'; g2.shadowColor = 'rgba(255,0,0,0.8)';
    g2.fillText(typewriter('PERAK  •  02:00 PAGI', t, 7.9, 14), W / 2, 400);
    g2.restore(); g2.letterSpacing = '0px';
  }
  for (const s of SUBS) if (t >= s.t0 - 0.05 && t < s.t1 + 0.7) drawSub(s, t);
  if (t >= 67.4) {
    drawTitle(t, 67.4, 70.2, 900);
    const a = ss(68.6, 69.1, t);
    g2.save(); g2.globalAlpha = a * 0.85; g2.font = '40px Anton'; g2.textAlign = 'center'; g2.letterSpacing = '8px'; g2.fillStyle = '#bbbbbb';
    g2.fillText('...DIA MASIH DI SITU.', W / 2, 1180); g2.restore(); g2.letterSpacing = '0px';
  }
  // jump-scare flash
  if (t > 59.2 && t < 59.45) { g2.fillStyle = `rgba(255,255,255,${0.85 * (1 - ss(59.2, 59.45, t))})`; g2.fillRect(0, 0, W, H); }
  // fade from black at the start, tiny cut-to-black on flash in the hook
  if (t < 0.5) { g2.fillStyle = `rgba(0,0,0,${1 - ss(0, 0.5, t)})`; g2.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------ frame
window.renderFrame = (t) => {
  const [t0, t1, name] = shotAt(t);
  const u = (t - t0) / (t1 - t0);
  amir.root.visible = true;
  baseState(t);
  S[name](t, u);
  amir.apply(); ghost.apply();
  camera.aspect = W / H; camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  // live rear-view mirror
  if (C.car.visible && renderer.toneMappingExposure > 0) {
    C.mirrorCam.lookAt(CW(0.0, 1.3, 1.1));
    C.mirrorFace.visible = false;
    renderer.setRenderTarget(C.mirrorRT); renderer.render(scene, C.mirrorCam); renderer.setRenderTarget(null);
    C.mirrorFace.visible = true;
  }
  if (renderer.toneMappingExposure <= 0) { renderer.setClearColor(0x000000); renderer.clear(); g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H); }
  else { if (DEBUG_MIRROR) renderPass.camera = C.mirrorCam; composer.render(); g2.filter = 'contrast(1.08) saturate(0.82)'; g2.drawImage(renderer.domElement, 0, 0, W, H); g2.filter = 'none'; }
  overlay(t, name);
  return out.toDataURL('image/jpeg', 0.93);
};
window.SHOTS = SHOTS;
window.ready = true;
