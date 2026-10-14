// Procedural forest clearings: ground, instanced trees, obstacles, lighting
// themes, props (exit, shrine, cache, standing stones, torches) and collision.

import * as THREE from "three";
import { TAU } from "./state.js";

export const THEMES = [
  { name: "The Greenwood", sky: 0x9cc7e0, fog: 0xa9c8b0, fogD: 0.017, sun: 0xfff1d6, sunI: 2.6, sunDir: [-0.5, 1, 0.35], hemi: [0xcfe6ff, 0x4a5a2a, 1.1],
    grass: [0x4d7a2e, 0x6e9c3c], dirt: 0x7a5c3a, leaf: [0x2f6b2a, 0x3f7f2f, 0x5a8f32], fire: 0.15, mood: 0, lantern: 0 },
  { name: "Deepwood at Dusk", sky: 0xe39a6c, fog: 0xc08468, fogD: 0.021, sun: 0xffa868, sunI: 2.2, sunDir: [-1, 0.45, 0.2], hemi: [0xffc8a0, 0x4a3a40, 1.1],
    grass: [0x4a6a2a, 0x6b7a32], dirt: 0x6a4a30, leaf: [0x3a5a22, 0x6a6a20, 0x8a5a1a], fire: 0.55, mood: 1, lantern: 6 },
  { name: "Witchmoor Mists", sky: 0x3e4e5c, fog: 0x56646e, fogD: 0.026, sun: 0xb8ccff, sunI: 2.0, sunDir: [0.4, 1, 0.6], hemi: [0xa8bcd8, 0x34443a, 1.6],
    grass: [0x3a5a3e, 0x4e6a44], dirt: 0x4d4a42, leaf: [0x24443a, 0x305444, 0x44543a], fire: 1, mood: 2, lantern: 14 },
  { name: "Nottingham Road", sky: 0x1e1e30, fog: 0x30263a, fogD: 0.022, sun: 0xb8c0ff, sunI: 1.7, sunDir: [0.3, 1, 0.5], hemi: [0x9a90c0, 0x3a3028, 1.4],
    grass: [0x46503a, 0x58584a], dirt: 0x6a6058, leaf: [0x24322a, 0x323c2e, 0x3c3a32], fire: 0.8, mood: 3, torches: true, stones: true, lantern: 16 },
];

