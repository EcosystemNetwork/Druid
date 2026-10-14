// Outlaws of Sherwood: bootstrap, input, run/floor flow, menus and the main loop.

import * as THREE from "three";
import { forgeCharacter, ARCHETYPES, makeRng, randomSeed } from "/lib/forge.js";
import { G, TAU, rand, dist2, after } from "./state.js";
import { World } from "./world.js";
import { FX, updateProjectiles, clearProjectiles, updatePickups, clearPickups, spawnCoins, spawnPickup, healPlayer, hurtPlayer, fireProjectile, playerArmor, damageEnemy, ringGeo } from "./combat.js";
import { spawnEnemy, updateEnemies, clearEnemies, buildWaves } from "./enemies.js";
import { createPlayer, updatePlayer, tryDodge, tryAbility, addFollower, placeFollowers, clearSnares, baseDamage, critChance, abilityCd, dodgeCd } from "./player.js";
import { makeHero, loadGLBRig } from "./models.js";
import { listHeroes, deleteHero } from "./heroes.js";
import { forgeInBrowser, getBalance, savedProgress, STEP_LABELS } from "./tripo-browser.js";
import { KITS, UPGRADES, RARITY_WEIGHT, RARITY_PRICE, RELIC_EFFECTS, FINAL_FLOOR, SHOP_AFTER } from "./content.js";
import { initAudio, sfx, startMusic, stopMusic, toggleMute, isMuted } from "./audio.js";
import { floatText, updateFloats, clearFloats, updateEnemyBars, banner, setPrompt, bossBar, flashHurt, updateHud, cardHTML, esc } from "./hud.js";

const $ = (id) => document.getElementById(id);
const SCREENS = ["screen-select", "screen-reward", "screen-shop", "screen-pause", "screen-summary", "screen-forge"];
const show = (id) => SCREENS.forEach((s) => ($(s).hidden = s !== id));

// ---------- renderer & scene ----------

const renderer = new THREE.WebGLRenderer({ canvas: $("c"), antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 320);
Object.assign(G, { scene, camera, renderer });
G.world = new World(scene);
G.fx = new FX(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- input ----------

const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
const crosshair = $("crosshair");
let zoom = 1;

addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (G.mode === "playing" && (e.code === "Space" || e.code.startsWith("Arrow"))) e.preventDefault();
  G.keys.add(e.code);
  if (e.repeat) return;
  if (G.mode === "playing") {
    if (e.code === "Space") tryDodge();
    else if (e.code === "KeyQ") tryAbility();
    else if (e.code === "KeyE") interact();
    else if (e.code === "Escape" || e.code === "KeyP") pause(true);
  } else if (G.mode === "paused" && (e.code === "Escape" || e.code === "KeyP")) pause(false);
  if (e.code === "KeyM") setMute();
});
addEventListener("keyup", (e) => G.keys.delete(e.code));
addEventListener("blur", () => {
  G.keys.clear();
  G.mouseDown = false;
  if (G.mode === "playing") pause(true);
});
addEventListener("mousemove", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  crosshair.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});
$("c").addEventListener("mousedown", (e) => {
  initAudio();
  if (G.mode !== "playing") return;
  if (e.button === 0) G.mouseDown = true;
  if (e.button === 2) tryAbility();
});
addEventListener("mouseup", (e) => e.button === 0 && (G.mouseDown = false));
$("c").addEventListener("contextmenu", (e) => e.preventDefault());
$("c").addEventListener("wheel", (e) => (zoom = Math.max(0.65, Math.min(1.4, zoom + Math.sign(e.deltaY) * 0.06))), { passive: true });

function updateMouse() {
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(aimPlane, G.mouse)) G.mouse.y = 0;
}

function setMute() {
  const m = toggleMute();
  $("mute").textContent = `Sound: ${m ? "off" : "on"}`;
}
$("mute").textContent = `Sound: ${isMuted() ? "off" : "on"}`;

// ---------- camera ----------

const camOffset = new THREE.Vector3(0, 15, 10);
const camLook = new THREE.Vector3();
const camWant = new THREE.Vector3();

function updateCamera(dt) {
  const P = G.player;
  const lead = new THREE.Vector3(G.mouse.x - P.pos.x, 0, G.mouse.z - P.pos.z).clampLength(0, 8).multiplyScalar(0.18);
  camWant.copy(P.pos).add(lead).addScaledVector(camOffset, zoom);
  const k = 1 - Math.exp(-dt * 6);
  camera.position.lerp(camWant, k);
  camLook.lerp(P.pos.clone().add(lead).setY(0.8), k);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.5;
    G.shake = Math.max(0, G.shake - dt * 1.8);
  }
  camera.lookAt(camLook);
}

// ---------- hero select ----------

