// Character rigs: Amir (driver) and the woman in white (hantu).
// Every expression is a parameter so shots can animate faces frame by frame.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const mesh = (g, m, p, s) => {
  const x = new THREE.Mesh(g, m);
  if (p) x.position.set(...p);
  if (s) x.scale.set(...s);
  return x;
};
export const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// orient a unit-height mesh (along +Y) between two points
const _up = new THREE.Vector3(0, 1, 0);
export function stretch(m, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  m.scale.set(1, len, 1);
}

// two-bone limb solve; returns elbow position
function elbowFor(sh, hand, l1, l2, pole) {
  const d = new THREE.Vector3().subVectors(hand, sh);
  let L = Math.min(d.length(), l1 + l2 - 1e-4);
  const dir = d.clone().normalize();
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return sh.clone().addScaledVector(dir, a).addScaledVector(p, h);
}

function faceTexture(pale) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = pale ? '#c9d0ce' : '#a8714f';
  g.fillRect(0, 0, 512, 256);
  // subtle mottling
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512, y = Math.random() * 256, r = Math.random() * 6 + 1;
    g.fillStyle = pale ? `rgba(120,140,140,${Math.random() * 0.08})` : `rgba(90,45,25,${Math.random() * 0.06})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // front of sphere is u=0.25 -> x=128 ; eyes around v~0.62 -> y ~ 97
  if (pale) {
    for (const ex of [128 - 21, 128 + 21]) {
      const gr = g.createRadialGradient(ex, 100, 2, ex, 100, 34);
      gr.addColorStop(0, 'rgba(10,10,16,0.95)');
      gr.addColorStop(0.5, 'rgba(40,30,50,0.55)');
      gr.addColorStop(1, 'rgba(60,60,70,0)');
      g.fillStyle = gr; g.fillRect(ex - 40, 60, 80, 90);
    }
    // veins
    g.strokeStyle = 'rgba(60,40,70,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      let x = 128 + (Math.random() - 0.5) * 120, y = 60 + Math.random() * 150;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 14; y += (Math.random() - 0.3) * 12; g.lineTo(x, y); }
      g.stroke();
    }
    // tear streaks
    g.strokeStyle = 'rgba(20,10,15,0.45)'; g.lineWidth = 2.5;
    for (const ex of [128 - 22, 128 + 23]) {
      g.beginPath(); g.moveTo(ex, 112);
      g.bezierCurveTo(ex + 3, 140, ex - 3, 165, ex + 1, 200); g.stroke();
    }
  } else {
    // cheek warmth + stubble
    for (const ex of [128 - 30, 128 + 30]) {
      const gr = g.createRadialGradient(ex, 130, 2, ex, 130, 26);
      gr.addColorStop(0, 'rgba(160,70,50,0.18)'); gr.addColorStop(1, 'rgba(160,70,50,0)');
      g.fillStyle = gr; g.fillRect(ex - 30, 100, 60, 60);
    }
    for (let i = 0; i < 1600; i++) {
      const x = 128 + (Math.random() - 0.5) * 110, y = 150 + Math.random() * 60;
      g.fillStyle = 'rgba(30,18,12,0.25)'; g.fillRect(x, y, 1, 1);
    }
    // under-eye tiredness
    for (const ex of [128 - 21, 128 + 21]) {
      const gr = g.createRadialGradient(ex, 112, 2, ex, 112, 16);
      gr.addColorStop(0, 'rgba(60,30,30,0.25)'); gr.addColorStop(1, 'rgba(60,30,30,0)');
      g.fillStyle = gr; g.fillRect(ex - 20, 95, 40, 35);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- AMIR
export function makeAmir() {
  const root = new THREE.Group();
  const skin = std(0xffffff, { map: faceTexture(false), roughness: 0.55 });
  const skinPlain = std(0xa06a4a, { roughness: 0.55 });
  const hairM = std(0x0c0a09, { roughness: 0.45 });
  const jacket = std(0x1f2b24, { roughness: 0.85 });
  const shirt = std(0x7a6d58, { roughness: 0.9 });

  const torso = mesh(new THREE.CapsuleGeometry(0.16, 0.34, 8, 24), jacket, [0, 0.82, 0.02], [1.15, 1, 0.68]);
  root.add(torso);
  const collar = mesh(new THREE.TorusGeometry(0.075, 0.025, 10, 24), jacket, [0, 1.06, 0.02], [1.1, 1, 1]);
  collar.rotation.x = Math.PI / 2; root.add(collar);
  const tee = mesh(new THREE.SphereGeometry(0.06, 16, 8), shirt, [0, 1.03, 0.075], [1.1, 0.7, 0.4]);
  root.add(tee);
  const neck = mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 16), skinPlain, [0, 1.09, 0.0]);
  root.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.0);
  root.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.1, 48, 32), skin, [0, 0.11, 0.0], [0.92, 1.1, 1.02]);
  head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.074, 32, 24), skinPlain, [0, 0.06, 0.028], [1.0, 0.86, 1.02]);
  head.add(jaw);
  const chin = mesh(new THREE.SphereGeometry(0.03, 16, 12), skinPlain, [0, 0.022, 0.075], [1.2, 0.9, 0.9]);
  head.add(chin);
  const nose = mesh(new THREE.SphereGeometry(0.017, 16, 12), skinPlain, [0, 0.093, 0.1], [1.15, 1.0, 1.1]);
  head.add(nose);
  const bridge = mesh(new THREE.CapsuleGeometry(0.009, 0.035, 4, 8), skinPlain, [0, 0.115, 0.096]);
  bridge.rotation.x = -0.35; head.add(bridge);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.024, 16, 12), skinPlain, [s * 0.091, 0.105, -0.005], [0.38, 1.0, 0.7]);
    head.add(ear);
    const cheek = mesh(new THREE.SphereGeometry(0.026, 16, 12), skinPlain, [s * 0.042, 0.083, 0.058], [1, 0.75, 0.7]);
    head.add(cheek);
  }
  // hair: cap + fringe + sides
  const cap = mesh(new THREE.SphereGeometry(0.104, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, [0, 0.128, -0.012], [0.97, 1.1, 1.06]);
  cap.rotation.x = -0.55; head.add(cap);
  for (let i = 0; i < 0; i++) {
    const a = (i - 3) * 0.16;
    const f = mesh(new THREE.SphereGeometry(0.03, 12, 8), hairM, [Math.sin(a) * 0.075, 0.19 - Math.abs(i - 3) * 0.004, 0.06 + Math.cos(a) * 0.01], [1.1, 0.5, 0.9]);
    f.rotation.z = a * 0.8; head.add(f);
  }
  for (const s of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(0.012, 0.04, 0.02), hairM, [s * 0.087, 0.112, 0.03]));

  // eyes
  const eyes = [], lids = [], lowLids = [], brows = [];
  const white = std(0xf0ebe2, { roughness: 0.15 });
  const iris = std(0x2b1709, { roughness: 0.2 });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lidM = std(0x95603f, { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(s * 0.035, 0.127, 0.079);
    head.add(socket);
    const eye = new THREE.Group(); socket.add(eye);
    eye.add(mesh(new THREE.SphereGeometry(0.0175, 24, 16), white));
    eye.add(mesh(new THREE.SphereGeometry(0.0098, 20, 12), iris, [0, 0, 0.0128], [1, 1, 0.45]));
    eye.add(mesh(new THREE.SphereGeometry(0.0052, 12, 8), pupil, [0, 0, 0.0166], [1, 1, 0.4]));
    eye.add(mesh(new THREE.SphereGeometry(0.0021, 8, 6), glint, [0.004, 0.004, 0.0178]));
    eyes.push(eye);
    const lid = mesh(new THREE.SphereGeometry(0.0188, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), lidM);
    socket.add(lid); lids.push(lid);
    const low = mesh(new THREE.SphereGeometry(0.0186, 24, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), lidM);
    socket.add(low); lowLids.push(low);
    const brow = mesh(new THREE.BoxGeometry(0.036, 0.0075, 0.012), hairM, [s * 0.037, 0.154, 0.09]);
    head.add(brow); brows.push(brow);
  }
  // mouth
  const mouth = new THREE.Group();
  mouth.position.set(0, 0.058, 0.092);
  head.add(mouth);
  const inner = mesh(new THREE.SphereGeometry(0.02, 20, 12), new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 1 }));
  mouth.add(inner);
  const teeth = mesh(new THREE.BoxGeometry(0.026, 0.006, 0.006), std(0xe8e2d0, { roughness: 0.3 }), [0, 0.008, 0.004]);
  mouth.add(teeth);
  const lips = mesh(new THREE.TorusGeometry(0.019, 0.005, 10, 28), std(0x6a3526, { roughness: 0.45 }));
  mouth.add(lips);

  // sweat beads
  const sweat = [];
  const sweatM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.8 });
  for (const p of [[-0.03, 0.172, 0.085], [0.025, 0.168, 0.088], [0.06, 0.15, 0.07], [-0.065, 0.14, 0.066]]) {
    const d = mesh(new THREE.SphereGeometry(0.0042, 10, 8), sweatM, p, [1, 1.4, 1]);
    head.add(d); sweat.push(d);
  }

  // arms
  const armM = jacket;
  const limbs = [];
  for (const s of [-1, 1]) {
    const up = mesh(new THREE.CylinderGeometry(0.045, 0.04, 1, 12), armM);
    const lo = mesh(new THREE.CylinderGeometry(0.04, 0.034, 1, 12), armM);
    const hand = mesh(new THREE.SphereGeometry(0.038, 16, 12), skinPlain, null, [0.9, 0.7, 1.15]);
    const elbow = mesh(new THREE.SphereGeometry(0.042, 12, 10), armM);
    const shoulder = mesh(new THREE.SphereGeometry(0.06, 16, 12), armM, [s * 0.17, 0.98, 0.02]);
    root.add(up, lo, hand, elbow, shoulder);
    limbs.push({ s, up, lo, hand, elbow, sh: new THREE.Vector3(s * 0.19, 0.97, 0.02) });
  }

  const state = {
    headYaw: 0, headPitch: 0, headRoll: 0, eyeX: 0, eyeY: 0, blink: 0, wide: 0,
    browUp: 0, browWorry: 0, browAngry: 0, mouthOpen: 0, mouthWide: 0, sweat: 0,
    torsoYaw: 0, hands: null, breathe: 0, t: 0,
  };

  function apply() {
    const st = state;
    torso.rotation.y = st.torsoYaw * 0.6;
    torso.position.y = 0.82 + Math.sin(st.t * 2.2) * 0.004 * (1 + st.breathe * 3);
    torso.scale.z = 0.68 + Math.sin(st.t * (2.2 + st.breathe * 4)) * 0.01 * (1 + st.breathe * 3);
    head.rotation.set(st.headPitch, st.headYaw + st.torsoYaw * 0.3, st.headRoll, 'YXZ');
    for (let i = 0; i < 2; i++) {
      eyes[i].rotation.set(-st.eyeY * 0.5, st.eyeX * 0.6, 0);
      // lid: -0.5 relaxed open, 1.57 closed, wide eyes open further
      const open = lerp(-0.42, -0.85, st.wide);
      lids[i].rotation.x = lerp(open, 1.62, clamp01(st.blink));
      lowLids[i].rotation.x = lerp(0, -0.2, st.wide);
      const s = i === 0 ? -1 : 1;
      const b = brows[i];
      b.position.y = 0.154 + st.browUp * 0.012 + st.browWorry * 0.004 - st.browAngry * 0.006;
      b.rotation.z = s * (-st.browWorry * 0.38 + st.browAngry * 0.35);
    }
    const open = clamp01(st.mouthOpen);
    inner.scale.set(1 + st.mouthWide * 0.35, 0.08 + open * 0.85, 0.35);
    lips.scale.set(1 + st.mouthWide * 0.35, 0.22 + open * 0.95, 1);
    teeth.visible = open > 0.15;
    teeth.position.y = 0.006 + open * 0.008;
    for (const d of sweat) d.visible = st.sweat > 0.2;
    sweat.forEach((d, i) => { d.position.y = [0.172, 0.168, 0.15, 0.14][i] - ((st.t * 0.01 + i * 0.3) % 1) * 0.02 * st.sweat; });
    // arms
    for (const L of limbs) {
      const sh = L.sh.clone();
      const handP = st.hands ? st.hands[L.s < 0 ? 0 : 1].clone() : new THREE.Vector3(L.s * 0.2, 0.75, -0.25);
      const el = elbowFor(sh, handP, 0.29, 0.27, new THREE.Vector3(L.s * 0.6, -1, 0.15));
      stretch(L.up, sh, el); stretch(L.lo, el, handP);
      L.elbow.position.copy(el); L.hand.position.copy(handP);
    }
  }
  apply();
  return { root, head, state, apply };
}

// ---------------------------------------------------------------- GHOST
export function makeGhost() {
  const root = new THREE.Group();
  const skin = std(0xffffff, { map: faceTexture(true), roughness: 0.75, emissive: 0x0d1416 });
  const skinPlain = std(0xbcc5c3, { roughness: 0.75, emissive: 0x0a1012 });
  const hairM = std(0x040404, { roughness: 0.55, side: THREE.DoubleSide });
  const dressM = std(0xd8d8cf, { roughness: 0.95, side: THREE.DoubleSide, emissive: 0x1a1e20 });

  // tattered lathe dress
  const prof = [[0.34, -0.02], [0.3, 0.2], [0.25, 0.5], [0.2, 0.8], [0.16, 1.02], [0.17, 1.15], [0.19, 1.28], [0.17, 1.36], [0.1, 1.42], [0.05, 1.45]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const dg = new THREE.LatheGeometry(prof, 64);
  const pa = dg.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    const k = Math.max(0, 1 - y / 1.1);
    const nr = r + (Math.sin(a * 9 + y * 2.5) * 0.018 + Math.sin(a * 23) * 0.006) * k;
    let ny = y;
    if (y < 0.05) ny = y - Math.abs(Math.sin(a * 13) * 0.08 + Math.sin(a * 31) * 0.04);
    pa.setXYZ(i, Math.cos(a) * nr, ny, Math.sin(a) * nr);
  }
  dg.computeVertexNormals();
  const dress = new THREE.Mesh(dg, dressM);
  root.add(dress);

  // arms (sleeves) + pale long fingers
  const arms = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.17, 1.34, 0);
    const sleeve = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.62, 12, 1, true), dressM, [0, -0.31, 0]);
    g.add(sleeve);
    const hand = new THREE.Group(); hand.position.set(0, -0.64, 0); g.add(hand);
    hand.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), skinPlain, [0, 0, 0], [0.8, 1.2, 0.6]));
    for (let f = 0; f < 4; f++) {
      const fi = mesh(new THREE.CylinderGeometry(0.0055, 0.004, 0.11, 6), skinPlain, [(f - 1.5) * 0.012, -0.075, 0.005]);
      fi.rotation.z = (f - 1.5) * 0.06; hand.add(fi);
      const nail = mesh(new THREE.ConeGeometry(0.0045, 0.02, 6), std(0x1a1414), [(f - 1.5) * 0.0135, -0.138, 0.005]);
      nail.rotation.x = Math.PI; hand.add(nail);
    }
    g.rotation.z = s * 0.08;
    root.add(g); arms.push(g);
  }

  root.add(mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.12, 12), skinPlain, [0, 1.47, 0]));
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  root.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.098, 48, 32), skin, [0, 0.1, 0], [0.86, 1.14, 0.98]));
  head.add(mesh(new THREE.SphereGeometry(0.066, 24, 16), skinPlain, [0, 0.05, 0.022], [0.95, 0.95, 1]));
  head.add(mesh(new THREE.SphereGeometry(0.013, 12, 10), skinPlain, [0, 0.085, 0.091], [1, 1.25, 1]));
  // hollow eye sockets
  const sockM = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const pupils = [];
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.022, 20, 14), sockM, [s * 0.033, 0.118, 0.07], [1.05, 0.78, 0.55]));
    const p = mesh(new THREE.SphereGeometry(0.0042, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }), [s * 0.033, 0.117, 0.0805]);
    head.add(p); pupils.push(p);
  }
  // mouth: void + jagged teeth + grey lips
  const mouth = new THREE.Group(); mouth.position.set(0, 0.045, 0.083); head.add(mouth);
  const voidM = mesh(new THREE.SphereGeometry(0.02, 20, 12), sockM);
  mouth.add(voidM);
  const lip = mesh(new THREE.TorusGeometry(0.019, 0.0035, 8, 28), std(0x4c3a44, { roughness: 0.5 }));
  mouth.add(lip);
  const teeth = new THREE.Group(); mouth.add(teeth);
  const toothM = std(0xd8d0b4, { roughness: 0.35 });
  for (let i = 0; i < 12; i++) {
    const top = i < 6; const k = (i % 6) - 2.5;
    const tt = mesh(new THREE.ConeGeometry(0.0032, 0.011 + (Math.abs(k) < 1 ? 0.004 : 0), 5), toothM, [k * 0.0062, top ? 0.01 : -0.01, 0.004]);
    if (top) tt.rotation.x = Math.PI;
    teeth.add(tt);
  }

  // hair: scalp cap + long back curtain + front strands
  { const gc = mesh(new THREE.SphereGeometry(0.1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, [0, 0.122, -0.01], [0.9, 1.14, 1.03]); gc.rotation.x = -0.5; head.add(gc); }
  const backG = new THREE.CylinderGeometry(0.095, 0.24, 1.0, 48, 24, true, Math.PI * 0.36, Math.PI * 1.28);
  const bp = backG.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const a = Math.atan2(z, x), k = (0.5 - y);
    const r = Math.hypot(x, z) + Math.sin(a * 17 + y * 4) * 0.012 * k;
    let ny = y; if (y < -0.45) ny = y - Math.abs(Math.sin(a * 29)) * 0.12;
    bp.setXYZ(i, Math.cos(a) * r, ny, Math.sin(a) * r);
  }
  backG.computeVertexNormals();
  const back = mesh(backG, hairM, [0, -0.32, -0.01]);
  head.add(back);

  function strands(cover) {
    const g = new THREE.Group();
    const n = 46;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;            // -0.5..0.5 across the face
      const ang = u * 2.6;
      const sx = Math.sin(ang) * 0.088, sz = Math.cos(ang) * 0.088;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        const y = 0.2 - f * (cover ? 0.75 : 0.7) - Math.random() * 0.02;
        let x, z;
        if (cover) {
          x = sx * (1 - f * 0.25) + (Math.random() - 0.5) * 0.008;
          z = sz * 0.9 + 0.05 * Math.sin(Math.min(1, f * 2.2) * Math.PI * 0.5) + 0.01 - f * 0.02;
        } else {
          const side = Math.sign(u) || 1;
          x = side * (0.075 + 0.04 * Math.min(1, f * 2)) + u * 0.06;
          z = 0.03 - f * 0.05 + (Math.random() - 0.5) * 0.01;
        }
        pts.push(new THREE.Vector3(x, y, z));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.006 + Math.random() * 0.004, 5, false);
      g.add(new THREE.Mesh(tube, hairM));
    }
    return g;
  }
  const cover = strands(true), parted = strands(false);
  head.add(cover, parted);

  const state = { headYaw: 0, headPitch: 0, headRoll: 0, cover: 0, mouthOpen: 0, grin: 0, glow: 1, armsUp: 0, t: 0, sway: 1 };
  function apply() {
    const s = state;
    head.rotation.set(s.headPitch + Math.sin(s.t * 1.3) * 0.02 * s.sway, s.headYaw, s.headRoll + Math.sin(s.t * 0.9) * 0.03 * s.sway, 'YXZ');
    cover.visible = s.cover > 0.5; parted.visible = !cover.visible;
    back.rotation.y = Math.sin(s.t * 0.7) * 0.03;
    const o = clamp01(s.mouthOpen);
    voidM.scale.set(1 + s.grin * 1.6, 0.12 + o * 2.2, 0.5);
    lip.scale.set(1 + s.grin * 1.6, 0.2 + o * 2.3, 1);
    teeth.scale.set(1 + s.grin * 1.5, 1 + o * 2.2, 1);
    teeth.visible = o > 0.05 || s.grin > 0.3;
    for (const p of pupils) { p.visible = s.glow > 0.02; p.scale.setScalar(0.6 + s.glow * 0.6); }
    arms.forEach((a, i) => { a.rotation.x = -s.armsUp * 1.4; a.rotation.z = (i ? 1 : -1) * (0.08 + s.armsUp * 0.15); });
  }
  apply();
  return { root, head, state, apply, dress, arms };
}
