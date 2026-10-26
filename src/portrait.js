// 2D NFT portrait: a deterministic 1000x1000 SVG bust drawn from a character's traits.
// Dependency-free so the creator page draws it live and the server renders the same
// image for token metadata. Same character = same SVG, byte for byte.

import { SLOTS, makeRng, traitOption } from "./forge.js";

const RARITY_COLORS = { common: "#b7b09a", uncommon: "#7fbf5a", rare: "#5a9fd6", legendary: "#e0a63a" };
const SKIN_FALLBACK = ["#f0c8a0", "#d9a77c", "#c08a60", "#8a5a38", "#6a4028"];
const WOOD = "#6a4424";
const LEATHER = "#4a3020";
const STEEL = "#9aa0a6";

// ---------- colour + svg helpers ----------

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("");
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const attrs = (a) => Object.entries(a).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` ${k}="${v}"`).join("");
const P = (d, fill, a = {}) => `<path d="${d}"${attrs({ fill, ...a })}/>`;
const E = (cx, cy, rx, ry, fill, a = {}) => `<ellipse${attrs({ cx, cy, rx, ry, fill, ...a })}/>`;
const C = (cx, cy, r, fill, a = {}) => `<circle${attrs({ cx, cy, r, fill, ...a })}/>`;
const R = (x, y, w, h, fill, a = {}) => `<rect${attrs({ x, y, width: w, height: h, fill, ...a })}/>`;
const L = (x1, y1, x2, y2, stroke, w, a = {}) => `<line${attrs({ x1, y1, x2, y2, stroke, "stroke-width": w, "stroke-linecap": "round", ...a })}/>`;
const S = (d, stroke, w, a = {}) => P(d, "none", { stroke, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round", ...a });
const G = (inner, a = {}) => `<g${attrs(a)}>${inner}</g>`;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- what the traits mean visually ----------

function describe(c) {
  const opt = (slot) => traitOption(c, slot);
  const palette = opt("palette")?.colors ?? ["#3f6e2a", "#6a4a2c", "#d8cfb0"];
  const hair = opt("hair") ?? { color: "#4a3020", style: "cropped" };
  const bgOptions = SLOTS.find((s) => s.id === "background").options();
  const background = opt("background") ?? bgOptions[hashStr(c.seed) % 2]; // old random rolls: glade or fen
  const skin = opt("skin")?.color ?? SKIN_FALLBACK[[...c.seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % SKIN_FALLBACK.length];
  const l = c.look;
  const outfit = l.outfit;
  const build = l.build;
  return {
    c, l, palette, skin, background,
    hairColor: hair.color, hairStyle: hair.style, streak: hair.streak,
    mark: opt("face")?.mark ?? "none",
    woman: l.sex === "woman",
    age: l.age,
    outfit, gear: l.gear, sidearm: l.sidearm,
    width: /huge|towering|broad|stout|round/.test(build) ? 330 : /slender|gaunt|willowy|slim|lanky/.test(build) ? 255 : 290,
    hood: /hood/.test(outfit) && c.archetype !== "friar",
  };
}

// ---------- backgrounds ----------

function background(d, rng) {
  const [dark, light] = d.background.colors;
  const out = [];
  out.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(light, -0.15)}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.42" r="0.5"><stop offset="0" stop-color="${light}" stop-opacity="0.55"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
  </defs>`);
  out.push(R(0, 0, 1000, 1000, "url(#bg)"));
  const scene = d.background.scene;
  if (scene === "glade" || scene === "moon") {
    if (scene === "moon") {
      for (let i = 0; i < 60; i++) out.push(C(rng.int(40, 960), rng.int(40, 520), rng.float() * 2.5 + 0.8, "#e8ecff", { opacity: (0.3 + rng.float() * 0.6).toFixed(2) }));
      out.push(C(760, 220, 110, "#f2efe0", { opacity: 0.95 }), C(730, 200, 18, "#d8d4c4"), C(790, 250, 26, "#d8d4c4"), C(770, 190, 10, "#d8d4c4"));
    } else {
      for (let i = 0; i < 5; i++) {
        const x = rng.int(80, 920);
        out.push(P(`M${x} 0 L${x + 70} 0 L${x + 260} 1000 L${x + 120} 1000 Z`, "#fff6d0", { opacity: 0.06 }));
      }
    }
    const trunk = scene === "moon" ? "#0a0e18" : shade(dark, -0.35);
    for (let i = 0; i < 9; i++) {
      const x = rng.int(-20, 1020);
      const w = rng.int(26, 70);
      out.push(P(`M${x - w / 2} 1000 L${x - w / 3} 0 L${x + w / 3} 0 L${x + w / 2} 1000 Z`, trunk, { opacity: (0.45 + rng.float() * 0.45).toFixed(2) }));
    }
    for (let i = 0; i < 14; i++) out.push(C(rng.int(0, 1000), rng.int(-60, 160), rng.int(80, 160), shade(dark, scene === "moon" ? -0.6 : -0.2), { opacity: 0.85 }));
  } else if (scene === "fen") {
    out.push(R(0, 560, 1000, 440, shade(dark, -0.2)));
    for (let i = 0; i < 7; i++) out.push(E(rng.int(0, 1000), rng.int(520, 820), rng.int(200, 420), rng.int(24, 50), light, { opacity: 0.18 }));
    for (let i = 0; i < 40; i++) {
      const x = rng.int(0, 1000);
      const h = rng.int(60, 170);
      out.push(S(`M${x} 1000 Q${x + rng.int(-14, 14)} ${1000 - h / 2} ${x + rng.int(-24, 24)} ${1000 - h}`, shade(dark, -0.5), 4));
    }
  } else if (scene === "camp") {
    out.push(`<defs><radialGradient id="fire" cx="0.18" cy="0.9" r="0.6"><stop offset="0" stop-color="#ffb050" stop-opacity="0.8"/><stop offset="1" stop-color="#ff7020" stop-opacity="0"/></radialGradient></defs>`);
    out.push(R(0, 0, 1000, 1000, "url(#fire)"));
    for (const [x, w, h] of [[120, 220, 260], [840, 260, 300], [610, 160, 180]]) out.push(P(`M${x - w / 2} 820 L${x} ${820 - h} L${x + w / 2} 820 Z`, "#140e08", { opacity: 0.9 }), L(x, 820 - h, x, 820 - h - 40, "#140e08", 6));
    out.push(R(0, 815, 1000, 185, "#140e08"));
    for (let i = 0; i < 24; i++) out.push(C(rng.int(40, 400), rng.int(480, 900), rng.float() * 3 + 1, "#ffc060", { opacity: rng.float().toFixed(2) }));
  } else if (scene === "walls") {
    const stone = shade(light, -0.3);
    out.push(R(0, 520, 1000, 480, stone));
    for (let x = 0; x < 1000; x += 80) out.push(R(x, 470, 50, 60, stone));
    for (const x of [90, 910]) out.push(R(x - 70, 300, 140, 700, shade(stone, -0.12)), ...[0, 1, 2].map((k) => R(x - 70 + k * 52, 260, 36, 50, shade(stone, -0.12))), R(x - 10, 400, 20, 60, "#1a1612"));
    for (let y = 560; y < 1000; y += 46) for (let x = (y / 46) % 2 ? 0 : 45; x < 1000; x += 90) out.push(R(x, y, 86, 42, "none", { stroke: shade(stone, -0.25), "stroke-width": 3 }));
  } else if (scene === "oak") {
    out.push(P("M420 1000 C430 820 380 700 300 620 L360 610 C430 660 470 640 480 560 L540 560 C540 650 590 670 660 610 L710 625 C620 700 580 820 590 1000 Z", "#120c06", { opacity: 0.9 }));
    for (let i = 0; i < 22; i++) out.push(C(rng.int(80, 920), rng.int(80, 520), rng.int(90, 150), shade(dark, -0.3), { opacity: 0.92 }));
    for (let i = 0; i < 30; i++) out.push(C(rng.int(80, 920), rng.int(60, 560), rng.float() * 4 + 2, light, { opacity: 0.6 }));
  } else if (scene === "gallows") {
    out.push(P("M0 820 Q300 660 620 760 T1000 740 L1000 1000 L0 1000 Z", "#1a0e0e"));
    out.push(R(150, 420, 24, 330, "#1a0e0e"), R(150, 420, 220, 22, "#1a0e0e"), L(345, 442, 345, 540, "#1a0e0e", 5), E(345, 556, 16, 22, "none", { stroke: "#1a0e0e", "stroke-width": 5 }));
    for (let i = 0; i < 7; i++) {
      const x = rng.int(450, 950), y = rng.int(120, 400), s = rng.int(14, 26);
      out.push(S(`M${x - s} ${y} Q${x - s / 2} ${y - s / 2} ${x} ${y} Q${x + s / 2} ${y - s / 2} ${x + s} ${y}`, "#1a0e0e", 5));
    }
  } else if (scene === "tourney") {
    for (let i = 0; i < 10; i++) out.push(R(i * 100, 0, 50, 1000, "#ffffff", { opacity: 0.05 }));
    out.push(S("M-20 70 Q500 190 1020 70", "#2a1a0a", 4));
    for (let i = 0; i < 12; i++) {
      const x = 20 + i * 86, y = 70 + Math.sin((i / 11) * Math.PI) * 88;
      out.push(P(`M${x} ${y} L${x + 60} ${y + 4} L${x + 30} ${y + 70} Z`, i % 2 ? "#e0b040" : "#8a1a1a"));
    }
    // An archery target behind the hero's head, with the golden arrow in the bull.
    for (const [r, f] of [[300, "#f2ead2"], [240, "#1a1a1a"], [180, "#2a5aa8"], [120, "#c03028"], [60, "#e8c040"]]) out.push(C(500, 420, r, f, { opacity: 0.55 }));
    out.push(L(500, 420, 760, 250, "#e8c040", 8), P("M760 250 l40 -10 l-18 32 Z", "#f2ead2"));
  }
  out.push(R(0, 0, 1000, 1000, "url(#halo)"));
  return out.join("");
}

// ---------- gear on the back (drawn behind the body) ----------

function gearBack(d) {
  const g = d.gear;
  const o = [];
  if (/longbow/.test(g)) {
    o.push(S("M300 1000 Q170 520 690 160", shade(WOOD, -0.2), 26), S("M300 1000 Q170 520 690 160", WOOD, 16));
    o.push(L(300, 1000, 690, 160, "#e8e0c8", 3));
  } else if (/quiver/.test(g)) {
    o.push(G(R(-45, -240, 90, 420, LEATHER, { rx: 18 }) + R(-45, -240, 90, 30, shade(LEATHER, 0.2), { rx: 12 }) +
      [-22, 0, 22].map((x, i) => L(x, -240, x + (i - 1) * 6, -330, "#d8ccb0", 5) + P(`M${x + (i - 1) * 6 - 14} -330 l14 -46 l14 46 Z`, i === 1 ? "#ece6d8" : "#8a8a8a")).join(""),
      { transform: "translate(690 620) rotate(28)" }));
  } else if (/quarterstaff/.test(g)) {
    o.push(L(230, 1000, 820, 180, shade(WOOD, -0.25), 30), L(230, 1000, 820, 180, WOOD, 20));
    o.push(L(780, 236, 800, 208, "#5a5a5e", 26), L(300, 902, 318, 876, "#5a5a5e", 26));
  } else if (/cask/.test(g)) {
    o.push(E(690, 610, 100, 80, WOOD), E(690, 610, 100, 80, "none", { stroke: "#3a3a3e", "stroke-width": 8 }), L(630, 545, 630, 675, "#3a3a3e", 8), L(750, 545, 750, 675, "#3a3a3e", 8));
  } else if (/twig staff/.test(g)) {
    o.push(S("M250 1000 L380 760 L430 700 L520 520 L610 360 L700 200", "#3a2a1a", 18));
    o.push(S("M610 360 L670 330 M700 200 L740 150 M700 200 L660 140 M520 520 L470 470", "#3a2a1a", 9));
    o.push(C(700, 180, 36, "#b070ff", { opacity: 0.35 }), C(700, 180, 14, "#e0c8ff", { opacity: 0.8 }));
  } else if (/crossbow/.test(g)) {
    o.push(G(R(-20, -200, 40, 380, WOOD, { rx: 8 }) + S("M-150 -150 Q0 -230 150 -150", "#3a3a3e", 14) + L(-150, -150, 150, -150, "#e8e0c8", 3), { transform: "translate(320 600) rotate(-24)" }));
  } else if (/round wooden shield/.test(g)) {
    o.push(C(500, 740, 330, shade(WOOD, -0.1)), ...[-200, -100, 0, 100, 200].map((x) => L(500 + x, 430, 500 + x, 1000, shade(WOOD, -0.3), 4)));
    o.push(C(500, 740, 330, "none", { stroke: "#4a4a4e", "stroke-width": 22 }));
  } else if (/kite shield/.test(g)) {
    o.push(P("M590 330 L800 360 Q820 640 690 900 Q560 640 590 330 Z", d.palette[1], { stroke: "#4a4a4e", "stroke-width": 14 }));
    o.push(S("M640 430 L760 560 M660 520 L740 450 M650 600 L730 500", "#e8e0d0", 6, { opacity: 0.7 }));
  } else if (/lute/.test(g)) {
    o.push(G(R(-18, -340, 36, 360, WOOD) + R(-26, -400, 52, 70, shade(WOOD, -0.3), { rx: 6 }) +
      [-360, -380].map((y) => L(-34, y, 34, y, "#d8ccb0", 6)).join(""), { transform: "translate(680 640) rotate(-30)" }));
  }
  return o.join("");
}

// ---------- body + outfit ----------

function torso(d) {
  const [main, accent, third] = d.palette;
  const W = d.width;
  const o = d.outfit;
  const shoulders = `M${500 - W} 1000 L${500 - W} 800 C${500 - W} 700 ${500 - W * 0.62} 662 ${400} 650 L600 650 C${500 + W * 0.62} 662 ${500 + W} 700 ${500 + W} 800 L${500 + W} 1000 Z`;
  const parts = [];
  let base = main;
  if (/brigandine/.test(o)) base = "#8a1e1e";
  if (/vestments/.test(o)) base = "#4e2460";
  if (/chainmail|hauberk/.test(o)) base = /blackened/.test(o) ? "#3a3a3e" : STEEL;
  if (/deerskin/.test(o)) base = "#8a6a48";
  if (/white stag/.test(o)) base = "#e4dfd2";
  if (/habit/.test(o) && !/vestments/.test(o)) base = "#6a4a2e";
  if (/grey friar/.test(o)) base = "#7a7670";
  if (/moss-and-ivy/.test(o)) base = "#3a5a2a";
  if (/royal minstrel/.test(o)) base = "#a01c1c";
  if (/sleeveless/.test(o)) base = "#e2d6bc"; // linen shirt under the vest
  parts.push(P(shoulders, base));

  if (/chainmail|hauberk/.test(o)) {
    parts.push(`<defs><pattern id="mail" width="18" height="14" patternUnits="userSpaceOnUse"><path d="M0 7 Q9 -3 18 7 M-9 14 Q0 4 9 14 M9 14 Q18 4 27 14" fill="none" stroke="${shade(base, -0.35)}" stroke-width="2.5"/></pattern></defs>`);
    parts.push(P(shoulders, "url(#mail)"));
    const tabard = /templar|white surcoat/.test(o) ? "#ece6d8" : /crusader/.test(o) ? "#e2dccc" : main;
    parts.push(P(`M${500 - W * 0.55} 1000 L${500 - W * 0.48} 700 L${500 + W * 0.48} 700 L${500 + W * 0.55} 1000 Z`, tabard));
    parts.push(S(`M${500 - W * 0.4} 760 L${500 - W * 0.3} 720 M${500 + W * 0.2} 990 L${500 + W * 0.45} 940`, shade(tabard, -0.3), 6));
    if (/cross/.test(o)) parts.push(R(475, 760, 50, 220, /burnt red/.test(o) ? "#8a1a14" : "#a02820", { opacity: 0.85 }), R(410, 820, 180, 46, /burnt red/.test(o) ? "#8a1a14" : "#a02820", { opacity: 0.85 }));
    if (/scratched|defaced/.test(o)) parts.push(S("M440 800 L560 900 M560 800 L440 900", shade(tabard, -0.45), 8));
  }
  if (/pauldron/.test(o)) {
    for (const s of [-1, 1]) parts.push(P(`M${500 + s * 120} 668 Q${500 + s * W * 1.05} 640 ${500 + s * (W + 18)} 820 L${500 + s * (W - 60)} 800 Q${500 + s * W * 0.7} 710 ${500 + s * 120} 700 Z`, STEEL, { stroke: "#4a4a50", "stroke-width": 6 }));
  }
  if (/gambeson|quilted|padded/.test(o)) {
    for (let x = 500 - W + 40; x < 500 + W; x += 42) parts.push(L(x, 700, x, 1000, shade(base, -0.22), 4));
  }
  if (/brigandine/.test(o)) {
    for (let y = 720; y < 1000; y += 48) for (let x = 500 - W + 40; x < 500 + W - 20; x += 52) parts.push(C(x, y, 6, "#e0b040"));
    parts.push(P("M470 760 L530 760 L520 820 L480 820 Z", "#c09a40", { opacity: 0.6 }));
  }
  if (/vestments/.test(o)) {
    parts.push(R(420, 650, 44, 350, "#d4a52a"), R(536, 650, 44, 350, "#d4a52a"));
    for (let y = 700; y < 1000; y += 70) parts.push(P(`M442 ${y} l-12 20 l12 20 l12 -20 Z M558 ${y} l-12 20 l12 20 l12 -20 Z`, "#7a3a8a"));
  }
  if (/habit|robe/.test(o)) {
    parts.push(P(`M${500 - W * 0.75} 690 Q500 800 ${500 + W * 0.75} 690 Q500 720 ${500 - W * 0.75} 690 Z`, shade(base, -0.25)));
    parts.push(S(`M${500 - W * 0.9} 960 Q500 920 ${500 + W * 0.9} 960`, "#c8b48a", 10));
    if (/prayer beads/.test(o)) for (let i = 0; i < 14; i++) parts.push(C(420 + Math.cos((i / 13) * Math.PI) * -80 + 80, 700 + Math.sin((i / 13) * Math.PI) * 140, 9, "#5a3a20"));
  }
  if (/sleeveless/.test(o)) {
    const vest = /studded/.test(o) ? "#3a2618" : LEATHER;
    for (const s of [-1, 1]) parts.push(P(`M${500 + s * 60} 655 L${500 + s * (W - 70)} 680 L${500 + s * (W - 60)} 1000 L${500 + s * 70} 1000 Z`, vest));
    parts.push(S("M470 680 L500 760 L530 680", shade("#e2d6bc", -0.25), 5));
    if (/studded/.test(o)) for (let y = 720; y < 1000; y += 50) for (const s of [-1, 1]) parts.push(C(500 + s * 120, y, 7, "#c0a050"), C(500 + s * 190, y + 25, 7, "#c0a050"));
    if (/championship belt/.test(o)) parts.push(R(500 - W + 40, 930, W * 2 - 80, 70, "#c09a30"), E(500, 965, 70, 44, "#e8c860", { stroke: "#8a6a20", "stroke-width": 6 }));
  }
  if (/parti-coloured/.test(o)) {
    parts.push(P(`M500 650 L600 650 C${500 + W * 0.62} 662 ${500 + W} 700 ${500 + W} 800 L${500 + W} 1000 L500 1000 Z`, accent));
  }
  if (/royal minstrel/.test(o)) {
    parts.push(P(`M500 650 L600 650 C${500 + W * 0.62} 662 ${500 + W} 700 ${500 + W} 800 L${500 + W} 1000 L500 1000 Z`, "#d4a52a"));
    for (const [x, y] of [[500 - W + 20, 830], [500 - W + 50, 760], [500 + W - 20, 830], [500 + W - 50, 760]]) parts.push(C(x, y, 13, "#f0d060", { stroke: "#8a6a20", "stroke-width": 3 }));
  }
  if (/jerkin|tunic/.test(o) && !/sleeveless|chainmail/.test(o)) {
    const jerkin = /forest-green jerkin/.test(o) ? main : LEATHER;
    parts.push(P(`M${500 - W * 0.5} 1000 L${500 - W * 0.42} 700 L430 660 L500 780 L570 660 L${500 + W * 0.42} 700 L${500 + W * 0.5} 1000 Z`, jerkin, { opacity: /jerkin/.test(o) ? 1 : 0 }));
    parts.push(P("M430 660 L500 780 L570 660 Z", /tunic/.test(o) ? shade(main, 0.1) : third));
    for (let i = 0; i < 4; i++) parts.push(L(478 - i * 6, 690 + i * 22, 522 + i * 6, 690 + i * 22, "#d8ccb0", 3));
    if (/embroidered with golden oak/.test(o)) for (let i = 0; i < 9; i++) parts.push(leaf(500 - W * 0.45 + i * W * 0.11, 990 - (i % 2) * 30, i * 40, "#d4a52a"));
    if (/silver-buckled/.test(o)) parts.push(R(470, 900, 60, 46, "none", { stroke: "#e0e0e8", "stroke-width": 7, rx: 6 }));
  }
  if (/cloak|mantle|cape/.test(o) && !/moss-and-ivy/.test(o)) {
    const cloak = /white stag/.test(o) ? "#e4dfd2" : /deerskin/.test(o) ? "#8a6a48" : shade(main, -0.18);
    for (const s of [-1, 1]) parts.push(P(`M${500 + s * 70} 650 C${500 + s * W * 0.8} 655 ${500 + s * (W + 30)} 720 ${500 + s * (W + 40)} 1000 L${500 + s * (W - 70)} 1000 C${500 + s * (W - 90)} 820 ${500 + s * 170} 720 ${500 + s * 80} 690 Z`, cloak));
    if (/deerskin|white stag|fur/.test(o)) parts.push(S(`M${500 - W * 0.7} 690 Q500 740 ${500 + W * 0.7} 690`, /white stag/.test(o) ? "#f8f4ec" : "#b8a080", 22, { "stroke-dasharray": "6 10" }));
    parts.push(/antler clasp/.test(o) ? S("M470 690 L450 655 M455 670 L432 665 M530 690 L550 655 M545 670 L568 665", "#e8dcc0", 7) : C(500, 690, 18, "#c09a40", { stroke: "#6a5020", "stroke-width": 4 }));
  }
  if (/moss-and-ivy/.test(o)) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 39) * Math.PI;
      parts.push(leaf(500 - Math.cos(a) * (W - 20) + ((i * 37) % 30), 700 + Math.sin(a) * 60 + ((i * 53) % 260), i * 47, i % 3 ? "#4a7a32" : "#6a9a3a"));
    }
  }
  if (/bone charms/.test(o)) for (let i = 0; i < 5; i++) parts.push(L(440 + i * 30, 720, 440 + i * 30, 760 + (i % 2) * 20, "#2a2a2a", 3), E(440 + i * 30, 770 + (i % 2) * 20, 7, 12, "#e8e0cc"));
  if (/scarf/.test(o)) parts.push(P("M400 655 Q500 720 600 655 L610 690 Q500 760 390 690 Z", accent), P("M560 700 L600 840 L560 850 L540 720 Z", accent));

  // Strap for anything slung on the back.
  if (/slung|strapped|quiver|shield|lute|cask|coil/.test(d.gear)) {
    const strap = /herb|cask|coil/.test(d.gear) ? "#7a5a34" : LEATHER;
    parts.push(L(500 - W * 0.62, 690, 500 + W * 0.55, 1000, shade(strap, -0.2), 34), L(500 - W * 0.62, 690, 500 + W * 0.55, 1000, strap, 24));
  }
  if (/coil of snare/.test(d.gear)) for (const r of [44, 32, 20]) parts.push(C(380, 800, r, "none", { stroke: "#b8a888", "stroke-width": 5 }));
  if (/herb/.test(d.gear)) for (let i = 0; i < 3; i++) parts.push(G(R(-14, 0, 28, 60, "#6a5a2a", { rx: 8 }) + P("M-20 0 L0 -50 L20 0 Z", "#5a8a3a"), { transform: `translate(${380 + i * 70} ${880 + i * 30}) rotate(${-15 + i * 15})` }));
  if (/wanted poster/.test(d.gear)) parts.push(G(R(-20, -90, 40, 180, "#e8dcb8", { rx: 16 }) + L(-20, -60, 20, -60, "#8a6a4a", 3), { transform: "translate(640 900) rotate(-30)" }));

  // Things worn on the front that show in a bust.
  if (/cross pendant/.test(d.sidearm)) parts.push(L(470, 660, 500, 740, "#3a2a1a", 3), L(530, 660, 500, 740, "#3a2a1a", 3), R(492, 735, 16, 70, "#8a5a30"), R(474, 755, 52, 16, "#8a5a30"));
  if (/crow-feather/.test(d.sidearm)) for (let i = 0; i < 4; i++) parts.push(P(`M${500 - W + 70 + i * 22} 700 q-14 -70 6 -130 q10 60 -6 130 Z`, "#14141a"));
  if (/throwing knives/.test(d.sidearm)) {
    parts.push(L(500 + W * 0.62, 690, 500 - W * 0.55, 1000, "#3a2618", 30));
    for (let i = 0; i < 4; i++) parts.push(R(500 + W * 0.42 - i * 52, 740 + i * 66, 16, 40, STEEL, { transform: `rotate(-25 ${500 + W * 0.42 - i * 52} ${740 + i * 66})` }));
  }
  return parts.join("");
}

function leaf(x, y, rot, fill) {
  return P("M0 -14 Q11 0 0 14 Q-11 0 0 -14 Z", fill, { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot % 360})` });
}

