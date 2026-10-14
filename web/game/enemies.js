// Enemy spawning and AI: melee, ranged, charger, caster and the Sheriff boss.

import * as THREE from "three";
import { G, TAU, rand, dist2, flatDir, yawTo, angleDiff, angleLerp } from "./state.js";
import { ENEMIES } from "./content.js";
import { makeHumanoid, makeQuadruped } from "./models.js";
import { arcGeo, ringGeo, discGeo, lineGeo, fireProjectile, hurtPlayer } from "./combat.js";
import { sfx } from "./audio.js";
import { banner } from "./hud.js";

const eliteRingGeo = new THREE.RingGeometry(0.7, 0.85, 24).rotateX(-Math.PI / 2);
const eliteRingMat = new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
const RED = 0xff3020;

export function spawnEnemy(type, pos, { elite = false, delay = 0.9 } = {}) {
  const def = ENEMIES[type];
  const f = G.run.floor;
  const rig =
    def.kind === "humanoid"
      ? makeHumanoid({ ...def.look, bulk: (def.look.bulk ?? 1) * (elite ? 1.2 : 1), height: (def.look.height ?? 1) * (elite ? 1.12 : 1) })
      : makeQuadruped({ type: def.kind, scale: elite ? 1.3 : 1 });
  const e = {
    type, def, rig, elite,
    pos: pos.clone().setY(0),
    vel: new THREE.Vector3(),
    knock: new THREE.Vector3(),
    facing: yawTo(pos, new THREE.Vector3()),
    hp: 0, maxHp: 0,
    dmg: def.boss ? def.dmg : def.dmg * (1 + 0.12 * (f - 1)) * (elite ? 1.3 : 1),
    speed: def.speed * (elite ? 1.1 : 1),
    radius: def.radius * (elite ? 1.2 : 1),
    state: "spawn", t: delay, cd: rand(0.6, 1.6),
    acted: false, slowT: 0, rootT: 0, stunT: 0, fleeing: false, fleeT: 0, fledOnce: false,
    dead: false, deathT: 0, strafe: Math.random() < 0.5 ? 1 : -1, wander: Math.random() * TAU,
    aimDir: new THREE.Vector3(0, 0, 1), dashCd: 2, healCd: 4, telegraph: null, ring: null,
    kindBlood: def.kind === "humanoid" ? 0xc03020 : 0xa02818,
  };
  e.hp = e.maxHp = def.boss ? def.hp : Math.round(def.hp * (1 + 0.22 * (f - 1)) * (elite ? 2.4 : 1));
  rig.object3d.position.copy(e.pos);
  rig.object3d.rotation.y = e.facing;
  rig.object3d.visible = delay <= 0;
  if (delay <= 0) e.state = "chase";
  G.scene.add(rig.object3d);
  if (elite) {
    e.ring = new THREE.Mesh(eliteRingGeo, eliteRingMat);
    e.ring.scale.setScalar(e.radius / 0.6);
    G.scene.add(e.ring);
  }
  if (delay > 0) e.telegraph = G.fx.decal(ringGeo(e.radius + 0.4, 0.1), elite ? 0xffc040 : RED, { x: pos.x, z: pos.z, opacity: 0.8, keep: true });
  G.enemies.push(e);
  return e;
}

function setTelegraph(e, geo, color = RED, rot = 0, opacity = 0.35) {
  clearTelegraph(e);
  e.telegraph = G.fx.decal(geo, color, { x: e.pos.x, z: e.pos.z, rot, opacity, keep: true });
}
function clearTelegraph(e) {
  if (e.telegraph) G.fx.kill(e.telegraph);
  e.telegraph = null;
}

function inArc(e, target, reach, arc) {
  const r = reach + (target.radius ?? 0.45);
  if (dist2(e.pos, target.pos) > r * r) return false;
  return Math.abs(angleDiff(e.facing, yawTo(e.pos, target.pos))) <= arc / 2;
}

