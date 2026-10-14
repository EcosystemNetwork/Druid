// Combat: projectiles, particles, ground telegraphs, damage rules (perks/flaws) and pickups.

import * as THREE from "three";
import { G, TAU, rand, dist2, flatDir, nearestEnemy } from "./state.js";
import { sfx } from "./audio.js";
import { floatText, banner } from "./hud.js";

// ---------- particles ----------

const MAXP = 900;
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,.6)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.base = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.max = new Float32Array(MAXP);
    this.grav = new Float32Array(MAXP);
    this.pos.fill(-999);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0;
    this.decals = [];
    this.c = new THREE.Color();
  }
  burst(p, color, n = 10, speed = 4, life = 0.5, grav = -9, up = 2, y = null) {
    this.c.set(color);
    for (let k = 0; k < n; k++) {
      const i = (this.i = (this.i + 1) % MAXP);
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      this.pos.set([p.x, y ?? p.y ?? 1, p.z], i * 3);
      this.vel.set([Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s], i * 3);
      const v = 0.75 + Math.random() * 0.5;
      this.base.set([this.c.r * v, this.c.g * v, this.c.b * v], i * 3);
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = grav;
    }
  }
  // Expanding flat shape on the ground. Telegraphs are kept alive by their owner.
  decal(geo, color, { life = 0.3, x = 0, z = 0, rot = 0, opacity = 0.6, grow = 0, keep = false } = {}) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, 0.05, z);
    m.rotation.y = rot;
    m.renderOrder = 2;
    this.scene.add(m);
    const d = { mesh: m, life, max: life, opacity, grow, keep };
    this.decals.push(d);
    return d;
  }
  kill(d) {
    if (!d) return;
    d.life = 0;
    d.keep = false;
  }
  update(dt) {
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const b = i * 3;
      if (this.life[i] <= 0) {
        this.pos[b + 1] = -999;
        continue;
      }
      this.vel[b + 1] += this.grav[i] * dt;
      this.pos[b] += this.vel[b] * dt;
      this.pos[b + 1] = Math.max(0.05, this.pos[b + 1] + this.vel[b + 1] * dt);
      this.pos[b + 2] += this.vel[b + 2] * dt;
      const f = this.life[i] / this.max[i];
      this.col[b] = this.base[b] * f;
      this.col[b + 1] = this.base[b + 1] * f;
      this.col[b + 2] = this.base[b + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (let k = this.decals.length - 1; k >= 0; k--) {
      const d = this.decals[k];
      if (d.keep) continue;
      d.life -= dt;
      if (d.grow) d.mesh.scale.multiplyScalar(1 + d.grow * dt);
      d.mesh.material.opacity = Math.max(0, (d.life / d.max) * d.opacity);
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.material.dispose();
        this.decals.splice(k, 1);
      }
    }
  }
  clear() {
    for (const d of this.decals) this.scene.remove(d.mesh);
    this.decals.length = 0;
    this.life.fill(0);
    this.pos.fill(-999);
  }
}

// Shared telegraph geometry. Arcs point at +Z before rotation.y.
const geoCache = new Map();
export function arcGeo(inner, outer, arc) {
  const key = `${inner.toFixed(2)}|${outer.toFixed(2)}|${arc.toFixed(2)}`;
  if (!geoCache.has(key)) {
    const g = new THREE.RingGeometry(inner, outer, 28, 1, -Math.PI / 2 - arc / 2, arc);
    g.rotateX(-Math.PI / 2);
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}
export const ringGeo = (r, w = 0.12) => arcGeo(Math.max(0, r - w), r, TAU);
export const discGeo = (r) => arcGeo(0, r, TAU);
export function lineGeo(len, w = 0.14) {
  const key = `line|${len.toFixed(1)}|${w}`;
  if (!geoCache.has(key)) {
    const g = new THREE.PlaneGeometry(w, len);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, len / 2);
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

// ---------- projectiles ----------

const PM = (color, emissive = 0) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 2 : 0, roughness: 0.6 });
const PROJ = {
  arrow: { radius: 0.3, trail: 0xe0d0a0, build: () => shaft(0xd9c39a, 0x8a8a90, 0.85) },
  bolt: { radius: 0.32, trail: 0xc0c0c0, build: () => shaft(0x6a4a30, 0x9a9aa0, 0.6, 0.035) },
  knife: { radius: 0.3, trail: 0xd0d0e0, build: () => blade() },
  hex: { radius: 0.35, trail: 0xb070ff, build: () => orb(0xc890ff, 0x9040ff, 0.2) },
  note: { radius: 0.38, trail: 0xffd860, build: () => orb(0xffe080, 0xffb020, 0.17) },
  ebolt: { radius: 0.3, trail: 0xff8060, build: () => shaft(0x3a2a20, 0xff6040, 0.6, 0.035) },
  holy: { radius: 0.38, trail: 0xffe070, build: () => orb(0xfff0c0, 0xffc030, 0.24) },
  orb: { radius: 0.4, trail: 0xff70a0, build: () => orb(0xff90c0, 0xd02060, 0.26) },
};
function shaft(wood, tip, len, r = 0.025) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), PM(wood));
  s.rotation.x = Math.PI / 2;
  const t = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, 0.14, 5), PM(tip, tip === 0xff6040 ? tip : 0));
  t.rotation.x = Math.PI / 2;
  t.position.z = len / 2 + 0.05;
  g.add(s, t);
  return g;
}
function blade() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.38), PM(0xd0d4e0));
  g.add(b);
  return g;
}
function orb(color, glow, r) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), PM(color, glow));
  return m;
}
const pool = {};