// ---------- head ----------

const CX = 500;
const CY = 430;

function headShape(rx, ry) {
  return `M${CX - rx} ${CY - 10} C${CX - rx} ${CY - ry * 1.12} ${CX + rx} ${CY - ry * 1.12} ${CX + rx} ${CY - 10} ` +
    `C${CX + rx} ${CY + ry * 0.55} ${CX + rx * 0.5} ${CY + ry} ${CX} ${CY + ry} C${CX - rx * 0.5} ${CY + ry} ${CX - rx} ${CY + ry * 0.55} ${CX - rx} ${CY - 10} Z`;
}

function hoodPaths(d) {
  const outer = "M500 190 C665 200 715 330 702 480 L740 680 L260 680 L298 480 C285 330 335 200 500 190 Z";
  const hole = `M${CX - 128} ${CY + 20} C${CX - 132} ${CY - 175} ${CX + 132} ${CY - 175} ${CX + 128} ${CY + 20} C${CX + 128} ${CY + 130} ${CX + 70} ${CY + 172} ${CX} ${CY + 172} C${CX - 70} ${CY + 172} ${CX - 128} ${CY + 130} ${CX - 128} ${CY + 20} Z`;
  const color = /white stag/.test(d.outfit) ? "#e4dfd2" : /deerskin/.test(d.outfit) ? "#8a6a48" : /mud-brown/.test(d.outfit) ? "#5a4228" : shade(d.palette[0], -0.12);
  return { outer, hole, color };
}

