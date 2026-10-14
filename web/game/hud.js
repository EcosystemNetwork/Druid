// DOM HUD: floating combat text, enemy bars, banners, bars and the hero card.

import * as THREE from "three";
import { G } from "./state.js";

const $ = (id) => document.getElementById(id);
const v = new THREE.Vector3();
const floats = [];
const bars = [];
let bannerTimer = null;

export const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

function project(pos, h) {
  v.set(pos.x, (pos.y ?? 0) + h, pos.z).project(G.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, behind: v.z > 1 };
}

export function floatText(pos, text, kind = "dmg", h = 1.8) {
  const el = document.createElement("div");
  el.className = `float ${kind}`;
  el.textContent = text;
  $("fx").append(el);
  floats.push({ el, pos: pos.clone(), h, t: 0, max: kind === "crit" ? 0.9 : 0.75, dx: (Math.random() - 0.5) * 30 });
  if (floats.length > 80) floats.shift().el.remove();
}

export function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    if (f.t >= f.max) {
      f.el.remove();
      floats.splice(i, 1);
      continue;
    }
    const p = project(f.pos, f.h);
    const k = f.t / f.max;
    f.el.style.transform = `translate(${p.x + f.dx * k}px, ${p.y - k * 46}px) translate(-50%, -50%) scale(${k < 0.15 ? 0.6 + k * 3 : 1})`;
    f.el.style.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  }
}

export function clearFloats() {
  for (const f of floats) f.el.remove();
  floats.length = 0;
}

export function updateEnemyBars() {
  let n = 0;
  for (const e of G.enemies) {
    if (e.dead || e.state === "spawn" || e.def.boss) continue;
    if (e.hp >= e.maxHp && !e.elite && !e.fleeing) continue;
    let b = bars[n];
    if (!b) {
      b = document.createElement("div");
      b.className = "ebar";
      b.innerHTML = "<i></i>";
      $("fx").append(b);
      bars.push(b);
    }
    const p = project(e.pos, e.rig.height + 0.35);
    b.style.display = p.behind ? "none" : "block";
    b.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    b.classList.toggle("elite", !!e.elite);
    b.classList.toggle("fleeing", !!e.fleeing);
    b.firstChild.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
    n++;
  }
  for (let i = n; i < bars.length; i++) bars[i].style.display = "none";
}

export function banner(title, sub = "", ms = 2200) {
  const el = $("banner");
  el.innerHTML = `<h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}`;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove("show"), ms);
}

export function setPrompt(text) {
  const el = $("prompt");
  if (!text) return void (el.hidden = true);
  el.hidden = false;
  if (el.dataset.t !== text) (el.innerHTML = text), (el.dataset.t = text);
}

export function bossBar(e) {
  const el = $("bossbar");
  if (!e) return void (el.hidden = true);
  el.hidden = false;
  el.querySelector("b").textContent = e.def.name;
  el.querySelector("i").style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
  el.classList.toggle("enraged", !!e.enraged);
}

export function flashHurt() {
  const el = $("vignette");
  el.classList.remove("hit");
  void el.offsetWidth;
  el.classList.add("hit");
}

let lastHud = "";
export function updateHud(P, run, info) {
  const hpFrac = P.hp / P.maxHp;
  $("hpfill").style.width = `${hpFrac * 100}%`;
  $("hptext").textContent = `${Math.ceil(P.hp)} / ${P.maxHp}`;
  document.body.classList.toggle("lowhp", hpFrac < 0.3 && !P.dead);
  const cdA = Math.max(0, P.abilT) / info.abilityCd;
  const cdD = Math.max(0, P.dodgeT) / info.dodgeCd;
  $("slot-q").style.setProperty("--cd", cdA);
  $("slot-q").querySelector(".t").textContent = P.abilT > 0 ? Math.ceil(P.abilT) : "";
  $("slot-space").style.setProperty("--cd", cdD);
  const key = [run.gold, run.renown, run.floor, info.wave, info.foes, info.buffs, info.armor, info.dmg, info.crit].join("|");
  if (key === lastHud) return;
  lastHud = key;
  $("gold").textContent = run.gold;
  $("renown").textContent = run.renown;
  $("floor").textContent = `${run.floor} / ${info.final}`;
  $("wave").textContent = info.wave;
  $("foes").textContent = info.foes;
  $("chips").innerHTML = `<span title="Damage per hit">DMG ${info.dmg}</span><span title="Critical chance">CRIT ${info.crit}%</span><span title="Armour blocks this much damage per hit">ARM ${info.armor}</span>`;
  $("buffs").innerHTML = info.buffs;
}

export function cardHTML(c, extra = "") {
  return `
    <div class="card" style="--rar: var(--${c.rarity})">
      <h3>${esc(c.name)}</h3>
      <div class="sub"><span class="rar">${esc(c.rarityLabel)}</span> ${esc(c.archetypeLabel)} · ${esc(c.role)}</div>
      <div class="stats">
        ${[["HP", c.hp], ["MIG", c.stats.might], ["FIN", c.stats.finesse], ["CUN", c.stats.cunning], ["GRT", c.stats.grit]]
          .map(([k, val]) => `<div class="stat"><b>${val}</b><span>${k}</span></div>`).join("")}
      </div>
      ${c.perks.map((p) => `<div class="trait"><b>${esc(p.name)}.</b> ${esc(p.text)}</div>`).join("")}
      <div class="trait flaw"><b>${esc(c.flaw.name)}.</b> ${esc(c.flaw.text)}</div>
      <div class="trait"><b>Relic:</b> ${esc(c.relic)}</div>
      ${extra}
    </div>`;
}
