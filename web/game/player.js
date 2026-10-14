// The hero: derived stats, movement, dodge, attacks, archetype abilities, followers and snares.

import * as THREE from "three";
import { G, TAU, rand, dist2, flatDir, yawTo, angleDiff, angleLerp, after, nearestEnemy } from "./state.js";
import { KITS, PERK_IDS, FLAW_IDS, RELIC_EFFECTS } from "./content.js";
import { fireProjectile, damageEnemy, healPlayer, arcGeo, ringGeo, discGeo } from "./combat.js";
import { makeFollower } from "./models.js";
import { sfx } from "./audio.js";
import { floatText } from "./hud.js";

export function createPlayer(character, rig) {
  const kit = KITS[character.archetype];
  const P = {
    c: character, kit, rig,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    knock: new THREE.Vector3(),
    facing: Math.PI,
    radius: 0.45,
    maxHp: character.hp,
    hp: character.hp,
    stats: { ...character.stats },
    mods: { dmg: 1, rate: 1, speed: 1, crit: 0, critMul: 2, cd: 1, multishot: 0, pierce: kit.pierce ?? 0, arc: 1, knock: 1,
      armor: kit.armor ?? 0, gold: 1, leech: 0, thorns: 0, dodgeCd: 1, regen: 0, price: 1, clearHeal: 0 },
    perks: {}, flaws: {},
    atkT: 0, abilT: 0, dodgeT: 0, dodgeTime: 0, dodgeDir: new THREE.Vector3(), iframes: 0, buffT: 0, rootT: 0,
    hiddenT: 0, sneak: false, luckUsed: false, dead: false, aimT: 0, regenAcc: 0, chargeT: 0, chargeHit: new Set(),
    courage: 0, hitThisFloor: false,
  };
  for (const p of character.perks) if (PERK_IDS[p.name]) P.perks[PERK_IDS[p.name]] = true;
  if (FLAW_IDS[character.flaw.name]) P.flaws[FLAW_IDS[character.flaw.name]] = true;
  RELIC_EFFECTS[character.relic]?.apply(P);
  return P;
}

export const baseDamage = (P) => {
  const s = P.stats, k = P.kit;
  const b = k.type === "melee" ? 3 + s.might * 0.6 : k.type === "ranged" ? 2 + s.finesse * 0.55 : 2 + s.cunning * 0.6;
  return b * (k.dmgMul ?? 1) * P.mods.dmg * (P.buffT > 0 ? 1.4 : 1) * (1 + P.courage);
};
export const critChance = (P) => Math.min(0.75, 0.05 + P.stats.cunning * 0.012 + P.mods.crit);
export const attackInterval = (P) => P.kit.rate / ((1 + P.stats.finesse * 0.03) * P.mods.rate * (P.buffT > 0 ? 1.25 : 1));
export const moveSpeed = (P) => 5.4 * (1 + P.stats.finesse * 0.012) * P.mods.speed * (P.buffT > 0 ? 1.25 : 1);
export const abilityCd = (P) => P.kit.ability.cd * Math.max(0.35, (1 - P.stats.cunning * 0.02) * P.mods.cd);
export const dodgeCd = (P) => 0.9 * P.mods.dodgeCd;

function roll(P, mul = 1) {
  const crit = Math.random() < critChance(P);
  let dmg = baseDamage(P) * mul * (crit ? P.mods.critMul : 1);
  const sneak = P.sneak;
  if (sneak) dmg *= 2.5;
  return { dmg, crit: crit || sneak, sneak };
}

// Called after the first attack of a cloaked floor.
function reveal(P) {
  P.sneak = false;
  P.hiddenT = 0;
}

const input = new THREE.Vector3();
const aim = new THREE.Vector3();