function hairBack(d) {
  const h = d.hairColor;
  if (!h) return "";
  const long = d.hairStyle === "oakleaf" || (d.woman && ["shaggy", "curly", "wild", "matted", "tied"].includes(d.hairStyle));
  if (!long) return "";
  return P(`M${CX - 130} ${CY - 70} C${CX - 180} ${CY + 80} ${CX - 175} ${CY + 230} ${CX - 150} ${CY + 300} Q${CX} ${CY + 330} ${CX + 150} ${CY + 300} C${CX + 175} ${CY + 230} ${CX + 180} ${CY + 80} ${CX + 130} ${CY - 70} Z`, shade(h, -0.15));
}

function hairFront(d, rx, ry) {
  const h = d.hairColor;
  const o = [];
  const top = CY - ry * 0.84;
  const cap = `M${CX - rx - 6} ${CY + 10} C${CX - rx - 14} ${CY - ry * 1.3} ${CX + rx + 14} ${CY - ry * 1.3} ${CX + rx + 6} ${CY + 10} ` +
    `L${CX + rx - 8} ${CY - 30} C${CX + rx - 30} ${CY - 92} ${CX - rx + 30} ${CY - 92} ${CX - rx + 8} ${CY - 30} Z`;
  if (!h || d.hairStyle === "shaved") {
    return P(cap, "#2a1e16", { opacity: 0.12 });
  }
  if (d.c.archetype === "friar") {
    // Tonsure: a ring of hair around a bald crown.
    for (const s of [-1, 1]) o.push(P(`M${CX + s * (rx + 6)} ${CY + 10} C${CX + s * (rx + 12)} ${CY - 70} ${CX + s * (rx - 10)} ${CY - 110} ${CX + s * (rx - 40)} ${CY - 120} L${CX + s * (rx - 30)} ${CY - 70} C${CX + s * (rx - 10)} ${CY - 50} ${CX + s * (rx - 6)} ${CY - 20} ${CX + s * (rx - 6)} ${CY + 10} Z`, h));
    return o.join("");
  }
  const style = d.hairStyle;
  if (style === "wild") {
    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const a = Math.PI + (i / 22) * Math.PI;
      const r = (i % 2 ? 1.18 : 1.42) * rx;
      pts.push(`${(CX + Math.cos(a) * r).toFixed(1)} ${(CY - 20 + Math.sin(a) * r * 1.12).toFixed(1)}`);
    }
    o.push(P(`M${CX - rx - 10} ${CY + 40} L${pts.join(" L")} L${CX + rx + 10} ${CY + 40} L${CX + rx - 8} ${CY - 30} C${CX + rx - 30} ${CY - 92} ${CX - rx + 30} ${CY - 92} ${CX - rx + 8} ${CY - 30} Z`, h));
  } else if (style === "curly") {
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * 0.92 + (i / 16) * Math.PI * 1.16;
      o.push(C(CX + Math.cos(a) * (rx + 4), CY - 26 + Math.sin(a) * (ry * 0.95), 36, h));
    }
    o.push(P(cap, h));
    for (let i = 0; i < 7; i++) o.push(C(CX - rx * 0.75 + i * rx * 0.25, CY - 92 + (i % 2) * 12, 22, shade(h, 0.08)));
  } else {
    o.push(P(cap, h));
    if (style === "shaggy" || style === "matted") {
      let fringe = `M${CX - rx + 4} ${CY - 34}`;
      for (let i = 0; i < 9; i++) fringe += ` L${CX - rx + 24 + i * rx * 0.24} ${CY - 34 + (i % 2 ? -36 : 18)}`;
      fringe += ` L${CX + rx - 4} ${CY - 34} L${CX + rx - 30} ${CY - 100} L${CX - rx + 30} ${CY - 100} Z`;
      o.push(P(fringe, h));
    }
    if (style === "matted") for (let i = 0; i < 4; i++) o.push(S(`M${CX - 60 + i * 40} ${CY - 70} q${-10 + i * 6} 30 ${-4 + i * 4} 64`, shade(h, -0.2), 9));
    if (style === "braids" || style === "oakleaf") {
      for (const s of [-1, 1]) for (let i = 0; i < 7; i++) o.push(E(CX + s * (rx + 4), CY + 30 + i * 34, 20, 22, i % 2 ? h : shade(h, -0.15)));
      if (style === "braids") for (const s of [-1, 1]) o.push(R(CX + s * (rx + 4) - 12, CY + 262, 24, 12, "#c09a40", { rx: 4 }));
    }
    if (style === "tied") o.push(C(CX + 30, top - 30, 34, shade(h, -0.1)), L(CX + 6, top - 10, CX + 54, top - 50, "#6a4a2a", 6));
    if (style === "oakleaf") {
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * 1.05 + (i / 9) * Math.PI * 0.9;
        o.push(leaf(CX + Math.cos(a) * (rx + 4), CY - 30 + Math.sin(a) * ry * 0.95, i * 36 + 20, i % 2 ? "#4a7a32" : "#6a9a3a"));
      }
      for (let i = 0; i < 4; i++) o.push(C(CX - rx * 0.6 + i * rx * 0.4, CY - ry * 0.98, 6, "#c03028"));
    }
  }
  if (d.streak) o.push(S(`M${CX + 30} ${CY - 92} C${CX + 40} ${CY - 140} ${CX + 70} ${CY - 150} ${CX + 90} ${CY - 128}`, d.streak, 16));
  return o.join("");
}