const ATTACK_NAMES = { bow: "Longbow", staff: "Quarterstaff sweep", mace: "Mace blows", twig: "Hex bolts", dagger: "Throwing knives", sword: "Longsword", crossbow: "Heavy crossbow", lute: "Enchanted notes" };
let selected = null;
let lastSel = null;

const kitHTML = (c) => {
  const k = KITS[c.archetype];
  return `<div class="kit"><b>${ATTACK_NAMES[k.weapon]}</b> · ${k.type}<br><b>Q · ${esc(k.ability.name)}.</b> ${esc(k.ability.text)}
    <br><b>Relic:</b> ${esc(RELIC_EFFECTS[c.relic]?.text ?? "")}</div>`;
};

function select(sel, btn) {
  selected = sel;
  document.querySelectorAll(".band button").forEach((b) => b.classList.toggle("on", b === btn));
  const note = sel.glb ? "Plays with the forged, rigged 3D model." : "Plays with a hand-built low-poly look. Forge this hero for the full 3D model.";
  const remove = sel.local ? ' <a href="#" id="unband" style="color:var(--muted)">Remove from band</a>' : "";
  $("preview").innerHTML = cardHTML(sel.character, kitHTML(sel.character) + `<p class="note">${note}${remove}</p>`);
  $("begin").disabled = false;
  $("forge3d").hidden = !!sel.glb;
  $("forge3d").textContent = savedProgress(sel.character.seed) ? "Resume forging this hero in 3D" : "Forge this hero in 3D";
  if (sel.local)
    $("unband").onclick = async (e) => {
      e.preventDefault();
      if (!confirm(`Remove ${sel.character.name} and their 3D model from this browser?`)) return;
      await deleteHero(sel.character.seed);
      selected = null;
      $("preview").innerHTML = '<p class="muted">Pick a hero from the band or roll a stranger.</p>';
      $("begin").disabled = true;
      loadBand();
    };
}

const fileUrl = (dir, f) => (/^https?:/.test(f) ? f : `/output/${dir}/${f}`);
const yawKey = (dir) => `sherwood.yaw.${dir}`;
function savedYaw(dir, fallback) {
  try {
    const v = localStorage.getItem(yawKey(dir));
    return v == null ? fallback : Number(v);
  } catch {
    return fallback;
  }
}

async function initSelect() {
  for (const [id, a] of Object.entries(ARCHETYPES)) $("arch").add(new Option(`${a.label} · ${a.role}`, id));
  $("rollbtn").onclick = () => {
    sfx.ui();
    const c = forgeCharacter({ seed: $("seed").value.trim() || undefined, archetype: $("arch").value || undefined });
    select({ character: c, glb: null }, null);
  };
  $("begin").onclick = () => selected && startRun(selected);
  $("forge3d").onclick = () => selected && openForge(selected.character);
  showBest();
  await loadBand();
}

const heroUrls = new Map(); // seed -> { url, thumb }, created once so a running hero never loses its model
let serverBand = null; // null = no Forge server (static hosting)

async function loadBand() {
  const band = $("band");
  if (serverBand === null) {
    try {
      const r = await fetch("/api/characters");
      if (r.ok && r.headers.get("content-type")?.includes("json")) serverBand = await r.json();
    } catch {}
    serverBand ??= false;
  }
  const local = await listHeroes();
  band.innerHTML = "";
  const want = new URLSearchParams(location.search).get("dir");
  const add = (c, thumb, sub, sel, preselect) => {
    const b = document.createElement("button");
    b.innerHTML = `${thumb ? `<img src="${thumb}" alt="">` : '<img alt="">'}
      <span><span style="color:var(--${c.rarity})">${esc(c.name)}</span><small>${esc(c.archetypeLabel)} · ${sub}</small></span>`;
    b.onclick = () => (sfx.ui(), select(sel, b));
    band.append(b);
    if (preselect) select(sel, b);
  };
  for (const h of local) {
    if (!heroUrls.has(h.seed)) heroUrls.set(h.seed, { url: URL.createObjectURL(h.glb), thumb: h.thumb ? URL.createObjectURL(h.thumb) : null });
    const { url, thumb } = heroUrls.get(h.seed);
    const dir = `local:${h.seed}`;
    add(h.character, thumb, "3D model · this browser", { character: h.character, local: true, glb: { url, dir, yaw: savedYaw(dir, -Math.PI / 2) } }, false);
  }
  for (const item of serverBand || []) {
    const c = item.character;
    const model = item.files.animate?.model ?? item.files.rig?.model;
    const thumb = item.files.generate?.rendered_image;
    const sel = { character: c, glb: model ? { url: fileUrl(item.dir, model), dir: item.dir, yaw: savedYaw(item.dir, item.dryRun ? Math.PI : -Math.PI / 2) } : null };
    add(c, thumb && !/^https?:/.test(thumb) ? fileUrl(item.dir, thumb) : null, `${model ? "3D model" : "no model yet"}${item.dryRun ? " · dry run" : ""}`, sel, want && item.dir === want);
  }
  if (serverBand)
    $("band-note").innerHTML = 'Roll a stranger and forge them in 3D here with your Tripo key, or use the <a href="/" style="color:var(--green-hi)">Sherwood Forge</a> page.';
  if (!band.children.length)
    band.innerHTML = '<span class="muted">No forged heroes yet. Roll a stranger, then forge them in 3D with your Tripo key, or just play them as they are.</span>';
}