export function updatePlayer(dt) {
  const P = G.player;
  const rig = P.rig;
  const k = G.keys;
  P.atkT -= dt;
  P.abilT -= dt;
  P.dodgeT -= dt;
  P.iframes -= dt;
  P.buffT -= dt;
  P.rootT -= dt;
  P.aimT -= dt;
  if (P.hiddenT > 0) P.hiddenT -= dt;
  if (P.mods.regen && P.hp < P.maxHp) {
    P.regenAcc += P.mods.regen * dt;
    if (P.regenAcc >= 1) (P.regenAcc -= 1), healPlayer(1, false);
  }

  input.set((k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0), 0, (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0));
  if (input.lengthSq() > 1) input.normalize();
  flatDir(P.pos, G.mouse, aim);

  let speed = moveSpeed(P);
  if (P.dodgeTime > 0) {
    P.dodgeTime -= dt;
    P.vel.copy(P.dodgeDir).multiplyScalar(15);
    if (Math.random() < dt * 40) G.fx.burst(P.pos, 0xa89878, 1, 1, 0.35, -2, 0.4, 0.15);
  } else if (P.chargeT > 0) {
    P.chargeT -= dt;
    P.vel.set(Math.sin(P.facing), 0, Math.cos(P.facing)).multiplyScalar(26);
    for (const e of G.enemies) {
      if (e.dead || e.state === "spawn" || P.chargeHit.has(e)) continue;
      if (dist2(e.pos, P.pos) < (e.radius + 1.0) ** 2) {
        P.chargeHit.add(e);
        const r = roll(P, 1.5);
        damageEnemy(e, r.dmg, { crit: r.crit, dir: P.vel.clone().normalize(), knock: 10, sneak: r.sneak });
        if (!e.def.boss) e.stunT = 1.2;
      }
    }
    if (Math.random() < dt * 40) G.fx.burst(P.pos, 0xd8d0b0, 2, 2, 0.4, -4, 1, 0.5);
  } else {
    if (P.rootT > 0) speed = 0;
    if (G.mouseDown && P.kit.type === "melee") speed *= 0.7;
    P.vel.lerp(input.clone().multiplyScalar(speed), Math.min(1, dt * 14));
  }
  P.pos.addScaledVector(P.vel, dt).addScaledVector(P.knock, dt);
  P.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
  G.world.collide(P.pos, P.radius, true);

  // Facing: aim while attacking, otherwise face where we move.
  const moving = Math.hypot(P.vel.x, P.vel.z);
  if (P.chargeT <= 0) {
    if (G.mouseDown || P.aimT > 0) P.facing = angleLerp(P.facing, Math.atan2(aim.x, aim.z), Math.min(1, dt * 20));
    else if (moving > 0.5) P.facing = angleLerp(P.facing, Math.atan2(P.vel.x, P.vel.z), Math.min(1, dt * 12));
  }

  if (G.mouseDown && P.atkT <= 0 && P.dodgeTime <= 0 && P.chargeT <= 0) attack(P);

  rig.object3d.position.copy(P.pos);
  rig.object3d.rotation.y = P.facing;
  rig.update(dt, moving);
  if (P.cloakRing) {
    P.cloakRing.visible = P.hiddenT > 0;
    P.cloakRing.position.set(P.pos.x, 0.05, P.pos.z);
    P.cloakRing.rotation.y += dt;
  }
  updateFollowers(dt);
  updateSnares(dt);
}

export function tryDodge() {
  const P = G.player;
  if (P.dodgeT > 0 || P.dead || P.chargeT > 0) return;
  const k = G.keys;
  const dir = new THREE.Vector3((k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0), 0, (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0));
  if (dir.lengthSq() < 0.01) dir.set(Math.sin(P.facing), 0, Math.cos(P.facing));
  P.dodgeDir.copy(dir.normalize());
  P.dodgeTime = 0.26;
  P.iframes = Math.max(P.iframes, 0.32);
  P.dodgeT = dodgeCd(P);
  P.rootT = 0;
  P.facing = Math.atan2(dir.x, dir.z);
  P.rig.trigger("dodge");
  sfx.dodge();
}

function attack(P) {
  const kit = P.kit;
  P.atkT = attackInterval(P);
  P.aimT = 0.6;
  P.facing = Math.atan2(aim.x, aim.z);
  if (kit.type === "melee") {
    const reach = kit.reach * P.mods.arc;
    const arc = Math.min(TAU, kit.arc * P.mods.arc);
    meleeHit(P, reach, arc, 1, kit.knock);
    P.rig.trigger("attack");
    P.knock.addScaledVector(aim, 2.5);
    sfx.swing();
  } else {
    const n = 1 + P.mods.multishot;
    const r = roll(P);
    const from = P.pos.clone().addScaledVector(aim, 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(aim.x, aim.z) + (i - (n - 1) / 2) * 0.12 + (Math.random() - 0.5) * kit.spread;
      fireProjectile(kit.proj, from, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), {
        speed: kit.speed, dmg: r.dmg, crit: r.crit, sneak: r.sneak, pierce: P.mods.pierce, range: kit.range,
        splash: kit.splash, slow: kit.slow, homing: kit.homing, knock: kit.proj === "bolt" ? 4 : 2,
      });
    }
    P.rig.trigger(kit.type === "caster" ? "cast" : "shoot");
    kit.proj === "note" ? sfx.note() : kit.proj === "hex" ? sfx.magic() : sfx.bow();
  }
  if (P.sneak || P.hiddenT > 0) reveal(P);
}