const desired = new THREE.Vector3();
const tmp = new THREE.Vector3();

export function updateEnemies(dt) {
  const P = G.player;
  const list = G.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const rig = e.rig;
    if (e.dead) {
      e.deathT += dt;
      rig.update(dt, 0);
      if (e.deathT > 1.6) rig.object3d.position.y -= dt * 0.7;
      if (e.deathT > 3) {
        G.scene.remove(rig.object3d);
        list.splice(i, 1);
      }
      continue;
    }
    if (e.state === "spawn") {
      e.t -= dt;
      if (e.telegraph) e.telegraph.mesh.material.opacity = 0.4 + Math.sin(G.time * 18) * 0.3;
      if (e.t <= 0) {
        e.state = "chase";
        rig.object3d.visible = true;
        clearTelegraph(e);
        G.fx.burst(e.pos, 0x6a5a40, 14, 3, 0.5, -6, 2, 0.3);
      }
      continue;
    }

    e.slowT -= dt;
    e.rootT -= dt;
    e.cd -= dt;
    e.dashCd -= dt;
    const toP = flatDir(e.pos, P.pos, tmp);
    const dist = Math.sqrt(dist2(e.pos, P.pos));
    const hidden = P.hiddenT > 0 && dist > 2.5;
    desired.set(0, 0, 0);
    let faceTarget = null;
    let speedMul = e.slowT > 0 ? 0.5 : 1;

    if (e.stunT > 0) {
      e.stunT -= dt;
      if (Math.random() < dt * 8) G.fx.burst(e.pos, 0xffe080, 1, 0.5, 0.4, 0, 0.5, rig.height + 0.2);
    } else if (e.fleeing) {
      e.fleeT -= dt;
      desired.copy(toP).multiplyScalar(-1);
      speedMul *= 1.2;
      if (e.fleeT <= 0) e.fleeing = false;
    } else if (P.dead) {
      wander(e, dt);
    } else if (hidden && e.state === "chase") {
      wander(e, dt);
    } else {
      const ai = AI[e.def.ai];
      faceTarget = ai(e, dt, dist, toP);
    }

    if (e.rootT > 0 && e.state !== "charge") desired.set(0, 0, 0);
    if (e.state === "charge") {
      e.vel.copy(e.aimDir).multiplyScalar(e.chargeSpeed);
    } else {
      e.vel.lerp(desired.multiplyScalar(e.speed * speedMul * (e.enraged ? 1.3 : 1)), Math.min(1, dt * 8));
    }
    e.pos.addScaledVector(e.vel, dt).addScaledVector(e.knock, dt);
    e.knock.multiplyScalar(Math.max(0, 1 - dt * 7));

    // Separation
    for (const o of list) {
      if (o === e || o.dead || o.state === "spawn") continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const min = e.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        e.pos.x += (dx / d) * push;
        e.pos.z += (dz / d) * push;
      }
    }
    const bumped = G.world.collide(e.pos, e.radius);
    if (e.state === "charge" && bumped) {
      e.state = "recover";
      e.t = 0.2;
      e.stunT = 1.3;
      G.shake = Math.max(G.shake, 0.2);
      G.fx.burst(e.pos, 0xb09a70, 18, 4, 0.5, -8, 2, 0.6);
    }

    const sp = Math.hypot(e.vel.x, e.vel.z);
    const want = faceTarget != null ? faceTarget : sp > 0.3 ? Math.atan2(e.vel.x, e.vel.z) : e.facing;
    const turn = e.state === "windup" || e.state === "aim" ? 4 : 10;
    e.facing = angleLerp(e.facing, want, Math.min(1, dt * turn));
    rig.object3d.position.copy(e.pos);
    rig.object3d.rotation.y = e.facing;
    rig.update(dt, e.stunT > 0 ? 0 : sp);
    if (e.ring) e.ring.position.set(e.pos.x, 0.04, e.pos.z);
    if (e.telegraph) {
      e.telegraph.mesh.position.set(e.pos.x, 0.05, e.pos.z);
      if (e.telegraphFollowsFacing) e.telegraph.mesh.rotation.y = e.facing;
    }
  }
}