// ---------- in-browser forge ----------

let forging = null; // { character } while a forge is running
let forgeChar = null;

function loadKey() {
  try {
    return localStorage.getItem("sherwood.tripoKey") ?? "";
  } catch {
    return "";
  }
}
function storeKey(key) {
  try {
    if ($("tremember").checked) localStorage.setItem("sherwood.tripoKey", key);
    else localStorage.removeItem("sherwood.tripoKey");
  } catch {}
}

function forgeMsg(text, kind = "") {
  $("fmsg").textContent = text;
  $("fmsg").className = `msg ${kind}`;
}

function renderSteps(progress = {}) {
  $("fsteps").innerHTML = Object.entries(STEP_LABELS)
    .map(([k, label]) => {
      const p = progress[k] ?? {};
      const st = p.status === "running" ? `${p.progress ?? 0}%` : p.status === "success" || p.status === "skipped" ? "done" : "";
      return `<li data-step="${k}" class="${p.status ?? ""}"><span>${label}</span><div class="bar"><i style="width:${p.status === "running" ? p.progress ?? 0 : ""}%"></i></div><span class="st">${st}</span></li>`;
    })
    .join("");
}

function openForge(c) {
  forgeChar = c;
  show("screen-forge");
  $("tkey").value ||= loadKey();
  $("forge-who").textContent = `${c.name} · ${c.rarityLabel} ${c.archetypeLabel} · seed ${c.seed}`;
  if (forging) {
    $("fstart").disabled = true;
    return forgeMsg(forging.character.seed === c.seed ? "Forging this hero now…" : `Busy forging ${forging.character.name}. Wait for it to finish.`);
  }
  const resume = savedProgress(c.seed);
  const done = Object.keys(resume?.steps ?? {});
  renderSteps(Object.fromEntries(done.map((k) => [k, { status: "skipped" }])));
  $("fstart").disabled = false;
  $("fstart").textContent = done.length ? "Resume forging" : "Forge (spends credits)";
  $("fstart").onclick = startForge;
  forgeMsg(done.length ? `${done.length} step(s) already paid for; resuming won't charge for them again.` : "Generating, rigging and animating spends Tripo credits and takes a few minutes. Keep this tab open.");
}

$("fclose").onclick = () => {
  show("screen-select");
  if (selected) select(selected, document.querySelector(".band button.on"));
};

$("tbal").onclick = async () => {
  const key = $("tkey").value.trim();
  if (!key) return forgeMsg("Paste your Tripo API key first.", "err");
  forgeMsg("Checking…");
  try {
    const b = await getBalance(key);
    storeKey(key);
    forgeMsg(`Key works. Balance: ${b.balance} credits${b.frozen ? ` (${b.frozen} reserved)` : ""}.`, "ok");
  } catch (err) {
    forgeMsg(err.message + (err.suggestion ? `. ${err.suggestion}` : ""), "err");
  }
};

async function startForge() {
  const key = $("tkey").value.trim();
  if (!/^tsk_/.test(key)) return forgeMsg("Tripo API keys start with tsk_. Copy the secret key from the Tripo console.", "err");
  storeKey(key);
  const c = forgeChar;
  forging = { character: c };
  const progress = {};
  $("fstart").disabled = true;
  forgeMsg("Forging… keep this tab open.");
  renderSteps(progress);
  try {
    const hero = await forgeInBrowser({
      key,
      character: c,
      options: { textureQuality: $("ftex").value, geometryQuality: $("fgeo").value },
      onEvent: (e) => {
        if (e.step === "log") return forgeMsg(e.message);
        if (STEP_LABELS[e.step]) progress[e.step] = e;
        if (forgeChar === c && !$("screen-forge").hidden) renderSteps(progress);
      },
    });
    forging = null;
    await loadBand();
    const btn = [...document.querySelectorAll(".band button")].find((b) => b.textContent.includes(c.name));
    forgeMsg(`Done · ${hero.credits} credits. ${c.name} joined the band.`, "ok");
    $("fstart").disabled = false;
    $("fstart").textContent = `Play as ${c.name}`;
    $("fstart").onclick = () => {
      btn?.click();
      if (selected) startRun(selected);
    };
  } catch (err) {
    forging = null;
    forgeMsg(err.message + (err.suggestion ? `. ${err.suggestion}` : "") + (savedProgress(c.seed) ? " Finished steps are saved: press Resume." : ""), "err");
    $("fstart").disabled = false;
    $("fstart").textContent = savedProgress(c.seed) ? "Resume forging" : "Try again";
  }
}

