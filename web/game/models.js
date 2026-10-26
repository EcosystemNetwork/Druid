// Characters. Procedural low-poly rigs (enemies, followers, rolled heroes) and a
// wrapper for forged Tripo GLBs share one interface:
//   rig.object3d   add to the scene; game code sets its position and rotation.y
//   rig.update(dt, speed)
//   rig.trigger(action)   attack | shoot | cast | slam | spin | dodge | hurt | windup | aim | victory | die
//   rig.release()         ends a held windup/aim pose
//   rig.flash(hex)

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 8),
};
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

function piece(geo, m, s, p = [0, 0, 0], r = null) {
  const mesh = new THREE.Mesh(UNIT[geo], m);
  mesh.scale.set(...s);
  mesh.position.set(...p);
  if (r) mesh.rotation.set(...r);
  mesh.castShadow = true;
  return mesh;
}

// Weapons in hand space: the hand is the origin, the arm hangs along -Y, forward is +Z.
function makeWeapon(kind, m) {
  const g = new THREE.Group();
  const H = Math.PI / 2;
  switch (kind) {
    case "sword":
      g.add(piece("box", m.metal, [0.025, 0.07, 0.9], [0, 0, 0.52]));
      g.add(piece("box", m.accent, [0.24, 0.05, 0.05], [0, 0, 0.07]));
      g.add(piece("cyl", m.wood, [0.03, 0.18, 0.03], [0, 0, -0.04], [H, 0, 0]));
      break;
    case "axe":
      g.add(piece("cyl", m.wood, [0.03, 0.9, 0.03], [0, 0, 0.3], [H, 0, 0]));
      g.add(piece("box", m.metal, [0.03, 0.26, 0.18], [0, 0.1, 0.68]));
      break;
    case "staff":
      g.add(piece("cyl", m.wood, [0.045, 2.1, 0.045], [0, 0, 0.25], [H, 0, 0]));
      break;
    case "mace":
      g.add(piece("cyl", m.wood, [0.035, 0.6, 0.035], [0, 0, 0.22], [H, 0, 0]));
      g.add(piece("ball", m.metal, [0.12, 0.12, 0.12], [0, 0, 0.55]));
      break;
    case "censer":
      g.add(piece("cyl", m.wood, [0.03, 1.4, 0.03], [0, 0.35, 0.05]));
      g.add(piece("ball", m.glow, [0.1, 0.1, 0.1], [0, 1.08, 0.05]));
      break;
    case "twig": {
      const a = piece("cyl", m.wood, [0.03, 0.9, 0.03], [0, 0.3, 0.05], [0.12, 0, 0]);
      const b = piece("cyl", m.wood, [0.025, 0.6, 0.025], [0.04, 0.95, 0.12], [-0.25, 0, 0.2]);
      g.add(a, b, piece("ball", m.glow, [0.08, 0.08, 0.08], [0.1, 1.25, 0.05]));
      break;
    }
    case "dagger":
      g.add(piece("box", m.metal, [0.02, 0.05, 0.36], [0, 0, 0.24]));
      g.add(piece("box", m.wood, [0.03, 0.04, 0.12], [0, 0, 0.02]));
      break;
    case "crossbow":
      g.add(piece("box", m.wood, [0.07, 0.08, 0.62], [0, 0, 0.2]));
      g.add(piece("box", m.wood, [0.66, 0.04, 0.05], [0, 0.02, 0.46]));
      break;
    case "bow":
      g.add(piece("cyl", m.wood, [0.025, 0.72, 0.025], [0, 0.33, 0.06], [-0.3, 0, 0]));
      g.add(piece("cyl", m.wood, [0.025, 0.72, 0.025], [0, -0.33, 0.06], [0.3, 0, 0]));
      g.add(piece("cyl", m.string, [0.006, 1.3, 0.006], [0, 0, -0.04]));
      break;
    case "lute":
      g.add(piece("ball", m.wood, [0.2, 0.26, 0.08], [0.04, 0.05, 0.14]));
      g.add(piece("box", m.accent, [0.04, 0.42, 0.03], [0.04, 0.38, 0.14]));
      break;
    case "shield":
      g.add(piece("cyl", m.wood, [0.34, 0.05, 0.34], [-0.06, 0.05, 0.05], [0, 0, H]));
      g.add(piece("ball", m.metal, [0.07, 0.07, 0.07], [-0.1, 0.05, 0.05]));
      break;
  }
  return g;
}