function face(d, rx, ry) {
  const o = [];
  const skin = d.skin;
  const line = shade(skin, -0.55);
  const browColor = d.hairColor ? (/grizzled/.test(d.age) ? "#b8b4ac" : shade(d.hairColor, -0.1)) : shade(skin, -0.5);
  const ey = CY + 12;
  const er = /^young$/.test(d.age) ? 1.12 : 1;
  const iris = d.mark === "feyeyes" ? "#3ad070" : "#4a2e1a";
  const stern = /knight|deserter/.test(d.c.archetype) ? 8 : 0;

  // cheeks + shading
  o.push(E(CX - rx * 0.55, CY + 62, 34, 22, "#e05050", { opacity: d.woman ? 0.16 : 0.08 }), E(CX + rx * 0.55, CY + 62, 34, 22, "#e05050", { opacity: d.woman ? 0.16 : 0.08 }));
  for (const s of [-1, 1]) {
    const x = CX + s * 46;
    if (d.mark === "eyepatch" && s === 1) continue;
    o.push(E(x, ey, 22 * er, 12 * er, "#f4ece0"), C(x, ey + 1, 9.5 * er, iris), C(x, ey + 1, 4.5 * er, "#120c08"), C(x - 3, ey - 3, 2.5, "#ffffff", { opacity: 0.9 }));
    if (d.mark === "feyeyes") o.push(C(x, ey + 1, 22, "#5af090", { opacity: 0.18 }));
    o.push(S(`M${x - 24 * er} ${ey + 1} Q${x} ${ey - 18 * er} ${x + 24 * er} ${ey + 1}`, line, d.woman ? 4.5 : 3.5));
    if (d.woman) o.push(S(`M${x + s * 22} ${ey - 3} l${s * 8} -6`, line, 3));
    o.push(S(`M${x - 26} ${ey - 26 + (s === 1 ? 0 : 0) - (s * stern) / 2} Q${x} ${ey - 40} ${x + 26} ${ey - 26 + (s * stern) / 2}`, browColor, d.woman ? 6 : 9));
  }
  // nose + mouth
  o.push(S(`M${CX + 2} ${CY + 18} Q${CX - 10} ${CY + 50} ${CX - 14} ${CY + 60} Q${CX} ${CY + 70} ${CX + 14} ${CY + 60}`, shade(skin, -0.3), 4));
  const mouth = d.woman ? shade("#b04848", -0.1) : shade(skin, -0.42);
  const smile = /minstrel|brawler|friar/.test(d.c.archetype) ? 12 : 4;
  // age
  if (/grizzled|middle-aged|seasoned/.test(d.age) || d.mark === "weathered") {
    o.push(S(`M${CX - 50} ${CY - 70} Q${CX} ${CY - 80} ${CX + 50} ${CY - 70}`, shade(skin, -0.2), 3, { opacity: 0.7 }));
    if (/grizzled/.test(d.age) || d.mark === "weathered") {
      o.push(S(`M${CX - 44} ${CY - 56} Q${CX} ${CY - 64} ${CX + 44} ${CY - 56}`, shade(skin, -0.2), 3, { opacity: 0.6 }));
      for (const s of [-1, 1]) o.push(S(`M${CX + s * 74} ${ey - 4} l${s * 14} -6 M${CX + s * 74} ${ey + 4} l${s * 16} 2 M${CX + s * 74} ${ey + 12} l${s * 12} 8`, shade(skin, -0.25), 2.5));
      o.push(S(`M${CX - 30} ${CY + 66} Q${CX - 44} ${CY + 90} ${CX - 36} ${CY + 110} M${CX + 30} ${CY + 66} Q${CX + 44} ${CY + 90} ${CX + 36} ${CY + 110}`, shade(skin, -0.22), 3));
    }
  }
  const beardColor = d.hairColor ?? "#2a1e16";
  const m = d.mark;
  if (m === "beard" || m === "braidbeard") {
    o.push(P(`M${CX - rx + 2} ${CY + 8} C${CX - rx + 4} ${CY + ry + 50} ${CX + rx - 4} ${CY + ry + 50} ${CX + rx - 2} ${CY + 8} L${CX + rx - 14} ${CY + 40} C${CX + 70} ${CY + 70} ${CX + 40} ${CY + 70} ${CX} ${CY + 72} C${CX - 40} ${CY + 70} ${CX - 70} ${CY + 70} ${CX - rx + 14} ${CY + 40} Z`, beardColor));
    if (m === "braidbeard") for (let i = 0; i < 4; i++) o.push(E(CX, CY + ry + 50 + i * 32, 18 - i * 2, 20, i % 2 ? beardColor : shade(beardColor, -0.15)), ...(i === 3 ? [R(CX - 14, CY + ry + 160, 28, 12, "#c09a40", { rx: 4 })] : []));
  }
  if (m === "stubble") o.push(P(`M${CX - rx + 6} ${CY + 20} C${CX - rx + 10} ${CY + ry + 6} ${CX + rx - 10} ${CY + ry + 6} ${CX + rx - 6} ${CY + 20} L${CX + rx - 22} ${CY + 50} C${CX + 50} ${CY + 76} ${CX - 50} ${CY + 76} ${CX - rx + 22} ${CY + 50} Z`, beardColor, { opacity: 0.28 }));
  if (m === "beard" || m === "braidbeard" || m === "moustache") {
    o.push(P(`M${CX} ${CY + 70} C${CX - 30} ${CY + 60} ${CX - 64} ${CY + 70} ${CX - 74} ${CY + 102} C${CX - 50} ${CY + 88} ${CX - 24} ${CY + 86} ${CX} ${CY + 84} C${CX + 24} ${CY + 86} ${CX + 50} ${CY + 88} ${CX + 74} ${CY + 102} C${CX + 64} ${CY + 70} ${CX + 30} ${CY + 60} ${CX} ${CY + 70} Z`, shade(beardColor, -0.1)));
    o.push(S(`M${CX - 26} ${CY + 98} Q${CX} ${CY + 98 + smile} ${CX + 26} ${CY + 98}`, "#2a140c", 6));
  } else {
    o.push(S(`M${CX - 30} ${CY + 94} Q${CX} ${CY + 94 + smile} ${CX + 30} ${CY + 94}`, mouth, d.woman ? 8 : 5));
  }
  if (m === "freckles") for (let i = 0; i < 18; i++) o.push(C(CX + (i % 2 ? 1 : -1) * (24 + ((i * 17) % 50)), CY + 36 + ((i * 29) % 34), 3.2, shade(skin, -0.32), { opacity: 0.8 }));
  if (m === "scar") o.push(S(`M${CX - rx + 20} ${CY - 6} L${CX - 18} ${CY + 66}`, shade(skin, -0.25), 7), S(`M${CX - rx + 20} ${CY - 6} L${CX - 18} ${CY + 66}`, "#e8a8a0", 3), ...[0.25, 0.5, 0.75].map((t) => { const x = CX - rx + 20 + (rx - 38) * t, y = CY - 6 + 72 * t; return L(x - 9, y + 7, x + 9, y - 7, shade(skin, -0.3), 3); }));
  if (m === "eyepatch") o.push(E(CX + 46, ey, 30, 24, "#141414"), S(`M${CX - rx} ${CY - 50} L${CX + 20} ${ey - 10} M${CX + 72} ${ey + 4} L${CX + rx} ${CY + 30}`, "#141414", 7));
  if (m === "woad") o.push(S(`M${CX - 70} ${CY - 46} q20 -30 40 0 t40 0 t40 0 t30 -4 M${CX - 40} ${CY - 66} a10 10 0 1 1 20 0 M${CX + 20} ${CY - 66} a10 10 0 1 1 20 0`, "#2a5aa8", 6, { opacity: 0.85 }));
  return o.join("");
}