export const themeFor = (floor) => THEMES[floor >= 7 ? 3 : floor >= 5 ? 2 : floor >= 3 ? 1 : 0];

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });
const MATS = {
  stone: M(0x8a8a84),
  darkStone: M(0x5a5a58),
  wood: M(0x6a4a2c),
  gold: M(0xd6a84a, { metalness: 0.8, roughness: 0.3 }),
  iron: M(0x5a5a60, { metalness: 0.7, roughness: 0.4 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
  beam: new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  orb: M(0xfff2b0, { emissive: 0xffd870, emissiveIntensity: 2 }),
  hostileOrb: M(0xffe0e0, { emissive: 0xff4030, emissiveIntensity: 2 }),
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.R = 20;
    this.obstacles = [];
    this.exitOpen = false;
    this.torches = [];

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a2a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(-0.5, 1, 0.35).normalize();
    scene.fog = new THREE.FogExp2(0xa9c8b0, 0.02);
    // Warm light that follows the hero so dark floors stay readable.
    this.lantern = new THREE.PointLight(0xffd8a0, 0, 16, 1.4);
    scene.add(this.lantern);

    const geo = new THREE.PlaneGeometry(260, 260, 130, 130);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    const N = 1100;
    const inst = (g, m, n, shadow = true) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.castShadow = shadow;
      im.receiveShadow = false;
      im.frustumCulled = false;
      im.count = 0;
      const white = new THREE.Color(1, 1, 1);
      for (let i = 0; i < n; i++) im.setColorAt(i, white);
      scene.add(im);
      return im;
    };
    this.trunks = inst(new THREE.CylinderGeometry(0.15, 0.26, 1, 6).translate(0, 0.5, 0), M(0xffffff), N);
    this.pines = inst(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), M(0xffffff), N * 2);
    this.oaks = inst(new THREE.IcosahedronGeometry(1, 0), M(0xffffff), N + 400);
    this.rocks = inst(new THREE.DodecahedronGeometry(1, 0), M(0xffffff), 300);
    this.grass = inst(new THREE.ConeGeometry(0.07, 0.4, 3).translate(0, 0.2, 0), M(0xffffff), 2600, false);

    // Fireflies
    const FF = 160;
    const fg = new THREE.BufferGeometry();
    this.ffBase = new Float32Array(FF * 3);
    fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FF * 3), 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xe8ff90, size: 0.18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fireflies.frustumCulled = false;
    scene.add(this.fireflies);

    this.dynamic = new THREE.Group();
    scene.add(this.dynamic);
  }

  build(floor, rng) {
    const th = themeFor(floor);
    this.theme = th;
    this.floor = floor;
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog.color.setHex(th.fog);
    this.scene.fog.density = th.fogD;
    this.sun.color.setHex(th.sun);
    this.sun.intensity = th.sunI;
    this.sunDir.set(...th.sunDir).normalize();
    this.hemi.color.setHex(th.hemi[0]);
    this.hemi.groundColor.setHex(th.hemi[1]);
    this.hemi.intensity = th.hemi[2];
    this.lantern.intensity = th.lantern;

    const boss = floor >= 7;
    const R = boss ? 21 : 17 + rng.int(0, 6);
    this.R = R;
    this.obstacles = [];
    this.exitOpen = false;
    this.torches = [];
    this.dynamic.clear();
    const seedOff = rng.float() * 100;
    const inExitLane = (x, z, pad = 0) => z < 0 && Math.abs(x) < 2.8 + pad && z < -R + 6;

    // Ground colours and outer hills
    const pos = this.ground.geometry.attributes.position;
    const col = this.ground.geometry.attributes.color;
    const gA = new THREE.Color(th.grass[0]), gB = new THREE.Color(th.grass[1]), dirt = new THREE.Color(th.dirt);
    const stone = new THREE.Color(0x6a665e);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const n = vnoise(x * 0.12 + seedOff, z * 0.12) * 0.7 + vnoise(x * 0.5, z * 0.5 + seedOff) * 0.3;
      c.copy(gA).lerp(gB, n);
      if (r < R) c.multiplyScalar(1.08);
      const lane = z < -R * 0.55 && Math.abs(x + Math.sin(z * 0.3) * 0.6) < 1.6 + n * 0.8;
      if (lane) c.lerp(dirt, 0.75);
      if (boss && r < 7 && r > 5.6) c.lerp(stone, 0.8);
      if (r < 2.5 + n) c.lerp(dirt, 0.25);
      col.setXYZ(i, c.r, c.g, c.b);
      pos.setY(i, r > R + 1 && !lane ? vnoise(x * 0.08, z * 0.08 + seedOff) * 2.2 * smooth(R + 1, R + 10, r) : 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.ground.geometry.computeVertexNormals();

    // Trees: dense rings from the clearing edge outwards, leaving the exit lane open.
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let nt = 0, np = 0, no = 0, nr = 0;
    const leaf = th.leaf.map((h) => new THREE.Color(h));
    const tc = new THREE.Color();
    const addTree = (x, z, scale, type) => {
      if (nt >= this.trunks.instanceMatrix.count || no >= this.oaks.instanceMatrix.count) return;
      const h = (1.6 + rng.float() * 1.4) * scale;
      q.setFromAxisAngle(up, rng.float() * TAU);
      m4.compose(p.set(x, 0, z), q, s.set(scale, h, scale));
      this.trunks.setMatrixAt(nt, m4);
      this.trunks.setColorAt(nt++, tc.setHSL(0.07, 0.35, 0.18 + rng.float() * 0.1));
      tc.copy(leaf[(rng.float() * leaf.length) | 0]).multiplyScalar(0.8 + rng.float() * 0.4);
      if (type === "pine") {
        const r = (1.3 + rng.float() * 0.6) * scale;
        const fh = (3.2 + rng.float() * 1.8) * scale;
        m4.compose(p.set(x, h * 0.55, z), q, s.set(r, fh, r));
        this.pines.setMatrixAt(np, m4);
        this.pines.setColorAt(np++, tc);
        m4.compose(p.set(x, h * 0.55 + fh * 0.45, z), q, s.set(r * 0.7, fh * 0.7, r * 0.7));
        this.pines.setMatrixAt(np, m4);
        this.pines.setColorAt(np++, tc.multiplyScalar(1.1));
      } else {
        const r = (1.5 + rng.float() * 0.8) * scale;
        m4.compose(p.set(x, h + r * 0.5, z), q, s.set(r, r * 0.85, r));
        this.oaks.setMatrixAt(no, m4);
        this.oaks.setColorAt(no++, tc);
      }
    };
    const addBush = (x, z, sc) => {
      if (no >= this.oaks.instanceMatrix.count) return;
      q.setFromAxisAngle(up, rng.float() * TAU);
      m4.compose(p.set(x, sc * 0.35, z), q, s.set(sc * 1.3, sc * 0.75, sc * 1.3));
      this.oaks.setMatrixAt(no, m4);
      this.oaks.setColorAt(no++, tc.copy(leaf[(rng.float() * leaf.length) | 0]).multiplyScalar(0.9 + rng.float() * 0.3));
    };
    const addRock = (x, z, r, ry = 0.6) => {
      q.setFromEuler(new THREE.Euler(rng.float(), rng.float() * TAU, rng.float()));
      m4.compose(p.set(x, r * 0.25, z), q, s.set(r, r * ry, r * (0.8 + rng.float() * 0.4)));
      this.rocks.setMatrixAt(nr, m4);
      this.rocks.setColorAt(nr++, tc.setHSL(0.1, 0.05, 0.35 + rng.float() * 0.15));
    };
    const pineBias = th.mood >= 2 ? 0.75 : 0.45;
    for (let d = R + 0.9; d < R + 48; d += 1.5 + (d - R) * 0.06) {
      const count = Math.floor((TAU * d) / (2.1 + (d - R) * 0.05));
      const off = rng.float() * TAU;
      for (let i = 0; i < count; i++) {
        const a = off + (i / count) * TAU + (rng.float() - 0.5) * 0.15;
        const dd = d + (rng.float() - 0.5) * 1.2;
        const x = Math.cos(a) * dd, z = Math.sin(a) * dd;
        if (z < 0 && Math.abs(x) < 3 + (dd - R) * 0.06) continue;
        if (z / dd > 0.25 && dd < R + 10) {
          if (dd < R + 6) addBush(x, z, 0.6 + rng.float() * 0.6);
          continue;
        }
        addTree(x, z, 0.85 + rng.float() * 0.6, rng.float() < pineBias ? "pine" : "oak");
      }
    }

    // Obstacles inside the clearing
    const tryPlace = (minR, maxR, rad, tries = 30) => {
      for (let t = 0; t < tries; t++) {
        const a = rng.float() * TAU, d = minR + rng.float() * (maxR - minR);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (inExitLane(x, z, 1.5) || (z > R - 7 && Math.abs(x) < 3)) continue;
        if (this.obstacles.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + rad + 2.2) ** 2)) continue;
        return { x, z };
      }
      return null;
    };
    const inner = boss ? 0 : 4 + rng.int(0, 5);
    for (let i = 0; i < inner; i++) {
      const rad = 0.5 + rng.float() * 0.9;
      const at = tryPlace(4, R - 3, rad);
      if (!at) continue;
      if (at.z < -2 && rng.float() < 0.6) {
        addTree(at.x, at.z, 1 + rng.float() * 0.3, rng.float() < pineBias ? "pine" : "oak");
        this.obstacles.push({ x: at.x, z: at.z, r: 0.55 });
      } else {
        addRock(at.x, at.z, rad);
        this.obstacles.push({ x: at.x, z: at.z, r: rad * 0.95 });
      }
    }
    // Pebbles and boulders on the treeline for texture
    for (let i = 0; i < 60; i++) {
      const a = rng.float() * TAU, d = R - 0.5 + rng.float() * 4;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z < 0 && Math.abs(x) < 3.2) continue;
      addRock(x, z, 0.15 + rng.float() * 0.5, 0.5);
    }
    // Grass tufts
    let ng = 0;
    const gc = new THREE.Color();
    for (let i = 0; i < 2600; i++) {
      const a = rng.float() * TAU, d = Math.sqrt(rng.float()) * (R + 6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const sc = 0.6 + rng.float() * 0.9;
      q.setFromEuler(new THREE.Euler((rng.float() - 0.5) * 0.4, rng.float() * TAU, (rng.float() - 0.5) * 0.4));
      m4.compose(p.set(x, 0, z), q, s.set(sc, sc, sc));
      this.grass.setMatrixAt(ng, m4);
      this.grass.setColorAt(ng++, gc.copy(gB).lerp(gA, rng.float()).multiplyScalar(1.1 + rng.float() * 0.3));
    }

    // Boss arena: standing stones ring
    if (th.stones) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.13;
        const x = Math.cos(a) * (R - 2.2), z = Math.sin(a) * (R - 2.2);
        if (inExitLane(x, z, 2)) continue;
        const st = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6 + rng.float() * 1.2, 0.7), MATS.stone);
        st.position.set(x, 1.2, z);
        st.rotation.set((rng.float() - 0.5) * 0.15, -a, (rng.float() - 0.5) * 0.15);
        st.castShadow = st.receiveShadow = true;
        this.dynamic.add(st);
        this.obstacles.push({ x, z, r: 0.75 });
      }
    }
    if (th.torches || th.mood >= 1) {
      const n = th.torches ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = th.torches ? (i / n) * TAU + Math.PI / 4 : -Math.PI / 2 + (i ? 0.22 : -0.22);
        const d = th.torches ? R - 4.5 : R - 0.2;
        this.addTorch(Math.cos(a) * d, Math.sin(a) * d);
      }
    }

    for (const im of [this.trunks, this.pines, this.oaks, this.rocks, this.grass]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.trunks.count = nt;
    this.pines.count = np;
    this.oaks.count = no;
    this.rocks.count = nr;
    this.grass.count = ng;

    // Exit gate at the north edge, opened once the clearing is won.
    const gate = new THREE.Group();
    gate.position.set(0, 0, -R);
    for (const sx of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 6), MATS.wood);
      post.position.set(sx, 1.6, 0);
      post.castShadow = true;
      gate.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.3), MATS.wood);
    lintel.position.y = 3.1;
    gate.add(lintel);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 6, 20, 1, true), MATS.beam.clone());
    this.beam.position.set(0, 3, -1.5);
    this.beam.visible = false;
    gate.add(this.beam);
    this.dynamic.add(gate);

    // Fireflies
    const fp = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const a = rng.float() * TAU, d = Math.sqrt(rng.float()) * (R + 8);
      this.ffBase.set([Math.cos(a) * d, 0.4 + rng.float() * 2.6, Math.sin(a) * d], i * 3);
    }
    this.fireflies.material.opacity = th.fire;

    // Spawn points along the edge, away from the exit and the player start.
    this.spawns = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const x = Math.cos(a) * (R - 1.6), z = Math.sin(a) * (R - 1.6);
      if (inExitLane(x, z, 2) || (z > R - 6 && Math.abs(x) < 6)) continue;
      this.spawns.push(new THREE.Vector3(x, 0, z));
    }
    return { R, theme: th };
  }

  addTorch(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.8, 5), MATS.wood);
    post.position.y = 0.9;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 6), MATS.flame);
    flame.position.y = 1.95;
    const light = new THREE.PointLight(0xff9a40, 18, 11, 1.8);
    light.position.y = 2.1;
    g.add(post, flame, light);
    this.dynamic.add(g);
    this.obstacles.push({ x, z, r: 0.25 });
    this.torches.push({ flame, light, seed: Math.random() * 10 });
  }

  makeShrine(x, z, hostile) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 8), MATS.darkStone);
    base.position.y = 0.25;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.2, 6), MATS.stone);
    pillar.position.y = 1.1;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), hostile ? MATS.hostileOrb : MATS.orb);
    orb.position.y = 2;
    const light = new THREE.PointLight(hostile ? 0xff4030 : 0xffd870, 8, 7, 1.8);
    light.position.y = 2;
    for (const m of [base, pillar]) (m.castShadow = true), (m.receiveShadow = true);
    g.add(base, pillar, orb, light);
    this.dynamic.add(g);
    this.obstacles.push({ x, z, r: 0.85 });
    return { group: g, orb, light };
  }

  makeChest(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * TAU;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), MATS.wood);
    body.position.y = 0.25;
    const lid = new THREE.Group();
    lid.position.set(0, 0.5, -0.3);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.62), MATS.wood);
    lidMesh.position.set(0, 0.09, 0.3);
    lid.add(lidMesh);
    for (const sx of [-0.3, 0.3]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.62), MATS.gold);
      band.position.set(sx, 0.26, 0);
      g.add(band);
    }
    for (const m of [body, lidMesh]) m.castShadow = true;
    g.add(body, lid);
    this.dynamic.add(g);
    this.obstacles.push({ x, z, r: 0.6 });
    return { group: g, lid };
  }

  makeTrap(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.03, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 4, 14), MATS.iron);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), MATS.iron);
      const a = (i / 8) * TAU;
      tooth.position.set(Math.cos(a) * 0.36, 0.07, Math.sin(a) * 0.36);
      g.add(tooth);
    }
    this.dynamic.add(g);
    return g;
  }

  openExit() {
    this.exitOpen = true;
    this.beam.visible = true;
  }

  // Push a circle out of obstacles and keep it inside the clearing (or the exit lane once open).
  collide(pos, r, canExit = false) {
    let hit = false;
    for (const o of this.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const min = o.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-4;
        pos.x = o.x + (dx / d) * min;
        pos.z = o.z + (dz / d) * min;
        hit = true;
      }
    }
    const d = Math.hypot(pos.x, pos.z);
    const lim = this.R - r;
    if (d > lim) {
      const lane = canExit && this.exitOpen && pos.z < 0 && Math.abs(pos.x) < 1.9;
      if (lane) {
        pos.x = Math.max(-1.9, Math.min(1.9, pos.x));
      } else {
        pos.x *= lim / d;
        pos.z *= lim / d;
        hit = true;
      }
    }
    return hit;
  }

  blocked(pos, r = 0.1) {
    for (const o of this.obstacles) if ((pos.x - o.x) ** 2 + (pos.z - o.z) ** 2 < (o.r + r) ** 2) return true;
    return Math.hypot(pos.x, pos.z) > this.R + 1;
  }

  update(dt, t, focus) {
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 60);
    this.sun.target.position.copy(focus);
    this.lantern.position.set(focus.x, 4, focus.z + 1);
    const fp = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const b = i * 3;
      fp.setXYZ(i, this.ffBase[b] + Math.sin(t * 0.7 + i) * 0.8, this.ffBase[b + 1] + Math.sin(t * 1.3 + i * 2.1) * 0.4, this.ffBase[b + 2] + Math.cos(t * 0.6 + i * 1.7) * 0.8);
    }
    fp.needsUpdate = true;
    for (const tr of this.torches) {
      const f = 0.85 + Math.sin(t * 13 + tr.seed) * 0.08 + Math.sin(t * 7.3 + tr.seed * 2) * 0.07;
      tr.light.intensity = 18 * f;
      tr.flame.scale.set(1, f * 1.1, 1);
    }
    if (this.beam.visible) this.beam.material.opacity = 0.25 + Math.sin(t * 3) * 0.1;
  }
}