export function fireProjectile(type, from, dir, o) {
  const def = PROJ[type];
  const mesh = (pool[type] ??= []).pop() ?? def.build();
  mesh.position.set(from.x, o.y ?? 1.15, from.z);
  mesh.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  G.scene.add(mesh);
  G.projectiles.push({
    type, mesh, def,
    vel: dir.clone().setY(0).normalize().multiplyScalar(o.speed),
    speed: o.speed,
    dmg: o.dmg,
    owner: o.owner ?? "player",
    pierce: o.pierce ?? 0,
    range: o.range ?? 20,
    traveled: 0,
    splash: o.splash ?? 0,
    slow: o.slow ?? 0,
    homing: o.homing ?? 0,
    crit: !!o.crit,
    knock: o.knock ?? 2,
    noProc: !!o.noProc,
    sneak: !!o.sneak,
    hit: new Set(),
    spin: type === "knife",
    source: o.source ?? null,
  });
}

const prev = new THREE.Vector3();
const seg = new THREE.Vector3();
function segDist2(a, b, p) {
  seg.subVectors(b, a);
  const l2 = seg.x * seg.x + seg.z * seg.z || 1e-6;
  let t = ((p.x - a.x) * seg.x + (p.z - a.z) * seg.z) / l2;
  t = Math.max(0, Math.min(1, t));
  return (a.x + seg.x * t - p.x) ** 2 + (a.z + seg.z * t - p.z) ** 2;
}

function removeProjectile(i) {
  const p = G.projectiles[i];
  G.scene.remove(p.mesh);
  pool[p.type].push(p.mesh);
  G.projectiles.splice(i, 1);
}

export function updateProjectiles(dt) {
  const P = G.player;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    const m = p.mesh;
    if (p.homing) {
      const tgt = p.owner === "player" ? nearestEnemy(m.position, 9) : P;
      if (tgt && !tgt.dead) {
        const want = flatDir(m.position, tgt.pos).multiplyScalar(p.speed);
        p.vel.lerp(want, Math.min(1, p.homing * dt)).setLength(p.speed);
        m.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      }
    }
    prev.copy(m.position);
    m.position.addScaledVector(p.vel, dt);
    p.traveled += p.speed * dt;
    if (p.spin) m.rotation.x += dt * 30;
    if (Math.random() < 0.5) G.fx.burst(m.position, p.def.trail, 1, 0.3, 0.25, 0, 0.1, m.position.y);

    let dead = p.traveled > p.range;
    if (!dead && G.world.blocked(m.position, 0.05)) {
      dead = true;
      G.fx.burst(m.position, 0x9a8a6a, 5, 2, 0.3);
      if (p.splash) splash(p, m.position, null);
    }
    if (!dead && p.owner === "player") {
      for (const e of G.enemies) {
        if (e.dead || e.state === "spawn" || p.hit.has(e)) continue;
        const r = e.radius + p.def.radius;
        if (segDist2(prev, m.position, e.pos) > r * r) continue;
        p.hit.add(e);
        damageEnemy(e, p.dmg, { crit: p.crit, dir: p.vel.clone().normalize(), knock: p.knock, noProc: p.noProc, sneak: p.sneak });
        if (p.slow) e.slowT = Math.max(e.slowT, p.slow);
        if (p.splash) splash(p, m.position, e);
        if (p.pierce-- <= 0) {
          dead = true;
          break;
        }
      }
    } else if (!dead && P && !P.dead) {
      const r = P.radius + p.def.radius;
      if (segDist2(prev, m.position, P.pos) < r * r && P.dodgeTime <= 0) {
        hurtPlayer(p.dmg, p.source);
        dead = true;
      }
    }
    if (dead) removeProjectile(i);
  }
}