function wander(e, dt) {
  e.wander += (Math.random() - 0.5) * dt * 2;
  desired.set(Math.sin(e.wander), 0, Math.cos(e.wander)).multiplyScalar(0.35);
  if (Math.hypot(e.pos.x, e.pos.z) > G.world.R - 3) desired.set(-e.pos.x, 0, -e.pos.z).normalize().multiplyScalar(0.35);
}

// Each AI returns a yaw to face, or null to face its movement.
const AI = {
  melee(e, dt, dist, toP) {
    const d = e.def;
    const P = G.player;
    switch (e.state) {
      case "chase":
        desired.copy(toP);
        if (d.dash && e.dashCd <= 0 && dist > 3.5 && dist < 9) {
          e.state = "dashWind";
          e.t = 0.45;
          e.rig.trigger("windup");
          setTelegraph(e, lineGeo(7, 0.9), RED, yawTo(e.pos, P.pos), 0.3);
          return yawTo(e.pos, P.pos);
        }
        if (dist < d.reach + P.radius && e.cd <= 0) {
          e.state = "windup";
          e.t = d.windup * (e.elite ? 0.85 : 1);
          e.rig.trigger("windup");
          setTelegraph(e, arcGeo(0.3, d.reach + 0.4, 1.9), RED, e.facing, 0.3);
          e.telegraphFollowsFacing = true;
          sfx.telegraph();
        }
        return null;
      case "windup":
        e.t -= dt;
        if (e.t <= 0) {
          clearTelegraph(e);
          e.telegraphFollowsFacing = false;
          e.rig.trigger("attack");
          e.acted = true;
          if (inArc(e, P, d.reach + 0.3, 1.9) && P.dodgeTime <= 0) hurtPlayer(e.dmg, e);
          e.state = "recover";
          e.t = 0.35;
          e.cd = d.cd * rand(0.85, 1.2);
        }
        return yawTo(e.pos, P.pos);
      case "dashWind":
        e.t -= dt;
        if (e.telegraph) e.telegraph.mesh.rotation.y = e.facing;
        if (e.t <= 0) {
          clearTelegraph(e);
          e.state = "charge";
          e.t = 0.35;
          e.chargeSpeed = 18;
          e.aimDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
          e.hitThisCharge = false;
          e.acted = true;
          e.dashCd = rand(4, 6);
        }
        return yawTo(e.pos, P.pos);
      case "charge":
        return chargeStep(e, dt, 0.8);
      case "recover":
        e.t -= dt;
        desired.copy(toP).multiplyScalar(0.2);
        if (e.t <= 0) e.state = "chase";
        return null;
    }
    e.state = "chase";
    return null;
  },

  ranged(e, dt, dist, toP) {
    const d = e.def;
    const P = G.player;
    const [lo, hi] = d.range;
    switch (e.state) {
      case "chase":
        if (dist > hi) desired.copy(toP);
        else if (dist < lo) desired.copy(toP).multiplyScalar(-1);
        else desired.set(-toP.z * e.strafe, 0, toP.x * e.strafe).multiplyScalar(0.6);
        if (Math.random() < dt * 0.3) e.strafe *= -1;
        if (dist < hi + 3 && e.cd <= 0) {
          e.state = "aim";
          e.t = d.windup;
          e.rig.trigger("aim");
          setTelegraph(e, lineGeo(14, 0.12), RED, yawTo(e.pos, P.pos), 0.5);
        }
        return dist < hi + 3 ? yawTo(e.pos, P.pos) : null;
      case "aim":
        e.t -= dt;
        // Tracks the player, then locks for the last 30% so a dodge can beat it.
        if (e.t > d.windup * 0.3) e.aimDir.copy(toP);
        if (e.telegraph) {
          e.telegraph.mesh.rotation.y = Math.atan2(e.aimDir.x, e.aimDir.z);
          e.telegraph.mesh.material.opacity = 0.25 + (1 - e.t / d.windup) * 0.5;
        }
        if (e.t <= 0) {
          clearTelegraph(e);
          e.rig.release();
          e.rig.trigger("shoot");
          e.acted = true;
          fireProjectile("ebolt", e.pos, e.aimDir, { speed: d.boltSpeed, dmg: e.dmg, owner: "enemy", range: 24, y: 1.2, source: e });
          sfx.enemyShot();
          e.state = "chase";
          e.cd = d.cd * rand(0.8, 1.25);
        }
        return Math.atan2(e.aimDir.x, e.aimDir.z);
    }
    e.state = "chase";
    return null;
  },

  caster(e, dt, dist, toP) {
    const d = e.def;
    const P = G.player;
    e.healCd -= dt;
    if (e.healCd <= 0) {
      e.healCd = 5;
      let healed = false;
      for (const o of G.enemies) {
        if (o.dead || o.state === "spawn" || o.hp >= o.maxHp || dist2(o.pos, e.pos) > 49) continue;
        o.hp = Math.min(o.maxHp, o.hp + Math.ceil(o.maxHp * 0.15));
        G.fx.burst(o.pos, 0x70ff90, 8, 1.5, 0.6, 2, 1.5, 1);
        healed = true;
      }
      if (healed) {
        e.rig.trigger("cast");
        G.fx.decal(discGeo(7), 0x70ff90, { x: e.pos.x, z: e.pos.z, life: 0.5, opacity: 0.18 });
      }
    }
    const [lo, hi] = d.range;
    switch (e.state) {
      case "chase":
        if (dist > hi) desired.copy(toP);
        else if (dist < lo) desired.copy(toP).multiplyScalar(-1);
        else desired.set(-toP.z * e.strafe, 0, toP.x * e.strafe).multiplyScalar(0.4);
        if (dist < hi + 2 && e.cd <= 0) {
          e.state = "cast";
          e.t = d.windup;
          e.rig.trigger("cast");
          setTelegraph(e, ringGeo(0.9, 0.15), 0xff70a0, 0, 0.6);
        }
        return null;
      case "cast":
        e.t -= dt;
        if (e.t <= 0) {
          clearTelegraph(e);
          e.acted = true;
          fireProjectile("orb", e.pos, toP, { speed: d.boltSpeed, dmg: e.dmg, owner: "enemy", range: 22, homing: 1.4, y: 1.3, source: e });
          sfx.magic();
          e.state = "chase";
          e.cd = d.cd * rand(0.85, 1.2);
        }
        return yawTo(e.pos, P.pos);
    }
    e.state = "chase";
    return null;
  },

  charger(e, dt, dist, toP) {
    const d = e.def;
    const P = G.player;
    switch (e.state) {
      case "chase":
        desired.copy(toP).multiplyScalar(dist > 6 ? 1 : 0.3);
        if (dist < 14 && e.cd <= 0) {
          e.state = "windup";
          e.t = d.windup;
          e.rig.trigger("windup");
          setTelegraph(e, lineGeo(d.chargeSpeed * d.chargeTime, 1.2), RED, yawTo(e.pos, P.pos), 0.25);
          sfx.telegraph();
        }
        return null;
      case "windup":
        e.t -= dt;
        if (e.t > 0.2) e.aimDir.copy(toP);
        if (e.telegraph) e.telegraph.mesh.rotation.y = Math.atan2(e.aimDir.x, e.aimDir.z);
        if (Math.random() < dt * 20) G.fx.burst(e.pos, 0x8a7a5a, 1, 1.5, 0.4, -4, 0.5, 0.1);
        if (e.t <= 0) {
          clearTelegraph(e);
          e.rig.release();
          e.state = "charge";
          e.t = d.chargeTime;
          e.chargeSpeed = d.chargeSpeed;
          e.hitThisCharge = false;
          e.acted = true;
        }
        return Math.atan2(e.aimDir.x, e.aimDir.z);
      case "charge":
        return chargeStep(e, dt, 1.4);
      case "recover":
        e.t -= dt;
        if (e.t <= 0) {
          e.state = "chase";
          e.cd = d.cd * rand(0.8, 1.2);
        }
        return null;
    }
    e.state = "chase";
    return null;
  },

  boss(e, dt, dist, toP) {
    return bossAI(e, dt, dist, toP);
  },
};