function headwear(d, rx, ry) {
  const o = [];
  const out = d.outfit;
  const [main, accent] = d.palette;
  if (d.hood) {
    if (/white stag/.test(out)) for (const s of [-1, 1]) o.push(S(`M${CX + s * 90} 250 L${CX + s * 140} 150 L${CX + s * 180} 120 M${CX + s * 135} 160 L${CX + s * 110} 110 M${CX + s * 160} 135 L${CX + s * 175} 90`, "#e8dcc0", 12));
    return o.join("");
  }
  const capTop = CY - ry * 0.84;
  if (/feathered cap/.test(out)) {
    const capColor = /royal minstrel/.test(out) ? "#a01c1c" : /forest-green jerkin/.test(out) ? shade(main, -0.15) : accent;
    o.push(P(`M${CX - rx - 20} ${capTop + 70} C${CX - rx} ${capTop - 70} ${CX + rx + 30} ${capTop - 90} ${CX + rx + 70} ${capTop + 30} L${CX + rx + 10} ${capTop + 60} Q${CX} ${capTop + 30} ${CX - rx - 20} ${capTop + 70} Z`, capColor));
    o.push(S(`M${CX + rx - 30} ${capTop + 10} C${CX + rx + 40} ${capTop - 90} ${CX + rx + 120} ${capTop - 150} ${CX + rx + 170} ${capTop - 200}`, /royal minstrel/.test(out) ? "#e0b040" : "#c03028", 14));
    o.push(S(`M${CX + rx - 30} ${capTop + 10} C${CX + rx + 40} ${capTop - 90} ${CX + rx + 120} ${capTop - 150} ${CX + rx + 170} ${capTop - 200}`, "#f2ead8", 3));
  } else if (/iron cap/.test(out)) {
    o.push(P(`M${CX - rx - 14} ${CY - 30} C${CX - rx - 10} ${CY - ry * 1.5} ${CX + rx + 10} ${CY - ry * 1.5} ${CX + rx + 14} ${CY - 30} Z`, STEEL), R(CX - rx - 22, CY - 44, (rx + 22) * 2, 22, shade(STEEL, -0.25), { rx: 8 }));
    o.push(P(`M${CX - 40} ${CY - ry * 0.9} Q${CX} ${CY - ry * 1.05} ${CX + 40} ${CY - ry * 0.9}`, "none", { stroke: "#ffffff", "stroke-width": 6, opacity: 0.4 }));
  } else if (/antler crown/.test(out)) {
    o.push(S(`M${CX - rx} ${CY - 50} Q${CX} ${CY - 80} ${CX + rx} ${CY - 50}`, "#5a4228", 12));
    for (const s of [-1, 1]) o.push(S(`M${CX + s * 60} ${CY - 66} L${CX + s * 90} ${CY - 170} L${CX + s * 130} ${CY - 220} M${CX + s * 84} ${CY - 150} L${CX + s * 50} ${CY - 200} M${CX + s * 110} ${CY - 196} L${CX + s * 120} ${CY - 250}`, "#e8dcc0", 11));
    for (let i = 0; i < 6; i++) o.push(leaf(CX - rx + 20 + i * (rx * 0.36), CY - 60 - Math.sin((i / 5) * Math.PI) * 18, i * 50, "#4a7a32"));
  }
  return o.join("");
}

