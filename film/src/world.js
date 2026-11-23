// Environment: kampung road at 2 AM, rubber trees, palms, a stilt house,
// the old banyan (pokok beringin), the car (with interior + live rear-view mirror).
import * as THREE from 'three';

let seed = 1337;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const at = (m, p) => { m.position.copy(p); return m; };
const M = (g, m, p) => { const x = new THREE.Mesh(g, m); if (p) x.position.set(...p); return x; };

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

export function cloudTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 40; i++) {
      const x = 64 + rnd() * 128, y = 64 + rnd() * 128, r = 30 + rnd() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
}

export function buildWorld(scene, { treeZ, tree2Z, houseZ, roadEnd }) {
  const world = new THREE.Group(); scene.add(world);

  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vp; float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){ float y = max(vp.y,0.); vec3 c = mix(vec3(0.045,0.06,0.075), vec3(0.008,0.012,0.022), pow(y,0.6));
      float s = step(0.9985, h(floor(vp.xz*420.+vp.y*300.))) * smoothstep(0.15,0.6,y); c += s*0.5; gl_FragColor = vec4(c,1.); }`,
  }));
  scene.add(sky);
  // moon + halo
  const moon = M(new THREE.SphereGeometry(14, 32, 16), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }), [-260, 300, -620]);
  scene.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(200,215,255,0.55)'); gr.addColorStop(0.25, 'rgba(160,180,230,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }),
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  halo.position.copy(moon.position); halo.scale.set(160, 160, 1); scene.add(halo);

  // ground
  const groundTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1b2116'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 20 + rnd() * 30; g.fillStyle = `rgba(${v},${v + 12},${v * 0.6},${0.5})`; g.fillRect(rnd() * w, rnd() * h, 2, 2 + rnd() * 4); }
  }, [80, 400]);
  const ground = M(new THREE.PlaneGeometry(400, 2000), std(0xffffff, { map: groundTex, roughness: 1 }), [0, -0.01, -700]);
  ground.rotation.x = -Math.PI / 2; world.add(ground);

  // road (left-hand traffic; car drives at x = -1.6)
  const roadTex = canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#26282a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) { const v = 25 + rnd() * 40; g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
    g.fillStyle = 'rgba(210,200,150,0.55)';
    for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y, 6, 64);
    g.fillStyle = 'rgba(220,220,210,0.4)'; g.fillRect(10, 0, 4, h); g.fillRect(w - 14, 0, 4, h);
    g.strokeStyle = 'rgba(10,10,10,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 25; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 25; i++) { g.fillStyle = 'rgba(15,15,15,0.5)'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 20, 6 + rnd() * 15, 0, 0, 7); g.fill(); }
  }, [1, 140]);
  const road = M(new THREE.PlaneGeometry(7, 1400), std(0xffffff, { map: roadTex, roughness: 0.75 }), [0, 0.01, -600]);
  road.rotation.x = -Math.PI / 2; world.add(road);

  // grass tufts
  const tuftG = new THREE.ConeGeometry(0.12, 0.5, 4);
  const tufts = new THREE.InstancedMesh(tuftG, std(0x24311c, { roughness: 1 }), 6000);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < 6000; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    v.set(side * (3.7 + rnd() * 18), 0.2, 60 - rnd() * 760);
    e.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4); q.setFromEuler(e);
    const k = 0.6 + rnd() * 1.4; s.set(k, k * (0.6 + rnd()), k);
    tufts.setMatrixAt(i, m4.compose(v, q, s));
  }
  world.add(tufts);

  // rubber trees (instanced)
  const nT = 900;
  const trunkG = new THREE.CylinderGeometry(0.12, 0.2, 1, 7); trunkG.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkG, std(0x3a332b, { roughness: 1 }), nT);
  const leafG = new THREE.IcosahedronGeometry(1, 1);
  const leaves = new THREE.InstancedMesh(leafG, std(0x16261a, { roughness: 1, flatShading: true }), nT * 4);
  let li = 0;
  const avoid = (z) => [treeZ, tree2Z, houseZ].some((c) => Math.abs(z - c) < 16);
  for (let i = 0; i < nT; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    let z = 70 - rnd() * 780;
    let x = side * (7 + rnd() * 45);
    if (avoid(z) && Math.abs(x) < 20) x = side * (20 + rnd() * 25);
    const hgt = 7 + rnd() * 7;
    e.set((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12); q.setFromEuler(e);
    trunks.setMatrixAt(i, m4.compose(v.set(x, 0, z), q, s.set(1, hgt, 1)));
    for (let k = 0; k < 4; k++) {
      const r = 1.4 + rnd() * 1.6;
      e.set(rnd(), rnd(), rnd()); q.setFromEuler(e);
      leaves.setMatrixAt(li++, m4.compose(v.set(x + (rnd() - 0.5) * 3, hgt - 0.5 + rnd() * 2.5, z + (rnd() - 0.5) * 3), q, s.set(r, r * 0.75, r)));
    }
  }
  leaves.count = li;
  world.add(trunks, leaves);

  // coconut palms + banana near the house
  const palmM = std(0x4a4034, { roughness: 1 });
  const frondM = std(0x1c2c17, { roughness: 1, side: THREE.DoubleSide });
  function palm(x, z, h) {
    const g = new THREE.Group();
    const lean = (rnd() - 0.5) * 2.5;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.3, h * 0.5, 0), new THREE.Vector3(lean, h, 0)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.16, 7), palmM));
    for (let k = 0; k < 10; k++) {
      const fg = new THREE.PlaneGeometry(0.5, 3.4, 1, 8); fg.translate(0, 1.7, 0);
      const p = fg.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -0.12 * y * y); p.setX(i, p.getX(i) * (1 - y / 3.6)); }
      fg.computeVertexNormals();
      const f = new THREE.Mesh(fg, frondM);
      f.position.set(lean, h, 0); f.rotation.set(1.0 + rnd() * 0.5, (k / 10) * Math.PI * 2, 0, 'YXZ');
      g.add(f);
    }
    g.position.set(x, 0, z); world.add(g);
  }
  for (let i = 0; i < 12; i++) palm(10 + rnd() * 14 * (rnd() < 0.3 ? -2.4 : 1), houseZ + (rnd() - 0.5) * 40, 7 + rnd() * 4);
  for (let i = 0; i < 8; i++) palm(-8 - rnd() * 10, tree2Z + 30 + (rnd() - 0.5) * 50, 6 + rnd() * 4);

  // power poles + sagging wires along the right side
  const poleM = std(0x3a3631, { roughness: 1 });
  const wireM = new THREE.MeshBasicMaterial({ color: 0x050505 });
  let prev = null;
  for (let z = 60; z > -720; z -= 38) {
    const pole = M(new THREE.CylinderGeometry(0.09, 0.12, 8, 8), poleM, [5.6, 4, z]); world.add(pole);
    world.add(M(new THREE.BoxGeometry(1.4, 0.08, 0.08), poleM, [5.6, 7.6, z]));
    if (prev !== null) for (const dx of [-0.6, 0.6]) {
      const a = new THREE.Vector3(5.6 + dx, 7.6, prev), b = new THREE.Vector3(5.6 + dx, 7.6, z);
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.9;
      world.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.012, 3), wireM));
    }
    prev = z;
  }

  // kampung stilt house with one warm window
  const house = new THREE.Group();
  const plankTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a3624'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.3})`; g.fillRect(0, y, w, 2); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,20,10,0.3)'; g.fillRect(rnd() * w, y + rnd() * 14, 20 + rnd() * 40, 1); } }
  }, [3, 2]);
  const wood = std(0xffffff, { map: plankTex, roughness: 0.95 });
  for (let i = 0; i < 9; i++) house.add(M(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 6), wood, [(i % 3 - 1) * 3.4, 0.85, (Math.floor(i / 3) - 1) * 2.8]));
  house.add(M(new THREE.BoxGeometry(7.4, 0.2, 6.2), wood, [0, 1.75, 0]));
  house.add(M(new THREE.BoxGeometry(7, 2.8, 5.8), wood, [0, 3.25, 0]));
  const roofM = std(0x3b3532, { roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
  for (const sd of [-1, 1]) { const r = M(new THREE.PlaneGeometry(8.4, 4.4), roofM, [0, 5.6, sd * 1.6]); r.rotation.x = -Math.PI / 2 + sd * -0.75; house.add(r); }
  const gable = new THREE.Shape([new THREE.Vector2(-2.9, 0), new THREE.Vector2(2.9, 0), new THREE.Vector2(0, 2.1)]);
  for (const sd of [-1, 1]) { const gb = M(new THREE.ShapeGeometry(gable), wood, [sd * 3.5, 4.65, 0]); gb.rotation.y = Math.PI / 2; house.add(gb); }
  const winM = new THREE.MeshBasicMaterial({ color: 0xffa04a });
  const win = M(new THREE.PlaneGeometry(1.1, 1.0), winM, [-3.52, 3.4, 0.6]); win.rotation.y = -Math.PI / 2; house.add(win);
  for (let k = 0; k < 2; k++) house.add(M(new THREE.BoxGeometry(0.06, 1.05, 0.06), wood, [-3.54, 3.4, 0.6 + (k - 0.5) * 0.5]));
  const win2 = M(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0x15100a }), [-3.52, 3.4, -1.6]); win2.rotation.y = -Math.PI / 2; house.add(win2);
  const stairs = new THREE.Group();
  for (let i = 0; i < 6; i++) stairs.add(M(new THREE.BoxGeometry(1.2, 0.08, 0.3), wood, [0, 0.3 * i, -0.3 * i]));
  stairs.position.set(-4.0, 0, 1.6); stairs.rotation.y = Math.PI / 2; house.add(stairs);
  const winLight = new THREE.PointLight(0xff9a40, 6, 14, 2); winLight.position.set(-4.6, 3.4, 0.6); house.add(winLight);
  house.position.set(17, 0, houseZ); house.rotation.y = 0.1; world.add(house);

  // a dim sodium street lamp
  const lampG = new THREE.Group();
  lampG.add(M(new THREE.CylinderGeometry(0.07, 0.09, 6.5, 8), poleM, [0, 3.25, 0]));
  lampG.add(M(new THREE.BoxGeometry(1.4, 0.07, 0.07), poleM, [-0.7, 6.45, 0]));
  const bulb = M(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb060 }), [-1.35, 6.32, 0]);
  lampG.add(bulb);
  const lampLight = new THREE.SpotLight(0xff9a45, 140, 22, 0.9, 0.7, 2);
  lampLight.position.set(-1.35, 6.2, 0); lampLight.target.position.set(-1.6, 0, 0); lampG.add(lampLight, lampLight.target);
  lampG.position.set(4.3, 0, houseZ + 22); world.add(lampG);

  // banyan trees
  const bark = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#3e3a33'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${10 + rnd() * 30},${10 + rnd() * 25},${10 + rnd() * 20},0.6)`; g.lineWidth = 1 + rnd() * 3; let x = rnd() * w, y = 0; g.beginPath(); g.moveTo(x, y); while (y < h) { x += (rnd() - 0.5) * 10; y += 10 + rnd() * 20; g.lineTo(x, y); } g.stroke(); }
  }, [3, 2]);
  const barkM = std(0xffffff, { map: bark, roughness: 1 });
  const canopyM = std(0x0e1a10, { roughness: 1, flatShading: true });
  function banyan(x, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 0.45;
      const tr = M(new THREE.CylinderGeometry(0.35 + rnd() * 0.2, 0.6 + rnd() * 0.3, 7, 10), barkM, [Math.cos(a) * r, 3.4, Math.sin(a) * r]);
      tr.rotation.set((rnd() - 0.5) * 0.2, rnd() * 3, (rnd() - 0.5) * 0.2); g.add(tr);
      const root = M(new THREE.ConeGeometry(0.45, 2.4, 6), barkM, [Math.cos(a) * 1.3, 0.5, Math.sin(a) * 1.3]);
      root.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); g.add(root);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd();
      const br = M(new THREE.CylinderGeometry(0.15, 0.35, 7, 8), barkM);
      br.position.set(Math.cos(a) * 2.6, 7.6, Math.sin(a) * 2.6);
      br.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0); g.add(br);
    }
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 9;
      const c = M(new THREE.IcosahedronGeometry(2.2 + rnd() * 2.2, 1), canopyM, [Math.cos(a) * r, 9 + rnd() * 3.2, Math.sin(a) * r]);
      c.scale.y = 0.6; g.add(c);
    }
    const rootM = std(0x2d2924, { roughness: 1 });
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, r = 1.5 + rnd() * 7.5;
      const len = 3 + rnd() * 5.5;
      const hr = M(new THREE.CylinderGeometry(0.02, 0.035, len, 4), rootM, [Math.cos(a) * r, 9 - len / 2, Math.sin(a) * r]);
      hr.rotation.z = (rnd() - 0.5) * 0.08; g.add(hr);
    }
    const cloth = M(new THREE.TorusGeometry(0.98, 0.09, 8, 32), std(0x8f7a2a, { roughness: 0.95 }), [0, 1.4, 0]);
    cloth.rotation.x = Math.PI / 2; cloth.scale.set(1, 1.1, 2.2); g.add(cloth);
    g.position.set(x, 0, z); world.add(g);
    return g;
  }
  const tree1 = banyan(-9.2, treeZ);
  const tree2 = banyan(-8.8, tree2Z);

  // drifting ground fog
  const fogTex = cloudTexture();
  const fogs = [];
  for (let i = 0; i < 260; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, transparent: true, depthWrite: false, color: 0x8796a6, opacity: 0.05 + rnd() * 0.07 }));
    const k = 10 + rnd() * 16;
    sp.scale.set(k, k * 0.35, 1);
    sp.position.set((rnd() - 0.5) * 50, 0.8 + rnd() * 2.6, 70 - rnd() * 760);
    sp.userData.v = 0.2 + rnd() * 0.5;
    sp.userData.x0 = sp.position.x;
    world.add(sp); fogs.push(sp);
  }

  return { world, tree1, tree2, house, fogs, lampLight, winLight, bulb, sky, moon, halo };
}