function splash(p, at, except) {
  G.fx.decal(discGeo(p.splash), p.def.trail, { x: at.x, z: at.z, life: 0.3, opacity: 0.5, grow: 1.5 });
  G.fx.burst(at, p.def.trail, 14, 4, 0.45, -4, 1.5, 0.6);
  for (const e of G.enemies) {
    if (e === except || e.dead || e.state === "spawn") continue;
    if (dist2(e.pos, at) < (p.splash + e.radius) ** 2) {
      damageEnemy(e, p.dmg * 0.5, { noProc: true });
      if (p.slow) e.slowT = Math.max(e.slowT, p.slow);
    }
  }
}

export function clearProjectiles() {
  for (let i = G.projectiles.length - 1; i >= 0; i--) removeProjectile(i);
}

// ---------- damage ----------

let sparedAt = 0;
export function damageEnemy(e, amount, { crit = false, dir = null, knock = 0, noProc = false, sneak = false } = {}) {
  if (e.dead || e.state === "spawn") return 0;
  const P = G.player;
  if (e.fleeing && P.flaws.softHeart) {
    if (G.time - sparedAt > 0.6) floatText(e.pos, "spared", "info", e.rig.height);
    sparedAt = G.time;
    return 0;
  }
  let dmg = amount;
  if (P.perks.ambush && !e.acted) dmg *= 1.5;
  if (P.perks.sheriffsBane && e.def.sheriff) dmg *= 1.2;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.rig.flash(crit ? 0xffb020 : 0xffffff, 0.09);
  if (knock && dir) e.knock.addScaledVector(dir, knock * P.mods.knock * (e.def.boss ? 0.12 : e.elite ? 0.45 : 1));
  floatText(e.pos, sneak ? `${dmg} sneak!` : dmg, crit ? "crit" : "dmg", e.rig.height);
  G.fx.burst(e.pos, e.kindBlood ?? 0xc03020, crit ? 12 : 6, 3, 0.4, -12, 2.5, e.rig.height * 0.6);
  crit ? sfx.crit() : sfx.hit();
  G.run.damage += dmg;
  if (crit) G.hitstop = Math.max(G.hitstop, 0.04);

  if (crit && P.perks.splitArrow && !noProc) {
    const next = nearestEnemy(e.pos, 9, e);
    if (next) fireProjectile("arrow", e.pos, flatDir(e.pos, next.pos), { speed: 30, dmg: amount * 0.6, range: 10, noProc: true });
  }
  if (e.hp <= 0) return killEnemy(e), dmg;
  if (P.flaws.softHeart && !e.def.boss && !e.fledOnce && e.hp < e.maxHp * 0.25 && Math.random() < 0.5) {
    e.fleeing = true;
    e.fleeT = 3;
    e.fledOnce = true;
    e.rig.release();
  }
  return dmg;
}

function killEnemy(e) {
  const P = G.player;
  e.dead = true;
  e.deathT = 0;
  e.rig.release();
  e.rig.trigger("die");
  if (e.telegraph) G.fx.kill(e.telegraph), (e.telegraph = null);
  if (e.ring) G.scene.remove(e.ring);
  sfx.kill();
  G.run.kills++;
  G.run.renown += e.def.boss ? 25 : e.elite ? 3 : 1;
  let gold = Math.round(rand(e.def.gold[0], e.def.gold[1] + 1) * (e.elite ? 3 : 1) * P.mods.gold);
  if (e.elite && P.perks.robRich) gold *= 2;
  spawnCoins(e.pos, gold);
  if (Math.random() < (e.elite ? 0.6 : 0.06)) spawnPickup("heart", e.pos);
  if (P.mods.leech) healPlayer(P.mods.leech, false);
  G.fx.burst(e.pos, 0xd8c8a0, 16, 4, 0.6, -6, 2, 0.4);
  if (e.elite || e.def.boss) G.hitstop = 0.08;
  G.events.onEnemyKilled?.(e);
}