function makeHat(kind, m, head) {
  switch (kind) {
    case "hood":
      head.add(piece("ball", m.hat, [0.2, 0.21, 0.21], [0, 0.03, -0.02]));
      head.add(piece("cone", m.hat, [0.13, 0.26, 0.13], [0, 0.08, -0.2], [-1.9, 0, 0]));
      break;
    case "helm":
      head.add(piece("ball", m.metal, [0.185, 0.16, 0.19], [0, 0.07, 0]));
      head.add(piece("box", m.metal, [0.03, 0.14, 0.04], [0, -0.02, 0.18]));
      break;
    case "kettle":
      head.add(piece("cyl", m.metal, [0.18, 0.12, 0.18], [0, 0.12, 0]));
      head.add(piece("cyl", m.metal, [0.28, 0.025, 0.28], [0, 0.07, 0]));
      break;
    case "cap":
      head.add(piece("cyl", m.hat, [0.19, 0.08, 0.19], [0, 0.13, 0], [0.15, 0, 0]));
      head.add(piece("box", m.feather, [0.02, 0.05, 0.32], [0.12, 0.2, -0.08], [0.6, 0.2, 0]));
      break;
    case "witch":
      head.add(piece("cyl", m.hat, [0.3, 0.02, 0.3], [0, 0.1, 0]));
      head.add(piece("cone", m.hat, [0.17, 0.5, 0.17], [0, 0.34, -0.04], [-0.25, 0, 0.1]));
      break;
    case "sheriff":
      head.add(piece("cyl", m.hat, [0.17, 0.3, 0.17], [0, 0.22, 0]));
      head.add(piece("cyl", m.hat, [0.27, 0.025, 0.27], [0, 0.08, 0]));
      head.add(piece("cyl", m.accent, [0.172, 0.05, 0.172], [0, 0.12, 0]));
      break;
    case "bald":
      head.add(piece("cyl", m.hair, [0.17, 0.06, 0.17], [0, 0.0, -0.01]));
      break;
    default:
      head.add(piece("ball", m.hair, [0.17, 0.12, 0.17], [0, 0.07, -0.02]));
  }
}

const DUR = { attack: 0.3, shoot: 0.22, cast: 0.45, hurt: 0.25, slam: 0.5, spin: 0.4, dodge: 0.3, windup: Infinity, aim: Infinity, victory: Infinity, die: Infinity };