function showBest() {
  try {
    const best = JSON.parse(localStorage.getItem("sherwood.best") ?? "null");
    $("best").textContent = best ? `Best run: ${best.renown} renown, floor ${best.floor}${best.won ? " (victory)" : ""} as ${best.name}.` : "";
  } catch {}
}

// ---------- run flow ----------

async function startRun(sel) {
  initAudio();
  lastSel = sel;
  $("loading").hidden = false;
  let rig;
  try {
    rig = sel.glb ? await loadGLBRig(sel.glb.url, sel.glb.yaw) : makeHero(sel.character);
  } catch (err) {
    console.warn("Model failed to load, using the low-poly look", err);
    rig = makeHero(sel.character);
  }
  $("loading").hidden = true;

  if (G.player) scene.remove(G.player.rig.object3d);
  if (G.player?.cloakRing) scene.remove(G.player.cloakRing);
  for (const f of G.followers) scene.remove(f.rig.object3d);
  G.followers = [];

  const c = sel.character;
  G.rng = makeRng(`${c.seed}:${randomSeed()}`);
  const P = (G.player = createPlayer(c, rig));
  scene.add(rig.object3d);
  if (P.perks.cloak) {
    P.cloakRing = new THREE.Mesh(ringGeo(0.9, 0.08), new THREE.MeshBasicMaterial({ color: 0x80ff90, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(P.cloakRing);
  }
  G.run = { character: c, floor: 0, gold: c.gold, renown: 0, kills: 0, damage: 0, goldEarned: 0, time: 0, upgrades: [], courageNext: 0 };

  $("hname").textContent = c.name;
  $("hname").style.color = `var(--${c.rarity})`;
  $("harch").textContent = `${c.rarityLabel} ${c.archetypeLabel}`;
  $("abilname").textContent = P.kit.ability.name;
  $("atkname").textContent = ATTACK_NAMES[P.kit.weapon];
  $("turn").hidden = !sel.glb;
  show(null);
  $("hud").hidden = false;
  startFloor(1);
}

function startFloor(n) {
  const run = G.run;
  const P = G.player;
  run.floor = n;
  clearEnemies();
  clearProjectiles();
  clearPickups();
  clearSnares();
  clearFloats();
  G.fx.clear();
  G.props = [];
  G.traps = [];
  G.timers.length = 0;
  bossBar(null);

  const layout = G.world.build(n, G.rng);
  P.pos.set(0, 0, layout.R - 3);
  P.vel.set(0, 0, 0);
  P.knock.set(0, 0, 0);
  P.facing = Math.PI;
  Object.assign(P, { luckUsed: false, hitThisFloor: false, dodgeTime: 0, chargeT: 0, rootT: 0, iframes: 1, atkT: 0.3 });
  P.courage = run.courageNext;
  run.courageNext = 0;
  P.rig.object3d.position.copy(P.pos);
  placeFollowers();
  camera.position.copy(P.pos).addScaledVector(camOffset, zoom);
  camLook.copy(P.pos);

  placeProps(n, layout.R);
  run.boss = n === FINAL_FLOOR;
  run.bossEnemy = null;
  run.waves = run.boss ? [] : buildWaves(n, G.rng, P);
  run.wave = 0;
  run.waveDelay = 2.2;
  run.cleared = false;
  run.duel = null;
  run.proudDone = false;
  if (P.perks.cloak) (P.hiddenT = 8), (P.sneak = true);

  G.mode = "playing";
  document.body.classList.add("playing");
  banner(`Floor ${n} · ${layout.theme.name}`, run.boss ? "The Sheriff awaits." : `${run.waves.length} waves of foes`);
  startMusic(layout.theme.mood);
  if (run.boss) {
    after(2.6, () => {
      run.bossEnemy = spawnEnemy("sheriff", new THREE.Vector3(0, 0, -7), { delay: 1.3 });
      sfx.horn();
      banner("The Sheriff of Nottingham", "Bring him down and Sherwood is free", 2600);
    });
  }
}

function freeSpot(R, rng) {
  for (let t = 0; t < 60; t++) {
    const a = rng.float() * TAU, d = 4 + rng.float() * (R - 8);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z < -R + 7 && Math.abs(x) < 4) continue;
    if (Math.hypot(x, z - (R - 3)) < 5) continue;
    if (G.world.obstacles.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 2) ** 2)) continue;
    if (G.props.some((p) => (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < 16)) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return null;
}

function placeProps(n, R) {
  const P = G.player;
  const rng = G.rng;
  if (n >= FINAL_FLOOR) return;
  if (n > 1 && rng.float() < (P.flaws.abbot ? 0.75 : 0.5)) {
    const pos = freeSpot(R, rng);
    if (pos) G.props.push({ kind: "shrine", pos, used: false, hostile: !!P.flaws.abbot, cd: 3, ...G.world.makeShrine(pos.x, pos.z, P.flaws.abbot) });
  }
  if (P.perks.sherwoodBorn || rng.float() < 0.25) {
    const pos = freeSpot(R, rng);
    if (pos) G.props.push({ kind: "chest", pos, used: false, ...G.world.makeChest(pos.x, pos.z) });
  }
  const traps = Math.round((Math.min(n, 4) + rng.int(0, 1)) * (P.flaws.clumsy ? 1.25 : 1));
  for (let i = 0; i < traps; i++) {
    const pos = freeSpot(R, rng);
    if (pos) G.traps.push({ pos, armed: true, mesh: G.world.makeTrap(pos.x, pos.z) });
  }
}

function nearestProp() {
  const P = G.player;
  let best = null;
  let bd = 2.4 * 2.4;
  for (const p of G.props) {
    if (p.used || p.hostile) continue;
    const d = dist2(p.pos, P.pos);
    if (d < bd) (bd = d), (best = p);
  }
  return best;
}

const shrineCost = () => (G.player.perks.givePoor ? 10 : 15);

function interact() {
  const p = nearestProp();
  if (!p) return;
  const P = G.player;
  const run = G.run;
  if (p.kind === "shrine") {
    if (P.hp >= P.maxHp) return floatText(P.pos, "already hale", "info", 2);
    if (P.perks.givePoor) {
      // Give to the Poor: 3 HP per 10 gold, as much as you need.
      let spent = 0;
      const before = P.hp;
      while (run.gold >= 10 && P.hp < P.maxHp) {
        run.gold -= 10;
        spent += 10;
        P.hp = Math.min(P.maxHp, P.hp + 3);
      }
      if (!spent) return floatText(P.pos, "not enough gold", "info", 2);
      floatText(P.pos, `-${spent} gold`, "gold", 2.6);
      floatText(P.pos, `+${P.hp - before}`, "heal", 2);
      sfx.heal();
      G.fx.burst(p.pos, 0xffd870, 24, 3, 0.9, 2, 3, 2);
      return;
    }
    if (run.gold < shrineCost()) return floatText(P.pos, "not enough gold", "info", 2);
    run.gold -= shrineCost();
    run.renown += 1;
    p.used = true;
    p.light.intensity = 1;
    healPlayer(6);
    G.fx.burst(p.pos, 0xffd870, 24, 3, 0.9, 2, 3, 2);
  } else if (p.kind === "chest") {
    p.used = true;
    p.lid.rotation.x = -1.9;
    sfx.pick();
    spawnCoins(p.pos, Math.round((10 + rand(0, 12) + run.floor * 4) * P.mods.gold));
    if (Math.random() < 0.5) spawnPickup("heart", p.pos);
    if (Math.random() < 0.35) {
      const u = pickUpgrades(1)[0];
      if (u) {
        applyUpgrade(u);
        banner(`Cache: ${u.name}`, u.text, 2000);
      }
    }
    G.fx.burst(p.pos, 0xffd040, 20, 3, 0.7, -4, 3, 0.6);
  }
}

function promptFor(p) {
  if (!p) return null;
  if (p.kind === "chest") return "<kbd>E</kbd> Open the hidden cache";
  return G.player.perks.givePoor
    ? "<kbd>E</kbd> Give to the poor: 3 HP per 10 gold"
    : `<kbd>E</kbd> Offer ${shrineCost()} gold at the shrine (heal 6)`;
}

function updateProps(dt) {
  const P = G.player;
  const run = G.run;
  for (const p of G.props) {
    if (p.kind === "shrine") {
      p.orb.position.y = 2 + Math.sin(G.time * 2) * 0.12;
      p.orb.rotation.y += dt;
      if (p.hostile && !run.cleared) {
        p.cd -= dt;
        if (p.cd <= 0 && dist2(p.pos, P.pos) < 12 * 12) {
          p.cd = 2.6;
          const from = p.pos.clone();
          const dir = new THREE.Vector3(P.pos.x - from.x, 0, P.pos.z - from.z).normalize();
          fireProjectile("holy", from.addScaledVector(dir, 0.9), dir, { speed: 10, dmg: 3 + run.floor * 0.5, owner: "enemy", range: 18, homing: 0.8, y: 2 });
          sfx.magic();
        }
      }
    }
  }
  const r = 0.6 * (P.flaws.clumsy ? 1.25 : 1);
  for (const t of G.traps) {
    if (!t.armed || P.dodgeTime > 0) continue;
    if (dist2(t.pos, P.pos) < r * r) {
      t.armed = false;
      t.mesh.scale.set(0.6, 1.6, 0.6);
      sfx.snap();
      hurtPlayer(3 + run.floor * 0.5);
      P.rootT = 0.9;
      floatText(P.pos, "snared!", "info", 2.3);
    }
  }
  setPrompt(promptFor(nearestProp()));
}

function spawnWave() {
  const run = G.run;
  const P = G.player;
  const wave = run.waves[run.wave++];
  run.waveDelay = 1.8;
  const spawns = [...G.world.spawns].sort(() => G.rng.float() - 0.5);
  wave.forEach((w, i) => {
    const base = spawns[i % spawns.length];
    const pos = base.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)));
    pos.setLength(Math.min(pos.length(), G.world.R - 1.5));
    const e = spawnEnemy(w.type, pos, { elite: w.elite, delay: 0.9 + i * 0.12 });
    if (w.bounty) {
      e.bounty = true;
      banner("A bounty hunter has found you", "Wanted: the price on your head draws killers", 2400);
    } else if (P.flaws.proud && w.elite && !run.proudDone) {
      run.proudDone = true;
      run.duel = { e, t: 25 };
      banner(`${e.def.name} challenges you to a duel`, "Proud: defeat them within 25s or lose 5 renown", 2400);
    }
  });
  if (run.wave > 1 && !run.duel) banner(`Wave ${run.wave}`, "", 1100);
}