function meleeHit(P, reach, arc, mul, knock) {
  const r = roll(P, mul);
  G.fx.decal(arcGeo(0.4, reach, arc), r.crit ? 0xffd070 : 0xfff4dc, { x: P.pos.x, z: P.pos.z, rot: P.facing, life: 0.18, opacity: 0.55 });
  let hits = 0;
  for (const e of G.enemies) {
    if (e.dead || e.state === "spawn") continue;
    const rr = reach + e.radius;
    if (dist2(e.pos, P.pos) > rr * rr) continue;
    if (arc < TAU - 0.01 && Math.abs(angleDiff(P.facing, yawTo(P.pos, e.pos))) > arc / 2 + 0.15) continue;
    damageEnemy(e, r.dmg, { crit: r.crit, dir: flatDir(P.pos, e.pos), knock, sneak: r.sneak });
    hits++;
  }
  if (hits) G.shake = Math.max(G.shake, 0.08 + hits * 0.02);
  return hits;
}

function aoe(center, radius, mul, { stun = 0, root = 0, knock = 6, color = 0xffe0a0 } = {}) {
  const P = G.player;
  const r = roll(P, mul);
  G.fx.decal(discGeo(radius), color, { x: center.x, z: center.z, life: 0.4, opacity: 0.4 });
  G.fx.decal(ringGeo(radius, 0.25), color, { x: center.x, z: center.z, life: 0.5, opacity: 0.9, grow: 0.6 });
  for (const e of G.enemies) {
    if (e.dead || e.state === "spawn") continue;
    if (dist2(e.pos, center) > (radius + e.radius) ** 2) continue;
    damageEnemy(e, r.dmg, { crit: r.crit, dir: flatDir(center, e.pos), knock, sneak: r.sneak });
    if (stun && !e.def.boss) e.stunT = Math.max(e.stunT, stun);
    if (stun && e.def.boss) e.stunT = Math.max(e.stunT, stun * 0.3);
    if (root) e.rootT = Math.max(e.rootT, root);
  }
}

export function tryAbility() {
  const P = G.player;
  if (P.abilT > 0 || P.dead || P.dodgeTime > 0) return;
  P.abilT = abilityCd(P);
  P.aimT = 0.6;
  const dir = flatDir(P.pos, G.mouse);
  P.facing = Math.atan2(dir.x, dir.z);
  switch (P.kit.ability.id) {
    case "volley": {
      const r = roll(P, 0.9);
      for (let i = 0; i < 7; i++) {
        const a = P.facing + (i - 3) * 0.13;
        fireProjectile("arrow", P.pos.clone().addScaledVector(dir, 0.5), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), {
          speed: 30, dmg: r.dmg, crit: r.crit, sneak: r.sneak, pierce: P.mods.pierce + 1, range: 22,
        });
      }
      P.rig.trigger("shoot");
      sfx.bow();
      after(0.05, sfx.bow);
      break;
    }
    case "slam":
      P.rig.trigger("slam");
      after(0.25, () => {
        aoe(P.pos, 4.5, 1.6, { stun: 1.5, knock: 9, color: 0xd8b070 });
        G.fx.burst(P.pos, 0x9a8060, 40, 7, 0.7, -10, 3, 0.2);
        G.shake = 0.6;
        sfx.slam();
      });
      break;
    case "flask":
      P.rig.trigger("cast");
      healPlayer(Math.ceil(P.maxHp * 0.3));
      aoe(P.pos, 3.5, 1.2, { color: 0xffd060, knock: 5 });
      G.fx.burst(P.pos, 0xffc040, 30, 4, 0.8, -2, 3, 1);
      break;
    case "thorns": {
      const at = P.pos.clone().addScaledVector(dir, Math.min(12, Math.sqrt(dist2(P.pos, G.mouse))));
      P.rig.trigger("cast");
      sfx.magic();
      G.fx.decal(ringGeo(3, 0.15), 0x80ff60, { x: at.x, z: at.z, life: 0.35, opacity: 0.8 });
      after(0.3, () => {
        aoe(at, 3, 1.8, { root: 2.8, color: 0x60c040, knock: 0 });
        spawnBrambles(at, 3);
        sfx.slam();
      });
      break;
    }
    case "snare": {
      if (G.snares.length >= 3) removeSnare(0);
      const mesh = G.world.makeTrap(P.pos.x, P.pos.z);
      mesh.traverse((c) => c.isMesh && (c.material = c.material.clone(), c.material.color.setHex(0xc8a060)));
      G.snares.push({ mesh, pos: P.pos.clone(), armT: 0.4 });
      floatText(P.pos, "snare set", "info", 1.6);
      sfx.snap();
      break;
    }
    case "charge":
      P.chargeT = 0.28;
      P.chargeHit.clear();
      P.iframes = Math.max(P.iframes, 0.4);
      P.rig.trigger("attack");
      sfx.dodge();
      sfx.swing();
      break;
    case "sweep":
      P.rig.trigger("spin");
      meleeHit(P, 3.3, TAU, 1.4, 8);
      G.fx.burst(P.pos, 0xe0e0e0, 24, 6, 0.4, -4, 1, 0.9);
      sfx.swing();
      after(0.1, sfx.swing);
      break;
    case "ballad":
      P.buffT = 6;
      P.rig.trigger("cast");
      healPlayer(4);
      G.fx.burst(P.pos, 0xffd860, 40, 3, 1.2, 1, 3, 1.2);
      [0, 0.12, 0.24].forEach((t) => after(t, sfx.note));
      break;
  }
  if (P.sneak || P.hiddenT > 0) reveal(P);
}