function chargeStep(e, dt, knock) {
  const P = G.player;
  e.t -= dt;
  if (Math.random() < dt * 30) G.fx.burst(e.pos, 0x9a8a6a, 1, 1, 0.4, -3, 0.5, 0.1);
  if (!e.hitThisCharge && Math.sqrt(dist2(e.pos, P.pos)) < e.radius + P.radius + 0.2 && P.dodgeTime <= 0) {
    e.hitThisCharge = true;
    hurtPlayer(e.dmg, e);
    P.knock.addScaledVector(e.aimDir, 9 * knock);
  }
  if (e.t <= 0) {
    e.state = "recover";
    e.t = 0.5;
    e.cd = e.def.cd * rand(0.8, 1.2);
  }
  return Math.atan2(e.aimDir.x, e.aimDir.z);
}

// ---------- the Sheriff ----------

function bossAI(e, dt, dist, toP) {
  const d = e.def;
  const P = G.player;
  const frac = e.hp / e.maxHp;
  if (!e.enraged && frac < 0.3) {
    e.enraged = true;
    banner("The Sheriff is enraged!", "", 1800);
    sfx.horn();
    e.rig.flash(0xff2000, 0.4);
  }
  const quick = e.enraged ? 0.75 : 1;
  e.summonCd = (e.summonCd ?? 6) - dt;
  switch (e.state) {
    case "chase": {
      desired.copy(toP).multiplyScalar(dist > 3 ? 1 : 0.2);
      if (e.cd > 0) return null;
      const roll = Math.random();
      if (e.summonCd <= 0) {
        e.state = "summon";
        e.t = 1.0;
        e.rig.trigger("cast");
        sfx.horn();
        banner("To me, men of Nottingham!", "", 1400);
      } else if (dist < d.reach + 1.2) {
        e.state = "combo";
        e.combo = 3;
        e.t = d.windup * quick;
        e.rig.trigger("windup");
        setTelegraph(e, arcGeo(0.3, d.reach + 0.5, 1.9), RED, e.facing, 0.35);
        e.telegraphFollowsFacing = true;
      } else if (frac < 0.65 && roll < 0.4 && dist > 5) {
        e.state = "dashWind";
        e.t = 0.6 * quick;
        e.rig.trigger("windup");
        setTelegraph(e, lineGeo(10, 1.4), RED, yawTo(e.pos, P.pos), 0.3);
      } else if (dist > 5 && roll < 0.75) {
        e.state = "volley";
        e.t = 0.9 * quick;
        e.rig.trigger("aim");
        const n = frac < 0.5 ? 7 : 5;
        e.volleyN = n;
        setTelegraph(e, arcGeo(1, 14, 0.18 * (n - 1) + 0.1), RED, yawTo(e.pos, P.pos), 0.18);
        e.telegraphFollowsFacing = true;
      } else {
        e.cd = 0.4;
      }
      return null;
    }
    case "combo":
      e.t -= dt;
      desired.copy(toP).multiplyScalar(0.15);
      if (e.t <= 0) {
        e.rig.trigger("attack");
        sfx.swing();
        e.acted = true;
        e.knock.addScaledVector(toP, 4);
        if (inArc(e, P, d.reach + 0.4, 1.9) && P.dodgeTime <= 0) hurtPlayer(e.dmg, e);
        G.fx.decal(arcGeo(0.3, d.reach + 0.5, 1.9), 0xffe0c0, { x: e.pos.x, z: e.pos.z, rot: e.facing, life: 0.2, opacity: 0.5 });
        if (--e.combo > 0) {
          e.t = 0.38 * quick;
          e.rig.trigger("windup");
        } else {
          clearTelegraph(e);
          e.telegraphFollowsFacing = false;
          e.state = "recover";
          e.t = 0.7 * quick;
          e.cd = 0.5;
        }
      }
      return yawTo(e.pos, P.pos);
    case "volley":
      e.t -= dt;
      if (e.t <= 0) {
        clearTelegraph(e);
        e.telegraphFollowsFacing = false;
        e.rig.release();
        e.rig.trigger("shoot");
        const n = e.volleyN;
        for (let k = 0; k < n; k++) {
          const a = e.facing + (k - (n - 1) / 2) * 0.18;
          fireProjectile("ebolt", e.pos, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), { speed: 16, dmg: e.dmg * 0.7, owner: "enemy", range: 26, y: 1.4, source: e });
        }
        sfx.enemyShot();
        e.state = "recover";
        e.t = 0.6 * quick;
        e.cd = 0.8;
      }
      return yawTo(e.pos, P.pos);
    case "dashWind":
      e.t -= dt;
      if (e.telegraph) e.telegraph.mesh.rotation.y = e.facing;
      if (e.t <= 0) {
        clearTelegraph(e);
        e.rig.release();
        e.state = "charge";
        e.t = 0.55;
        e.chargeSpeed = 18;
        e.aimDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
        e.hitThisCharge = false;
        e.acted = true;
      }
      return yawTo(e.pos, P.pos);
    case "charge":
      return chargeStep(e, dt, 1.2);
    case "summon":
      e.t -= dt;
      if (e.t <= 0) {
        const n = e.enraged ? 4 : frac < 0.6 ? 3 : 2;
        const spawns = [...G.world.spawns].sort(() => Math.random() - 0.5).slice(0, n);
        spawns.forEach((p, k) => spawnEnemy(k % 2 && frac < 0.7 ? "crossbow" : "guard", p, { delay: 1.0 }));
        e.summonCd = 15;
        e.state = "recover";
        e.t = 0.4;
      }
      return null;
    case "recover":
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
      return null;
  }
  e.state = "chase";
  return null;
}