function updateFloor(dt) {
  const run = G.run;
  const P = G.player;
  run.time += dt;
  const alive = G.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  if (!run.boss && !run.cleared && alive === 0) {
    if (run.wave < run.waves.length) {
      run.waveDelay -= dt;
      if (run.waveDelay <= 0) spawnWave();
    } else clearFloor();
  }
  if (run.boss && run.bossEnemy) {
    bossBar(run.bossEnemy.dead ? null : run.bossEnemy);
    if (run.bossEnemy.dead && !run.cleared) winRun();
  }
  if (run.duel) {
    if (run.duel.e.dead) {
      run.renown += 5;
      banner("Duel won", "+5 renown", 1500);
      run.duel = null;
    } else if ((run.duel.t -= dt) <= 0) {
      run.renown = Math.max(0, run.renown - 5);
      banner("You refused the duel", "-5 renown", 1500);
      run.duel = null;
    }
  }
  if (run.cleared && !run.boss && P.pos.z < -G.world.R - 2.5) completeFloor();
}

function clearFloor() {
  const run = G.run;
  const P = G.player;
  run.cleared = true;
  G.world.openExit();
  sfx.clear();
  run.renown += 5;
  banner("Clearing secured", "Follow the light north", 2400);
  if (!P.hitThisFloor) {
    run.renown += 3;
    floatText(P.pos, "untouched +3 renown", "info", 2.6);
  }
  if (P.mods.clearHeal) healPlayer(Math.ceil(P.maxHp * P.mods.clearHeal));
}