class ProcRig {
  constructor(object3d, inner, parts, mats, kind, height) {
    Object.assign(this, { object3d, inner, parts, mats, kind, height });
    this.phase = Math.random() * 6;
    this.time = 0;
    this.action = null;
    this.actionT = 0;
    this.flashT = 0;
  }
  trigger(a) {
    if (this.action === "die") return;
    this.action = a;
    this.actionT = 0;
  }
  release() {
    if (this.action === "windup" || this.action === "aim") this.action = null;
  }
  flash(hex = 0xffffff, t = 0.1) {
    for (const m of this.mats) m.emissive.setHex(hex);
    this.flashT = t;
  }
  update(dt, speed) {
    this.time += dt;
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) for (const m of this.mats) m.emissive.setHex(0);
    let a = this.action;
    let k = 0;
    let t = 0;
    if (a) {
      t = this.actionT += dt;
      k = Math.min(1, t / DUR[a]);
      if (t >= DUR[a]) this.action = a = null;
    }
    const mv = Math.min(speed / 3.5, 1);
    this.phase += dt * (3 + speed * (this.kind === "quad" ? 2.2 : 1.6));
    if (this.kind === "quad") this.updateQuad(a, k, t, mv);
    else this.updateBiped(a, k, t, mv);
  }
  updateBiped(a, k, t, mv) {
    const p = this.parts;
    const s = Math.sin(this.phase);
    let legL = s * 0.75 * mv;
    let legR = -legL;
    let armL = -s * 0.55 * mv;
    let armR = s * 0.55 * mv;
    let bob = Math.abs(Math.cos(this.phase)) * 0.05 * mv + Math.sin(this.time * 2.2) * 0.008;
    let lean = 0.1 * mv;
    let twist = 0;
    let y = 0;
    switch (a) {
      case "attack": {
        const e = 1 - (1 - k) ** 3;
        armR = -2.7 + 3.4 * e;
        twist = 0.6 - 1.1 * e;
        lean = 0.18;
        break;
      }
      case "windup": armR = -2.7; twist = 0.55; lean = -0.05; break;
      case "shoot": armL = -1.5; armR = -1.45 + (1 - k) * 0.25; break;
      case "aim": armL = -1.5; armR = -1.5; break;
      case "cast": armL = armR = k < 0.5 ? -2.9 : -2.9 + 3 * (k - 0.5); break;
      case "slam":
        armL = armR = k < 0.45 ? -3 : -3 + 3.4 * Math.min(1, (k - 0.45) * 4);
        lean = k < 0.45 ? -0.15 : 0.35;
        break;
      case "spin": twist = k * Math.PI * 2; armL = armR = -1.4; break;
      case "dodge":
        lean = 0.7 * Math.sin(k * Math.PI);
        y = -0.25 * Math.sin(k * Math.PI);
        legL = 0.9; legR = -0.6;
        break;
      case "hurt": lean = -0.35 * (1 - k); break;
      case "victory":
        armL = armR = -2.9 + Math.sin(t * 8) * 0.2;
        bob = Math.abs(Math.sin(t * 5)) * 0.18;
        break;
      case "die": {
        const e = Math.min(1, t / 0.5);
        this.inner.rotation.x = (-Math.PI / 2) * e * e;
        this.inner.position.y = 0.12 * e;
        legL = legR = 0; armL = -0.4; armR = 0.4; lean = 0; bob = 0;
        break;
      }
    }
    p.legL.rotation.x = legL;
    p.legR.rotation.x = legR;
    p.armL.rotation.x = armL;
    p.armR.rotation.x = armR;
    p.body.position.y = bob + y;
    p.body.rotation.x = lean;
    p.body.rotation.y = twist;
  }
  updateQuad(a, k, t, mv) {
    const p = this.parts;
    let sw = Math.sin(this.phase) * 0.8 * mv;
    let pitch = 0;
    let headZ = 0;
    if (a === "attack") (headZ = Math.sin(k * Math.PI) * 0.3), (pitch = 0.1);
    if (a === "windup") (pitch = 0.18), (sw = Math.sin(t * 22) * 0.5);
    if (a === "hurt") pitch = -0.2 * (1 - k);
    if (a === "die") {
      const e = Math.min(1, t / 0.4);
      this.inner.rotation.z = (Math.PI / 2) * e;
      this.inner.position.y = 0.1 * e;
      sw = 0;
    }
    p.fl.rotation.x = p.br.rotation.x = sw;
    p.fr.rotation.x = p.bl.rotation.x = -sw;
    p.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * mv;
    p.body.rotation.x = pitch;
    p.head.position.z = p.headZ0 + headZ;
    if (p.tail) p.tail.rotation.y = Math.sin(this.time * 9) * 0.5;
  }
}