// -------------------------------------------------------------- CAR
export function buildCar({ wrecked = false } = {}) {
  const car = new THREE.Group();
  const paint = std(0x5c1212, { roughness: 0.32, metalness: 0.55 });
  const black = std(0x0b0b0c, { roughness: 0.7 });
  const trim = std(0x1a1a1c, { roughness: 0.5 });

  // lower body (side profile extruded across the width); front of car = -z
  const sh = new THREE.Shape();
  const prof = [[2.18, 0.34], [2.2, 0.76], [2.0, 0.94], [0.75, 0.99], [-1.75, 1.01], [-2.18, 0.97], [-2.2, 0.36], [-1.85, 0.3], [1.85, 0.3]];
  sh.moveTo(...prof[0]); prof.slice(1).forEach((p) => sh.lineTo(...p)); sh.closePath();
  const bodyG = new THREE.ExtrudeGeometry(sh, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, steps: 1 });
  bodyG.translate(0, 0, -0.81); bodyG.rotateY(Math.PI / 2);
  // rotateY(+90): shape x -> -z, so +x (2.2) becomes front at z=-2.2
  const body = new THREE.Mesh(bodyG, paint);
  car.add(body);

  // greenhouse: roof, pillars, glass
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x14202a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28 });
  const beam = (a, b, t, m) => { const x = new THREE.Mesh(new THREE.BoxGeometry(t, 1, t), m); const d = b.clone().sub(a); x.position.copy(a).addScaledVector(d, 0.5); x.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); x.scale.y = d.length(); car.add(x); return x; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.05, 1.36), paint); roof.position.set(0, 1.42, 0.52); car.add(roof);
  const liner = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.02, 1.32), std(0x4a463f, { roughness: 1 })); liner.position.set(0, 1.39, 0.52); car.add(liner);
  for (const s of [-1, 1]) {
    beam(V(s * 0.79, 0.99, -0.76), V(s * 0.73, 1.42, -0.15), 0.07, paint);
    beam(V(s * 0.8, 0.99, 0.56), V(s * 0.74, 1.42, 0.56), 0.08, paint);
    beam(V(s * 0.79, 1.0, 1.75), V(s * 0.73, 1.42, 1.2), 0.09, paint);
  }
  const quad = (pts, m) => { const g = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]); g.computeVertexNormals(); const x = new THREE.Mesh(g, m); car.add(x); return x; };
  quad([V(-0.78, 0.99, -0.76), V(0.78, 0.99, -0.76), V(0.72, 1.42, -0.15), V(-0.72, 1.42, -0.15)], glassM);
  quad([V(0.78, 1.0, 1.75), V(-0.78, 1.0, 1.75), V(-0.72, 1.42, 1.2), V(0.72, 1.42, 1.2)], glassM);
  quad([V(0.8, 0.99, -0.74), V(0.8, 0.99, 1.74), V(0.74, 1.41, 1.2), V(0.74, 1.41, -0.16)], glassM);
  quad([V(-0.8, 0.99, 1.74), V(-0.8, 0.99, -0.74), V(-0.74, 1.41, -0.16), V(-0.74, 1.41, 1.2)], glassM);

  // wheels
  for (const [x, z] of [[-0.78, -1.35], [0.78, -1.35], [-0.78, 1.35], [0.78, 1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.22, 20), black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.31, z); car.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.23, 12), std(0x777777, { metalness: 0.8, roughness: 0.3 })); hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.31, z); car.add(hub);
  }
  // lights
  const headM = new THREE.MeshBasicMaterial({ color: 0xfff4dc });
  const tailM = new THREE.MeshBasicMaterial({ color: 0xff1a10 });
  const heads = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.04), headM); h.position.set(s * 0.58, 0.72, -2.24); car.add(h); heads.push(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.04), tailM); t.position.set(s * 0.6, 0.78, 2.22); car.add(t);
  }
  car.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.04), black), V(0, 0.55, -2.25)));
  const plateTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#eee'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText('PKA 2002', 128, 48); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshBasicMaterial({ map: plateTex })); plate.position.set(0, 0.5, 2.235); car.add(plate);
  const plateF = plate.clone(); plateF.position.set(0, 0.45, -2.255); plateF.rotation.y = Math.PI; car.add(plateF);

  const rig = { car, heads, body };
  if (wrecked) {
    // crumple the front against the tree
    const p = bodyG.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < -0.9) { p.setZ(i, -0.9 + (z + 0.9) * 0.35 + Math.sin(p.getX(i) * 9) * 0.06); p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 7 + z) * 0.08); } }
    bodyG.computeVertexNormals();
    heads[0].visible = false;
    return rig;
  }

  // ---------------- interior
  const seatM = std(0x2a2622, { roughness: 0.95 });
  const dashM = std(0x17171a, { roughness: 0.8 });
  for (const s of [-1, 1]) {
    car.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.52), seatM), V(s * 0.38, 0.5, 0.2)));
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.13), seatM); back.position.set(s * 0.38, 0.86, 0.47); back.rotation.x = -0.15; car.add(back);
    const hr = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.1), seatM); hr.position.set(s * 0.38, 1.28, 0.54); hr.rotation.x = -0.12; car.add(hr);
    car.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 1.0), std(0x26221f, { roughness: 1 })), V(s * 0.79, 0.62, -0.2)));
    car.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 1.1), std(0x26221f, { roughness: 1 })), V(s * 0.79, 0.62, 1.1)));
  }
  car.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.55), seatM), V(0, 0.5, 1.15)));
  const bb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.14), seatM); bb.position.set(0, 0.85, 1.48); bb.rotation.x = -0.18; car.add(bb);
  car.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.4), dashM), V(0, 1.0, 1.6)));
  car.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.05, 2.6), std(0x111111, { roughness: 1 })), V(0, 0.33, 0.4)));
  // dashboard
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.26, 0.42), dashM); dash.position.set(0, 0.86, -0.58); car.add(dash);
  const dashTop = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.56, 16, 1, false, 0, Math.PI), dashM); dashTop.rotation.z = Math.PI / 2; dashTop.position.set(0, 0.96, -0.62); car.add(dashTop);
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0x0f3b3c })); cluster.position.set(0.38, 1.0, -0.39); cluster.rotation.x = -0.4; car.add(cluster);
  for (const dx of [-0.07, 0.07]) { const g = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 24), new THREE.MeshBasicMaterial({ color: 0x5ff2e0 })); g.position.set(0.38 + dx, 1.003, -0.388); g.rotation.x = -0.4; car.add(g); }
  // radio with canvas display
  const radioCanvas = document.createElement('canvas'); radioCanvas.width = 256; radioCanvas.height = 96;
  const radioTex = new THREE.CanvasTexture(radioCanvas); radioTex.colorSpace = THREE.SRGBColorSpace;
  const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.04), std(0x0d0d0e)); radioBox.position.set(0, 0.86, -0.37); car.add(radioBox);
  const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.075), new THREE.MeshBasicMaterial({ map: radioTex, toneMapped: false })); radio.position.set(0, 0.86, -0.348); car.add(radio);
  for (const dx of [-0.11, 0.11]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), trim); k.rotation.x = Math.PI / 2; k.position.set(dx, 0.86, -0.345); car.add(k); }
  // steering wheel (right-hand drive)
  const wheel = new THREE.Group(); wheel.position.set(0.38, 0.98, -0.3); wheel.rotation.x = -1.15; car.add(wheel);
  const wheelSpin = new THREE.Group(); wheel.add(wheelSpin);
  wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.017, 10, 40), std(0x111111, { roughness: 0.5 })));
  for (const a of [0, 2.1, 4.2]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.012), trim); sp.position.set(Math.sin(a) * 0.085, -Math.cos(a) * 0.085, 0); sp.rotation.z = a; wheelSpin.add(sp); }
  wheelSpin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16).rotateX(Math.PI / 2), trim));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), trim); column.position.set(0.38, 0.9, -0.45); column.rotation.x = 0.43; car.add(column);
  // rear-view mirror (live)
  const mirrorRT = new THREE.WebGLRenderTarget(1024, 384, { type: THREE.HalfFloatType });
  const mirror = new THREE.Group(); mirror.position.set(0, 1.27, -0.36); car.add(mirror);
  mirror.add(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.085, 0.03), std(0x111111, { roughness: 0.4 })));
  const mirrorFace = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.07), new THREE.MeshBasicMaterial({ map: mirrorRT.texture, color: 0xaaaaaa }));
  mirrorRT.texture.wrapS = THREE.RepeatWrapping; mirrorRT.texture.repeat.x = -1; mirrorRT.texture.offset.x = 1;
  mirrorFace.position.z = 0.0155; mirror.add(mirrorFace);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), trim); stem.position.set(0, 1.34, -0.37); car.add(stem);
  mirror.rotation.set(-0.1, 0.12, 0);
  const mirrorCam = new THREE.PerspectiveCamera(17, 1024 / 384, 0.05, 300);
  mirrorCam.position.set(0, 0, 0.05); mirrorCam.rotation.set(0.06, Math.PI, 0); mirror.add(mirrorCam);
  // tasbih hanging from the mirror
  const beads = new THREE.Group(); beads.position.set(0, 1.24, -0.36); car.add(beads);
  for (let i = 0; i < 14; i++) { const a = (i / 13) * Math.PI; beads.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), std(0x3b2414, { roughness: 0.4 })), V(Math.cos(a) * 0.03, -Math.sin(a) * 0.12, 0))); }

  // lights
  const headLights = [];
  for (const s of [-1, 1]) {
    const L = new THREE.SpotLight(0xfff0d0, 900, 70, 0.42, 0.55, 2);
    L.position.set(s * 0.58, 0.75, -2.3); L.target.position.set(s * 0.6 - 0.15, 0, -30);
    car.add(L, L.target); headLights.push(L);
  }
  const dashLight = new THREE.PointLight(0x46d6c8, 0.6, 1.6, 2); dashLight.position.set(0.3, 1.05, -0.35); car.add(dashLight);
  const radioLight = new THREE.PointLight(0x7fe9ff, 0.0, 1.2, 2); radioLight.position.set(0, 0.95, -0.25); car.add(radioLight);
  const domeLight = new THREE.PointLight(0xffe2b0, 0.0, 2.6, 2); domeLight.position.set(0, 1.35, 0.5); car.add(domeLight);
  const backFill = new THREE.PointLight(0x7f9ccf, 0.0, 2.0, 2); backFill.position.set(0, 1.25, 0.6); car.add(backFill);
  const faceKey = new THREE.SpotLight(0xcfd8ff, 0, 3, 0.6, 0.9, 2); faceKey.position.set(-0.35, 1.35, -0.45); faceKey.target.position.set(0.38, 1.22, 0.15); car.add(faceKey, faceKey.target);

  // fake volumetric beams
  const beamTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,245,225,0.5)'); gr.addColorStop(1, 'rgba(255,245,225,1)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); return new THREE.CanvasTexture(c); })();
  const beams = [];
  for (const s of [-1, 1]) {
    const bg = new THREE.CylinderGeometry(0.1, 3.2, 26, 24, 1, true); bg.translate(0, -13, 0);
    const b = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    b.position.set(s * 0.58, 0.74, -2.3); b.rotation.x = Math.PI / 2 - 0.035; car.add(b); beams.push(b);
  }

  Object.assign(rig, { wheel, wheelSpin, mirror, mirrorCam, mirrorRT, mirrorFace, radio, radioCanvas, radioTex, headLights, dashLight, radioLight, domeLight, backFill, faceKey, beams, beads, cluster });
  return rig;
}