function completeFloor() {
  G.mode = "reward";
  G.mouseDown = false;
  document.body.classList.remove("playing");
  setPrompt(null);
  showReward();
}

function winRun() {
  const run = G.run;
  run.cleared = true;
  G.mode = "ending";
  for (const e of G.enemies) if (!e.dead && e !== run.bossEnemy) damageEnemy(e, 9999, { noProc: true });
  bossBar(null);
  stopMusic();
  sfx.clear();
  banner("Sherwood is free!", "The Sheriff of Nottingham has fallen", 3200);
  G.player.rig.trigger("victory");
  for (const f of G.followers) f.rig.trigger("victory");
  setTimeout(() => showSummary(true), 3800);
}

G.events.onPlayerHurt = flashHurt;
G.events.onPlayerDeath = () => {
  const P = G.player;
  P.dead = true;
  P.rig.trigger("die");
  G.mode = "dying";
  G.mouseDown = false;
  document.body.classList.remove("playing");
  setPrompt(null);
  bossBar(null);
  stopMusic();
  sfx.death();
  banner("You have fallen", "Sherwood will remember", 2400);
  setTimeout(() => showSummary(false), 2600);
};
G.events.onEnemyKilled = (e) => {
  if (e.bounty) banner("Bounty hunter slain", "", 1400);
};

// ---------- upgrades, reward, shop ----------

function pickUpgrades(n, exclude = new Set()) {
  const P = G.player;
  const pool = UPGRADES.filter((u) => (!u.when || u.when(P)) && !exclude.has(u.id));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, u) => s + RARITY_WEIGHT[u.rarity], 0);
    let r = G.rng.float() * total;
    let i = 0;
    while ((r -= RARITY_WEIGHT[pool[i].rarity]) > 0) i++;
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
  }
  return out;
}

function applyUpgrade(u) {
  u.apply(G.player);
  G.run.upgrades.push(u.name);
}

const rarityVar = (r) => (r === "epic" ? "var(--epic)" : r === "rare" ? "var(--rare)" : "var(--uncommon)");

