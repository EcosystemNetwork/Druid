// Shared mutable game state plus small math helpers used by every module.
import * as THREE from "three";

export const G = {
  scene: null,
  camera: null,
  renderer: null,
  world: null,
  fx: null,
  player: null,
  enemies: [],
  projectiles: [],
  pickups: [],
  traps: [],
  snares: [],
  followers: [],
  props: [],
  timers: [],
  mode: "menu",
  run: null,
  rng: null,
  time: 0,
  shake: 0,
  hitstop: 0,
  keys: new Set(),
  mouse: new THREE.Vector3(),
  mouseDown: false,
  events: {},
};

export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;

// Flat (xz) unit direction from a to b.
export function flatDir(from, to, out = new THREE.Vector3()) {
  out.set(to.x - from.x, 0, to.z - from.z);
  const l = out.length();
  return l > 1e-5 ? out.divideScalar(l) : out.set(0, 0, 1);
}

export function after(seconds, fn) {
  G.timers.push({ t: seconds, fn });
}

export function nearestEnemy(pos, maxDist = Infinity, exclude = null) {
  let best = null;
  let bd = maxDist * maxDist;
  for (const e of G.enemies) {
    if (e.dead || e.state === "spawn" || e === exclude) continue;
    const d = dist2(pos, e.pos);
    if (d < bd) (bd = d), (best = e);
  }
  return best;
}