export function makeHumanoid(o = {}) {
  const m = {
    skin: mat(o.skin ?? 0xd9a77c),
    hair: mat(o.hair ?? 0x4a3020),
    tunic: mat(o.tunic ?? 0x3d6b2a),
    pants: mat(o.pants ?? 0x5a4630),
    boots: mat(o.boots ?? 0x3a2a1c),
    accent: mat(o.accent ?? 0x7a5a30),
    hat: mat(o.hatColor ?? o.tunic ?? 0x3d6b2a),
    wood: mat(0x7a5532),
    metal: mat(0xb8bcc4, { metalness: 0.7, roughness: 0.35 }),
    string: mat(0xeeeeee),
    feather: mat(0xc0392b),
    eye: mat(0x111111),
  };
  // Glowing parts stay out of the flash list so a hit flash doesn't reset their glow.
  m.glow = mat(o.glow ?? 0x9fe870, { emissive: o.glow ?? 0x9fe870, emissiveIntensity: 1.4 });
  const bulk = o.bulk ?? 1;
  const object3d = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(o.height ?? 1);
  object3d.add(inner);
  const body = new THREE.Group();
  inner.add(body);

  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.12 * side * bulk, 0.92, 0);
    g.add(piece("box", m.pants, [0.17 * bulk, 0.62, 0.19], [0, -0.31, 0]));
    g.add(piece("box", m.boots, [0.19 * bulk, 0.32, 0.25], [0, -0.76, 0.03]));
    body.add(g);
    return g;
  };
  const legL = leg(1);
  const legR = leg(-1);

  body.add(piece("box", m.tunic, [0.46 * bulk, 0.6, 0.28 * bulk], [0, 1.22, 0]));
  body.add(piece("box", m.accent, [0.48 * bulk, 0.07, 0.3 * bulk], [0, 0.97, 0]));
  if (o.belly) body.add(piece("ball", m.tunic, [0.27 * bulk, 0.26, 0.24 * bulk], [0, 1.1, 0.08]));
  if (o.robe) body.add(piece("cone", m.tunic, [0.34 * bulk, 0.78, 0.3 * bulk], [0, 0.55, 0]));
  if (o.cloak) {
    const c = piece("box", mat(o.cloak), [0.5 * bulk, 1.0, 0.04], [0, 1.0, -0.19 * bulk], [0.12, 0, 0]);
    body.add(c);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  body.add(head);
  head.add(piece("ball", m.skin, [0.16, 0.18, 0.16], [0, 0.08, 0]));
  head.add(piece("box", m.eye, [0.03, 0.03, 0.02], [0.06, 0.1, 0.15]));
  head.add(piece("box", m.eye, [0.03, 0.03, 0.02], [-0.06, 0.1, 0.15]));
  if (o.beard) head.add(piece("box", m.hair, [0.2, 0.1, 0.08], [0, -0.03, 0.12]));
  makeHat(o.hat, m, head);

  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * (0.28 * bulk + 0.05), 1.47, 0);
    g.add(piece("box", m.tunic, [0.13 * bulk, 0.56, 0.14 * bulk], [0, -0.28, 0]));
    g.add(piece("ball", m.skin, [0.065, 0.065, 0.065], [0, -0.6, 0]));
    const hand = new THREE.Group();
    hand.position.set(0, -0.6, 0);
    g.add(hand);
    body.add(g);
    return { g, hand };
  };
  const L = arm(1);
  const R = arm(-1);
  const leftHanded = o.weapon === "bow" || o.weapon === "lute";
  if (o.weapon) (leftHanded ? L : R).hand.add(makeWeapon(o.weapon, m));
  if (o.offhand) L.hand.add(makeWeapon(o.offhand, m));

  object3d.traverse((c) => c.isMesh && (c.castShadow = true));
  const flashable = Object.entries(m).filter(([k]) => k !== "glow").map(([, v]) => v);
  return new ProcRig(object3d, inner, { body, legL, legR, armL: L.g, armR: R.g, head }, flashable, "biped", 1.8 * (o.height ?? 1));
}