function showReward() {
  const run = G.run;
  show("screen-reward");
  $("reward-title").textContent = `Floor ${run.floor} cleared`;
  $("reward-sub").textContent = "Choose a boon for the road ahead.";
  const box = $("reward-choices");
  box.innerHTML = "";
  for (const u of pickUpgrades(3)) {
    const b = document.createElement("button");
    b.className = "choice";
    b.style.setProperty("--rc", rarityVar(u.rarity));
    b.innerHTML = `<span class="r">${u.rarity}</span><h3>${esc(u.name)}</h3><p>${esc(u.text)}</p>`;
    b.onclick = () => {
      sfx.pick();
      applyUpgrade(u);
      if (SHOP_AFTER.has(run.floor)) showShop();
      else nextFloor();
    };
    box.append(b);
  }
}

function nextFloor() {
  show(null);
  startFloor(G.run.floor + 1);
}

function showShop() {
  const run = G.run;
  const P = G.player;
  G.mode = "shop";
  show("screen-shop");
  const price = (n) => Math.max(1, Math.round(n * P.mods.price));
  const items = [
    { name: "Healing Draught", rarity: "common", text: "Restore 50% of your HP.", cost: price(15), repeat: true, buy: () => healPlayer(Math.ceil(P.maxHp * 0.5), false) },
    P.flaws.drinker
      ? { name: "Tavern Ale", rarity: "common", text: "+15% damage next floor. Free for a Drinker, but it drains 1 HP.", cost: 0, buy: () => ((run.courageNext = 0.15), (P.hp = Math.max(1, P.hp - 1))) }
      : { name: "Tavern Ale", rarity: "common", text: "Liquid courage: +15% damage next floor.", cost: price(8), buy: () => (run.courageNext = 0.15) },
  ];
  if (G.followers.length < 3)
    items.push({ name: "Recruit an Outlaw", rarity: "rare", text: `An archer joins your band and shoots nearby foes.${P.perks.merryBand ? " Merry Band: +25% damage." : ""}`, cost: price(35), buy: () => addFollower() });
  for (const u of pickUpgrades(P.perks.silverTongue ? 4 : 3))
    items.push({ name: u.name, rarity: u.rarity, text: u.text, cost: price(RARITY_PRICE[u.rarity]), buy: () => applyUpgrade(u) });

  const render = () => {
    $("shop-gold").textContent = run.gold;
    const box = $("shop-items");
    box.innerHTML = "";
    for (const it of items) {
      const b = document.createElement("button");
      b.className = "choice";
      b.style.setProperty("--rc", rarityVar(it.rarity));
      const label = it.sold ? "Sold" : it.cost ? `${it.cost} gold` : "Free";
      b.innerHTML = `<span class="r">${it.rarity}</span><h3>${esc(it.name)}</h3><p>${esc(it.text)}</p><span class="price">${label}</span>`;
      b.disabled = it.sold || run.gold < it.cost || (it.name === "Healing Draught" && P.hp >= P.maxHp);
      b.onclick = () => {
        run.gold -= it.cost;
        it.buy();
        if (!it.repeat) it.sold = true;
        sfx.coin();
        render();
      };
      box.append(b);
    }
  };
  render();
  $("shop-leave").onclick = () => (sfx.ui(), nextFloor());
}

// ---------- pause & summary ----------

function pause(on) {
  if (on) {
    G.mode = "paused";
    G.mouseDown = false;
    G.keys.clear();
    document.body.classList.remove("playing");
    const P = G.player;
    const ups = G.run.upgrades.length ? `<div class="trait"><b>Boons:</b> ${G.run.upgrades.map(esc).join(", ")}</div>` : "";
    $("pause-card").innerHTML = cardHTML(P.c, kitHTML(P.c) + ups);
    show("screen-pause");
  } else {
    show(null);
    G.mode = "playing";
    document.body.classList.add("playing");
  }
}
$("resume").onclick = () => pause(false);
$("mute").onclick = setMute;
$("turn").onclick = () => {
  const rig = G.player.rig;
  rig.inner.rotation.y += Math.PI / 2;
  try {
    localStorage.setItem(yawKey(lastSel.glb.dir), String(rig.inner.rotation.y % TAU));
  } catch {}
};
$("abandon").onclick = () => showSummary(false, true);