export function healPlayer(n, show = true) {
  const P = G.player;
  const before = P.hp;
  P.hp = Math.min(P.maxHp, P.hp + n);
  const got = Math.round(P.hp - before);
  if (show && got > 0) {
    floatText(P.pos, `+${got}`, "heal", 2);
    G.fx.burst(P.pos, 0x70ff90, 14, 2, 0.8, 2, 1.5, 1);
    sfx.heal();
  }
}

export function playerArmor(P) {
  const grit = P.stats.grit - (P.flaws.oldWound && P.hp < P.maxHp / 2 ? 2 : 0);
  return Math.floor(grit / 5) + P.mods.armor;
}

export function hurtPlayer(amount, source = null) {
  const P = G.player;
  if (!P || P.dead || P.iframes > 0 || G.mode !== "playing") return;
  const d = Math.max(1, Math.round(amount - playerArmor(P)));
  P.hitThisFloor = true;
  if (P.hp - d <= 0 && P.perks.outlawsLuck && !P.luckUsed) {
    P.luckUsed = true;
    P.hp = 1;
    P.iframes = 1.5;
    banner("Outlaw's Luck!", "You cheat death once this floor");
    G.fx.burst(P.pos, 0xffd860, 30, 5, 0.9, -3, 3, 1);
    return;
  }
  P.hp -= d;
  P.iframes = 0.6;
  P.rig.flash(0xff2a1a, 0.15);
  P.rig.trigger("hurt");
  G.shake = Math.max(G.shake, 0.35);
  sfx.hurt();
  floatText(P.pos, d, "hurt", 2);
  G.events.onPlayerHurt?.();
  if (P.mods.thorns && source && !source.dead) damageEnemy(source, P.mods.thorns, { noProc: true });
  if (P.hp <= 0) {
    P.hp = 0;
    G.events.onPlayerDeath?.();
  }
}

// ---------- pickups ----------

const coinGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcc40, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a00 });
const heartGeo = new THREE.OctahedronGeometry(0.22);
const heartMat = new THREE.MeshStandardMaterial({ color: 0xff4050, emissive: 0xa01020, emissiveIntensity: 1.2 });

export function spawnCoins(at, total) {
  const n = Math.min(12, Math.max(1, Math.ceil(total / 3)));
  let left = total;
  for (let i = 0; i < n; i++) {
    const value = i === n - 1 ? left : Math.floor(total / n);
    left -= value;
    if (value > 0) spawnPickup("coin", at, value);
  }
}

export function spawnPickup(kind, at, value = 1) {
  const mesh = new THREE.Mesh(kind === "coin" ? coinGeo : heartGeo, kind === "coin" ? coinMat : heartMat);
  mesh.position.set(at.x, 0.8, at.z);
  mesh.castShadow = true;
  G.scene.add(mesh);
  const a = Math.random() * TAU, s = rand(1.5, 3.5);
  G.pickups.push({ kind, mesh, value, vel: new THREE.Vector3(Math.cos(a) * s, rand(3, 5), Math.sin(a) * s), age: 0 });
}

export function updatePickups(dt, magnetAll) {
  const P = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    const m = k.mesh;
    k.age += dt;
    const d2 = dist2(m.position, P.pos);
    const magnet = k.age > 0.5 && (magnetAll || d2 < 3.5 * 3.5) && !(k.kind === "heart" && P.hp >= P.maxHp);
    if (magnet) {
      const dir = new THREE.Vector3(P.pos.x - m.position.x, 1.0 - m.position.y, P.pos.z - m.position.z);
      const l = dir.length();
      m.position.addScaledVector(dir.normalize(), Math.min(l, (8 + k.age * 6) * dt));
      if (l < 0.6) {
        if (k.kind === "coin") {
          G.run.gold += k.value;
          G.run.goldEarned += k.value;
          sfx.coin();
        } else healPlayer(3);
        G.scene.remove(m);
        G.pickups.splice(i, 1);
        continue;
      }
    } else {
      k.vel.y -= 14 * dt;
      m.position.addScaledVector(k.vel, dt);
      if (m.position.y < 0.25) {
        m.position.y = 0.25;
        k.vel.y = Math.abs(k.vel.y) * 0.35;
        k.vel.x *= 0.6;
        k.vel.z *= 0.6;
      }
      G.world.collide(m.position, 0.1);
    }
    m.rotation.y += dt * 4;
    if (k.kind === "coin") m.rotation.x = Math.PI / 2.4;
  }
}

export function clearPickups() {
  for (const k of G.pickups) G.scene.remove(k.mesh);
  G.pickups.length = 0;
}