// ---------- frame ----------

function frame(c, tokenId) {
  const col = RARITY_COLORS[c.rarity] ?? RARITY_COLORS.common;
  const name = esc(c.name);
  const size = c.name.length > 22 ? 46 : 54;
  return [
    R(14, 14, 972, 972, "none", { stroke: col, "stroke-width": 10, rx: 18 }),
    R(34, 34, 932, 932, "none", { stroke: col, "stroke-width": 2, rx: 10, opacity: 0.7 }),
    ...[[34, 34], [966, 34], [34, 966], [966, 966]].map(([x, y]) => P(`M${x} ${y - 16} L${x + 16} ${y} L${x} ${y + 16} L${x - 16} ${y} Z`, col)),
    `<defs><linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1a12" stop-opacity="0"/><stop offset="0.35" stop-color="#14110c" stop-opacity="0.92"/><stop offset="1" stop-color="#0c0a07"/></linearGradient></defs>`,
    R(20, 800, 960, 180, "url(#plate)"),
    `<text x="500" y="902" text-anchor="middle" font-family="Cinzel, 'Cinzel Decorative', Georgia, serif" font-weight="700" font-size="${size}" fill="#efe6cc" letter-spacing="2">${name}</text>`,
    `<text x="500" y="946" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="24" fill="${col}" letter-spacing="6">${esc(c.rarityLabel.toUpperCase())} · ${esc(c.archetypeLabel.toUpperCase())}</text>`,
    tokenId != null ? `<text x="64" y="86" font-family="Cinzel, Georgia, serif" font-size="28" fill="#efe6cc" opacity="0.85" letter-spacing="2">#${esc(String(tokenId).padStart(4, "0"))}</text>` : "",
  ].join("");
}