function showSummary(won, abandoned = false) {
  const run = G.run;
  const c = run.character;
  G.mode = "summary";
  stopMusic();
  setPrompt(null);
  bossBar(null);
  $("hud").hidden = true;
  document.body.classList.remove("playing", "lowhp");
  $("sum-title").textContent = won ? "Sherwood is free!" : abandoned ? "Run abandoned" : "Fallen in the greenwood";
  $("sum-sub").textContent = won
    ? `${c.name} brought down the Sheriff of Nottingham.`
    : `${c.name} fell on floor ${run.floor} of ${FINAL_FLOOR}.`;
  const t = Math.round(run.time);
  const stats = [
    ["Renown", run.renown], ["Floor", `${run.floor}/${FINAL_FLOOR}`], ["Foes slain", run.kills],
    ["Damage dealt", run.damage], ["Gold earned", run.goldEarned], ["Time", `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`],
  ];
  $("sum-stats").innerHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("");
  try {
    const best = JSON.parse(localStorage.getItem("sherwood.best") ?? "null");
    if (!abandoned && (!best || run.renown > best.renown)) {
      localStorage.setItem("sherwood.best", JSON.stringify({ renown: run.renown, floor: run.floor, won, name: c.name }));
      $("sum-sub").textContent += " A new best run!";
    }
  } catch {}
  show("screen-summary");
}
$("again").onclick = () => startRun(lastSel);
$("tomenu").onclick = () => toMenu();

function toMenu() {
  clearEnemies();
  clearProjectiles();
  clearPickups();
  clearSnares();
  clearFloats();
  G.fx.clear();
  if (G.player) {
    scene.remove(G.player.rig.object3d);
    if (G.player.cloakRing) scene.remove(G.player.cloakRing);
  }
  for (const f of G.followers) scene.remove(f.rig.object3d);
  G.followers = [];
  G.player = null;
  G.mode = "menu";
  G.world.build(1, makeRng("menu"));
  showBest();
  show("screen-select");
}

// ---------- main loop ----------

function hudInfo() {
  const P = G.player;
  const run = G.run;
  const buffs = [];
  if (P.hiddenT > 0) buffs.push("<span>Hidden</span>");
  if (P.sneak) buffs.push("<span>Sneak attack ready</span>");
  if (P.buffT > 0) buffs.push(`<span>Ballad ${Math.ceil(P.buffT)}s</span>`);
  if (P.courage > 0) buffs.push("<span>Liquid courage</span>");
  if (P.perks.outlawsLuck && !P.luckUsed) buffs.push("<span>Luck ready</span>");
  if (G.followers.length) buffs.push(`<span>Band ×${G.followers.length}</span>`);
  if (P.rootT > 0) buffs.push('<span class="warn">Snared</span>');
  if (P.flaws.oldWound && P.hp < P.maxHp / 2) buffs.push('<span class="warn">Old wound</span>');
  if (run.duel) buffs.push(`<span class="warn">Duel ${Math.ceil(run.duel.t)}s</span>`);
  return {
    abilityCd: abilityCd(P),
    dodgeCd: dodgeCd(P),
    wave: run.boss ? "Boss" : `${Math.min(run.wave, run.waves.length)} / ${run.waves.length}`,
    foes: G.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0) + (run.boss ? 0 : run.waves.slice(run.wave).reduce((n, w) => n + w.length, 0)),
    final: FINAL_FLOOR,
    dmg: Math.round(baseDamage(P)),
    crit: Math.round(critChance(P) * 100),
    armor: playerArmor(P),
    buffs: buffs.join(""),
  };
}

const clock = new THREE.Clock();
const menuFocus = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const real = Math.min(clock.getDelta(), 1 / 30);
  let dt = real;
  G.time += real;
  if (G.hitstop > 0) {
    G.hitstop -= real;
    dt *= 0.15;
  }
  const sim = G.mode === "playing" || G.mode === "dying" || G.mode === "ending";
  if (sim) {
    const P = G.player;
    updateMouse();
    for (let i = G.timers.length - 1; i >= 0; i--) {
      const t = G.timers[i];
      if ((t.t -= dt) <= 0) {
        G.timers.splice(i, 1);
        t.fn();
      }
    }
    if (G.mode === "playing") {
      updatePlayer(dt);
      updateFloor(dt);
      if (G.mode === "playing") updateProps(dt);
    } else {
      P.rig.update(dt, 0);
      for (const f of G.followers) f.rig.update(dt, 0);
    }
    updateEnemies(dt);
    updateProjectiles(dt);
    if (G.player) updatePickups(dt, G.run.cleared);
    G.fx.update(dt);
    updateCamera(real);
    if (G.player) updateHud(G.player, G.run, hudInfo());
    G.world.update(dt, G.time, G.player.pos);
  } else {
    if (G.mode === "menu") {
      const a = G.time * 0.05;
      camera.position.set(Math.cos(a) * 28, 13, Math.sin(a) * 28);
      camera.lookAt(0, 1, 0);
    }
    G.world.update(real, G.time, G.player?.pos ?? menuFocus);
  }
  updateFloats(real);
  updateEnemyBars();
  renderer.render(scene, camera);
}

G.world.build(1, makeRng("menu"));
initSelect();
frame();

// ?debug exposes internals for automated play-testing.
if (new URLSearchParams(location.search).has("debug")) window.__game = { G, startFloor, showShop, applyUpgrade, pickUpgrades };