export function makeQuadruped({ type = "hound", scale = 1 } = {}) {
  const boar = type === "boar";
  const m = {
    fur: mat(boar ? 0x4a3426 : 0x7a6a58),
    dark: mat(boar ? 0x2e2018 : 0x4a3e32),
    tusk: mat(0xf0e6d0),
    eye: mat(boar ? 0xff5533 : 0x111111),
  };
  const object3d = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  object3d.add(inner);
  const body = new THREE.Group();
  inner.add(body);
  const w = boar ? 0.22 : 0.13;
  const l = boar ? 0.36 : 0.32;
  const top = boar ? 0.42 : 0.5;
  const legLen = top;
  body.add(piece("box", m.fur, boar ? [0.62, 0.58, 1.1] : [0.32, 0.32, 0.95], [0, top + (boar ? 0.25 : 0.14), 0]));
  if (boar) body.add(piece("box", m.dark, [0.16, 0.18, 0.9], [0, top + 0.6, -0.05]));
  const head = new THREE.Group();
  const headZ0 = boar ? 0.64 : 0.56;
  head.position.set(0, top + (boar ? 0.2 : 0.3), headZ0);
  body.add(head);
  if (boar) {
    head.add(piece("box", m.fur, [0.44, 0.42, 0.42], [0, 0, 0]));
    head.add(piece("box", m.dark, [0.24, 0.2, 0.18], [0, -0.06, 0.26]));
    head.add(piece("cone", m.tusk, [0.04, 0.2, 0.04], [0.13, -0.05, 0.3], [-0.6, 0, 0]));
    head.add(piece("cone", m.tusk, [0.04, 0.2, 0.04], [-0.13, -0.05, 0.3], [-0.6, 0, 0]));
    head.add(piece("box", m.eye, [0.05, 0.04, 0.02], [0.13, 0.08, 0.21]));
    head.add(piece("box", m.eye, [0.05, 0.04, 0.02], [-0.13, 0.08, 0.21]));
  } else {
    head.add(piece("box", m.fur, [0.24, 0.24, 0.3], [0, 0, 0]));
    head.add(piece("box", m.dark, [0.15, 0.13, 0.22], [0, -0.04, 0.22]));
    head.add(piece("cone", m.dark, [0.05, 0.14, 0.05], [0.08, 0.17, -0.06]));
    head.add(piece("cone", m.dark, [0.05, 0.14, 0.05], [-0.08, 0.17, -0.06]));
    head.add(piece("box", m.eye, [0.03, 0.03, 0.02], [0.07, 0.05, 0.15]));
    head.add(piece("box", m.eye, [0.03, 0.03, 0.02], [-0.07, 0.05, 0.15]));
  }
  const legAt = (x, z) => {
    const g = new THREE.Group();
    g.position.set(x, top, z);
    g.add(piece("box", m.dark, [0.11, legLen, 0.11], [0, -legLen / 2, 0]));
    body.add(g);
    return g;
  };
  const parts = { body, head, headZ0, fl: legAt(w, l), fr: legAt(-w, l), bl: legAt(w, -l), br: legAt(-w, -l) };
  const tail = new THREE.Group();
  tail.position.set(0, top + (boar ? 0.45 : 0.25), boar ? -0.55 : -0.47);
  tail.add(piece("cyl", m.dark, [0.025, boar ? 0.2 : 0.35, 0.025], [0, 0.1, -0.1], [-0.9, 0, 0]));
  body.add(tail);
  parts.tail = tail;
  return new ProcRig(object3d, inner, parts, Object.values(m), "quad", 1.0 * scale);
}

// ---------- rolled heroes: archetype + palette -> procedural look ----------

const PALETTE_COLORS = [
  [/lincoln green/i, 0x3f6e2a, 0x6a4a2c],
  [/moss/i, 0x5a6b32, 0x8a4a2a],
  [/forest green/i, 0x2f5a2a, 0xb08a3a],
  [/faded red/i, 0x8a3a30, 0x6a6a70],
  [/russet/i, 0x8a4a28, 0x6a7a3a],
  [/teal/i, 0x2a5a5a, 0xb08a3a],
  [/ash grey/i, 0x6e6e6a, 0x8a1e1e],
  [/amber/i, 0xc0802a, 0x5a1a1a],
  [/royal blue/i, 0x1f3a7a, 0xd4a52a],
];
const HAIR = [[/auburn/, 0x7a3a1a], [/silver/, 0xe2e2e8], [/copper/, 0xb5541e], [/black/, 0x1a1410], [/blonde/, 0xd8b060], [/grey/, 0x9a9a9a], [/chestnut/, 0x5a3218], [/red/, 0xa83a1a], [/dark/, 0x2a1a10]];
const SKINS = [0xf0c8a0, 0xd9a77c, 0xc08a60, 0x8a5a38, 0x6a4028];
// Creator-built heroes pick a skin tone (forge.js SKINS, same order); rolled ones get one from their seed.
const SKIN_NAMES = [/^fair/, /^ruddy/, /^olive/, /^brown/, /^deep brown/];