// ---------- portrait ----------

export function portraitSVG(c, { tokenId } = {}) {
  const d = describe(c);
  const rng = makeRng("portrait:" + (c.dna ?? c.seed));
  const rx = d.woman ? 108 : 118;
  const ry = d.woman ? 134 : 140;
  const hood = d.hood ? hoodPaths(d) : null;
  const skinDark = shade(d.skin, -0.18);
  const layers = [
    gearBack(d),
    hood ? P(hood.outer, shade(hood.color, -0.45)) : hairBack(d),
    torso(d),
    R(CX - 48, CY + ry - 60, 96, 140, skinDark, { rx: 30 }),
    P(`M${CX - 48} ${CY + ry - 20} Q${CX} ${CY + ry + 30} ${CX + 48} ${CY + ry - 20} L${CX + 48} ${CY + ry - 60} L${CX - 48} ${CY + ry - 60} Z`, shade(d.skin, -0.32), { opacity: 0.6 }),
    hood ? "" : E(CX - rx, CY + 18, 20, 32, skinDark),
    hood ? "" : E(CX + rx, CY + 18, 20, 32, skinDark),
    P(headShape(rx, ry), d.skin),
    E(CX + rx * 0.35, CY - 30, rx * 0.5, ry * 0.5, "#ffffff", { opacity: 0.06 }),
    face(d, rx, ry),
    hairFront(d, rx, ry),
    hood ? P(`${hood.outer} ${hood.hole}`, hood.color, { "fill-rule": "evenodd" }) : "",
    hood ? S(hood.hole, shade(hood.color, -0.35), 10) : "",
    headwear(d, rx, ry),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">` +
    `<title>${esc(c.name)}</title><clipPath id="card"><rect x="14" y="14" width="972" height="972" rx="18"/></clipPath>` +
    `<g clip-path="url(#card)">${background(d, rng)}<g transform="translate(500 560) scale(1.12) translate(-500 -560)">${layers.join("")}</g>${frame(c, tokenId)}</g></svg>`;
}