const brambleGeo = new THREE.ConeGeometry(0.12, 0.9, 4);
const brambleMat = new THREE.MeshStandardMaterial({ color: 0x3a5a20, flatShading: true });
function spawnBrambles(at, r) {
  const g = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
    const m = new THREE.Mesh(brambleGeo, brambleMat);
    m.position.set(at.x + Math.cos(a) * d, 0.3, at.z + Math.sin(a) * d);
    m.rotation.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
    m.scale.setScalar(0.6 + Math.random() * 0.8);
    g.add(m);
  }
  G.scene.add(g);
  after(2.8, () => G.scene.remove(g));
}

// ---------- snares (poacher) ----------

function removeSnare(i) {
  G.scene.remove(G.snares[i].mesh);
  G.world.dynamic.remove(G.snares[i].mesh);
  G.snares.splice(i, 1);
}
function updateSnares(dt) {
  for (let i = G.snares.length - 1; i >= 0; i--) {
    const s = G.snares[i];
    s.armT -= dt;
    if (s.armT > 0) continue;
    const e = G.enemies.find((x) => !x.dead && x.state !== "spawn" && dist2(x.pos, s.pos) < (x.radius + 0.5) ** 2);
    if (!e) continue;
    const r = roll(G.player, 2.5);
    damageEnemy(e, r.dmg, { crit: r.crit });
    e.rootT = e.def.boss ? 1 : 3;
    sfx.snap();
    G.fx.burst(s.pos, 0xc8c8d0, 12, 3, 0.4, -8, 2, 0.3);
    removeSnare(i);
  }
}
export function clearSnares() {
  while (G.snares.length) removeSnare(0);
}

// ---------- followers (Merry Band recruits) ----------

export function addFollower() {
  const rig = makeFollower();
  const P = G.player;
  const f = { rig, pos: P.pos.clone().add(new THREE.Vector3(rand(-1, 1), 0, 1.5)), facing: P.facing, cd: rand(0.3, 1), idx: G.followers.length };
  rig.object3d.position.copy(f.pos);
  G.scene.add(rig.object3d);
  G.followers.push(f);
}

export function placeFollowers() {
  const P = G.player;
  G.followers.forEach((f, i) => {
    f.pos.set(P.pos.x + (i - 1) * 1.4, 0, P.pos.z + 1.6);
    f.rig.object3d.position.copy(f.pos);
    if (!f.rig.object3d.parent) G.scene.add(f.rig.object3d);
  });
}

function updateFollowers(dt) {
  const P = G.player;
  const dmg = (3 + G.run.floor * 0.7) * (P.perks.merryBand ? 1.25 : 1);
  G.followers.forEach((f, i) => {
    const slot = P.pos.clone().add(new THREE.Vector3(Math.sin(P.facing + Math.PI + (i - 1) * 0.8) * 2, 0, Math.cos(P.facing + Math.PI + (i - 1) * 0.8) * 2));
    const to = slot.sub(f.pos);
    const d = to.length();
    const v = d > 0.4 ? to.normalize().multiplyScalar(Math.min(d * 3, 7)) : to.set(0, 0, 0);
    f.pos.addScaledVector(v, dt);
    G.world.collide(f.pos, 0.35);
    f.cd -= dt;
    const tgt = nearestEnemy(f.pos, 14);
    let face = v.lengthSq() > 0.1 ? Math.atan2(v.x, v.z) : f.facing;
    if (tgt) {
      face = yawTo(f.pos, tgt.pos);
      if (f.cd <= 0) {
        f.cd = rand(1.0, 1.3);
        fireProjectile("arrow", f.pos, flatDir(f.pos, tgt.pos), { speed: 26, dmg, range: 16, y: 1.0 });
        f.rig.trigger("shoot");
      }
    }
    f.facing = angleLerp(f.facing, face, Math.min(1, dt * 10));
    f.rig.object3d.position.copy(f.pos);
    f.rig.object3d.rotation.y = f.facing;
    f.rig.update(dt, v.length());
  });
}