export function clearEnemies() {
  for (const e of G.enemies) {
    G.scene.remove(e.rig.object3d);
    if (e.ring) G.scene.remove(e.ring);
    clearTelegraph(e);
  }
  G.enemies.length = 0;
}

// Wave budgets grow with depth; new enemy types unlock as you go.
export function buildWaves(floor, rng, P) {
  const types = Object.entries(ENEMIES).filter(([, d]) => d.from <= floor && !d.boss);
  const waves = [];
  const count = Math.min(2 + Math.floor((floor - 1) / 2), 4);
  for (let w = 0; w < count; w++) {
    let budget = 3 + floor * 2 + w * 2;
    const wave = [];
    let elites = 0;
    while (budget > 0) {
      const options = types.filter(([, d]) => d.cost <= budget);
      if (!options.length) break;
      const [type, d] = options[(rng.float() * options.length) | 0];
      const elite = elites < 1 + Math.floor(floor / 4) && rng.float() < 0.05 + floor * 0.03;
      if (elite) elites++;
      wave.push({ type, elite });
      budget -= d.cost * (elite ? 2 : 1);
    }
    waves.push(wave);
  }
  if (P.flaws.wanted && floor % 3 === 0) waves[Math.min(1, waves.length - 1)].push({ type: "hunter", elite: true, bounty: true });
  return waves;
}