export function heroLook(c) {
  const [, main, accent] = PALETTE_COLORS.find(([re]) => re.test(c.look.palette)) ?? PALETTE_COLORS[0];
  const hairStr = c.look.hair;
  const hair = /shaved/.test(hairStr) ? null : (HAIR.find(([re]) => re.test(hairStr))?.[1] ?? 0x4a3020);
  let h = 0;
  for (const ch of c.seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const skinIdx = SKIN_NAMES.findIndex((re) => re.test(c.look.skin ?? ""));
  if (skinIdx >= 0) h = skinIdx;
  const look = {
    tunic: main, accent, pants: 0x4a3a28, skin: SKINS[h % SKINS.length], hair: hair ?? SKINS[h % SKINS.length],
    beard: /beard|moustache/.test(c.look.face), hat: hair ? "hair" : "bald",
  };
  const byArch = {
    outlaw_archer: { hat: "hood", weapon: "bow", bulk: 0.95, cloak: main },
    merry_brawler: { weapon: "staff", bulk: 1.35, height: 1.08 },
    friar: { hat: "bald", weapon: "mace", bulk: 1.2, belly: true, robe: true, tunic: 0x6a4a2e, pants: 0x6a4a2e, accent: 0xd8c8a0 },
    sherwood_witch: { hat: "witch", hatColor: 0x1e2a1e, weapon: "twig", bulk: 0.85, robe: true, glow: 0xb070ff },
    poacher: { hat: "hood", hatColor: 0x7a5a3a, weapon: "dagger", bulk: 0.95 },
    disgraced_knight: { hat: "helm", weapon: "sword", offhand: "shield", tunic: 0x9a9aa0, accent: main, bulk: 1.12 },
    sheriffs_deserter: { hat: "kettle", weapon: "crossbow", tunic: 0x8a3a30 },
    minstrel: { hat: "cap", hatColor: accent, weapon: "lute", bulk: 0.92 },
  };
  return { ...look, ...(byArch[c.archetype] ?? {}) };
}

export const makeHero = (c) => makeHumanoid(heroLook(c));
export const makeFollower = () =>
  makeHumanoid({ tunic: 0x3f6e2a, accent: 0x6a4a2c, hat: "hood", weapon: "bow", bulk: 0.9, height: 0.92, cloak: 0x2f5a22 });

// ---------- forged heroes: animated GLB ----------

const loader = new GLTFLoader();

class GLBRig {
  constructor(gltf, yaw) {
    this.object3d = new THREE.Group();
    this.inner = new THREE.Group();
    this.object3d.add(this.inner);
    this.model = gltf.scene;
    this.inner.add(this.model);
    this.inner.rotation.y = yaw;
    this.height = 1.8;

    // Normalize to 1.8m tall, feet on the ground, centred.
    this.model.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(this.model);
    const h = bb.max.y - bb.min.y || 1;
    this.model.scale.multiplyScalar(1.8 / h);
    this.model.updateMatrixWorld(true);
    bb.setFromObject(this.model);
    const c = bb.getCenter(new THREE.Vector3());
    this.model.position.x -= c.x;
    this.model.position.z -= c.z;
    this.model.position.y -= bb.min.y;

    this.mats = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      for (const x of [].concat(o.material)) if (x.emissive) this.mats.push(x);
    });
    this.baseEmissive = this.mats.map((x) => x.emissive.clone());

    const anims = gltf.animations;
    const find = (...res) => {
      for (const re of res) {
        const clip = anims.find((a) => re.test(a.name));
        if (clip) return clip;
      }
      return null;
    };
    this.clips = {
      idle: find(/idle/i) ?? anims[0] ?? null,
      walk: find(/walk/i),
      run: find(/run/i),
      hurt: find(/hurt/i, /hit_to/i),
      die: find(/defeat/i, /death|die/i),
      victory: find(/victory|celebrat/i),
      attack: find(/slash|chop|box|punch|kick|attack/i, /shoot/i, /cast/i),
      shoot: find(/shoot/i),
      cast: find(/cast|spell/i, /sing|dance/i),
    };
    this.mixer = new THREE.AnimationMixer(this.model);
    this.mixer.addEventListener("finished", (e) => {
      if (e.action !== this.oneShot || this.dead) return;
      this.oneShot = null;
      this.playLoco(this.locoName ?? "idle", 0.2);
    });
    this.current = null;
    this.oneShot = null;
    this.locoName = null;
    this.flashT = 0;
    this.fx = null;
    this.fxT = 0;
    this.dead = false;
  }
  fadeTo(action, dur) {
    action.reset().setEffectiveWeight(1).play();
    if (this.current && this.current !== action) action.crossFadeFrom(this.current, dur, false);
    this.current = action;
  }
  playLoco(name, fade) {
    const c = this.clips;
    const clip = c[name] ?? (name === "run" ? c.walk : name === "walk" ? c.run : null) ?? c.idle;
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    if (action !== this.current) this.fadeTo(action, fade);
  }
  release() {}
  trigger(name) {
    if (this.dead) return;
    if (name === "windup" || name === "aim") return;
    if (name === "die" || name === "victory") {
      this.dead = name === "die";
      const clip = this.clips[name];
      if (!clip) return void ((this.fx = name), (this.fxT = 0));
      const a = this.mixer.clipAction(clip);
      a.setLoop(name === "die" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = true;
      this.fadeTo(a, 0.15);
      this.oneShot = name === "victory" ? a : null;
      return;
    }
    const c = this.clips;
    const clip =
      name === "hurt" ? c.hurt
      : name === "dodge" ? null
      : name === "shoot" ? c.shoot ?? c.attack
      : name === "cast" || name === "slam" ? c.cast ?? c.attack
      : c.attack ?? c.cast;
    if (!clip) return void ((this.fx = name), (this.fxT = 0));
    // Never cut an attack short just to play a flinch.
    if (name === "hurt" && this.oneShot) return;
    const a = this.mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true; // hold the last frame while blending back, never snap to bind pose
    const target = name === "hurt" ? 0.35 : name === "cast" || name === "slam" ? 0.55 : 0.42;
    a.timeScale = Math.max(1, clip.duration / target);
    this.fadeTo(a, 0.08);
    this.oneShot = a;
  }
  flash(hex = 0xffffff, t = 0.1) {
    for (const x of this.mats) x.emissive.setHex(hex);
    this.flashT = t;
  }
  update(dt, speed) {
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.mats.forEach((x, i) => x.emissive.copy(this.baseEmissive[i]));
    if (!this.dead && !this.oneShot) {
      const name = speed < 0.4 ? "idle" : speed < 4.2 ? "walk" : "run";
      if (name !== this.locoName || !this.current) {
        this.locoName = name;
        this.playLoco(name, 0.2);
      }
    }
    this.mixer.update(dt);
    // Procedural stand-ins for clips the model doesn't have.
    if (this.fx) {
      this.fxT += dt;
      const k = Math.min(1, this.fxT / 0.3);
      if (this.fx === "die") {
        const e = Math.min(1, this.fxT / 0.5);
        this.inner.rotation.x = (-Math.PI / 2) * e * e;
        this.inner.position.y = 0.1 * e;
      } else if (this.fx === "victory") {
        this.inner.position.y = Math.abs(Math.sin(this.fxT * 5)) * 0.25;
      } else if (this.fx === "dodge") {
        this.inner.rotation.x = 0.5 * Math.sin(k * Math.PI);
      } else if (this.fx === "hurt") {
        this.inner.rotation.x = -0.25 * Math.sin(k * Math.PI);
      } else {
        this.inner.position.z = Math.sin(k * Math.PI) * 0.25;
      }
      if (k >= 1 && this.fx !== "die" && this.fx !== "victory") {
        this.fx = null;
        this.inner.position.z = 0;
        this.inner.rotation.x = 0;
      }
    }
  }
}

export async function loadGLBRig(url, yaw) {
  const gltf = await loader.loadAsync(url);
  return new GLBRig(gltf, yaw);
}
