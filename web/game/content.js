// Game content: archetype combat kits, enemies, upgrades, relic effects, perk/flaw ids.

export const KITS = {
  outlaw_archer: {
    type: "ranged", weapon: "bow", proj: "arrow", rate: 0.42, speed: 28, range: 22, spread: 0.03,
    ability: { id: "volley", name: "Volley", cd: 6, text: "Loose a fan of seven piercing arrows." },
  },
  merry_brawler: {
    type: "melee", weapon: "staff", rate: 0.62, reach: 2.8, arc: Math.PI * 0.95, knock: 8,
    ability: { id: "slam", name: "Ground Slam", cd: 7, text: "Smash the earth, stunning everything within 4.5m." },
  },
  friar: {
    type: "melee", weapon: "mace", rate: 0.58, reach: 2.3, arc: Math.PI * 0.7, knock: 5,
    ability: { id: "flask", name: "Blessed Flask", cd: 12, text: "Heal 30% HP and scorch nearby foes." },
  },
  sherwood_witch: {
    type: "caster", weapon: "twig", proj: "hex", rate: 0.55, speed: 15, range: 18, spread: 0.02, splash: 1.8, slow: 1.6,
    ability: { id: "thorns", name: "Thorn Ring", cd: 9, text: "Brambles erupt at the cursor, rooting and wounding." },
  },
  poacher: {
    type: "ranged", weapon: "dagger", proj: "knife", rate: 0.3, speed: 24, range: 13, spread: 0.06,
    ability: { id: "snare", name: "Snare", cd: 4, text: "Set a snare that roots and wounds the first foe (max 3)." },
  },
  disgraced_knight: {
    type: "melee", weapon: "sword", offhand: "shield", rate: 0.48, reach: 2.4, arc: Math.PI * 0.75, knock: 5, armor: 1,
    ability: { id: "charge", name: "Shield Charge", cd: 6, text: "Charge forward, bashing and stunning foes." },
  },
  sheriffs_deserter: {
    type: "ranged", weapon: "crossbow", proj: "bolt", rate: 0.72, speed: 36, range: 24, spread: 0.01, pierce: 1, dmgMul: 1.5,
    ability: { id: "sweep", name: "Billhook Sweep", cd: 6, text: "Spin the billhook, cleaving everything around you." },
  },
  minstrel: {
    type: "caster", weapon: "lute", proj: "note", rate: 0.38, speed: 17, range: 17, spread: 0.05, homing: 4,
    ability: { id: "ballad", name: "Ballad of Valor", cd: 14, text: "+40% damage and +25% speed for 6s, heal 4." },
  },
};

export const ENEMIES = {
  guard: {
    name: "Sheriff's Guard", ai: "melee", kind: "humanoid", hp: 14, speed: 3.3, dmg: 4, reach: 1.6, windup: 0.5, cd: 1.3,
    radius: 0.5, gold: [2, 4], sheriff: true, cost: 2, from: 1,
    look: { tunic: 0x8e2a22, pants: 0x4a3a30, accent: 0xcfae5a, hat: "helm", weapon: "sword" },
  },
  hound: {
    name: "Sheriff's Hound", ai: "melee", kind: "hound", hp: 7, speed: 6.4, dmg: 3, reach: 1.1, windup: 0.3, cd: 1.0,
    radius: 0.42, gold: [1, 2], cost: 1, from: 1,
  },
  crossbow: {
    name: "Crossbowman", ai: "ranged", kind: "humanoid", hp: 9, speed: 3.0, dmg: 4, range: [8, 13], boltSpeed: 17,
    windup: 0.85, cd: 2.4, radius: 0.45, gold: [2, 5], sheriff: true, cost: 2, from: 2,
    look: { tunic: 0xa8442e, pants: 0x3a3028, accent: 0x6a5030, hat: "kettle", weapon: "crossbow" },
  },
  boar: {
    name: "Wild Boar", ai: "charger", kind: "boar", hp: 22, speed: 2.4, dmg: 6, chargeSpeed: 15, chargeTime: 0.9,
    windup: 0.8, cd: 2.6, radius: 0.62, gold: [2, 4], cost: 3, from: 3,
  },
  zealot: {
    name: "Abbey Zealot", ai: "caster", kind: "humanoid", hp: 12, speed: 2.8, dmg: 4, range: [7, 11], boltSpeed: 8,
    windup: 0.6, cd: 2.8, radius: 0.45, gold: [3, 5], cost: 3, from: 4,
    look: { tunic: 0x3a2e24, pants: 0x3a2e24, robe: true, hat: "hood", hatColor: 0x2a2018, weapon: "censer", accent: 0xd6c070 },
  },
  hunter: {
    name: "Bounty Hunter", ai: "melee", kind: "humanoid", hp: 40, speed: 4.4, dmg: 6, reach: 1.9, windup: 0.4, cd: 1.0,
    radius: 0.55, gold: [14, 22], cost: 6, from: 99, dash: true,
    look: { tunic: 0x2a2a2e, pants: 0x1e1e22, hat: "hood", hatColor: 0x18181a, weapon: "axe", bulk: 1.15, cloak: 0x1a1a1a },
  },
  sheriff: {
    name: "The Sheriff of Nottingham", ai: "boss", kind: "humanoid", hp: 340, speed: 3.8, dmg: 7, reach: 2.5, windup: 0.5,
    cd: 0.6, radius: 0.75, gold: [60, 80], sheriff: true, boss: true,
    look: { tunic: 0x5a1010, pants: 0x1a1a1a, accent: 0xd6a84a, hat: "sheriff", weapon: "sword", bulk: 1.2, height: 1.25, cloak: 0x2a0808 },
  },
};

export const UPGRADES = [
  { id: "steel", name: "Sharpened Steel", rarity: "common", text: "+15% damage.", apply: (P) => (P.mods.dmg *= 1.15) },
  { id: "quick", name: "Quick Hands", rarity: "common", text: "+15% attack speed.", apply: (P) => (P.mods.rate *= 1.15) },
  { id: "stout", name: "Stout Heart", rarity: "common", text: "+6 max HP and heal 6.", apply: (P) => { P.maxHp += 6; P.hp = Math.min(P.maxHp, P.hp + 6); } },
  { id: "fleet", name: "Fleet Foot", rarity: "common", text: "+10% move speed.", apply: (P) => (P.mods.speed *= 1.1) },
  { id: "keen", name: "Keen Eye", rarity: "common", text: "+8% critical chance.", apply: (P) => (P.mods.crit += 0.08) },
  { id: "wits", name: "Sharp Wits", rarity: "common", text: "-15% ability cooldown.", apply: (P) => (P.mods.cd *= 0.85) },
  { id: "fingers", name: "Light Fingers", rarity: "common", text: "+40% gold from foes.", apply: (P) => (P.mods.gold *= 1.4) },
  { id: "iron", name: "Iron Skin", rarity: "rare", text: "+1 armour: every hit deals 1 less damage.", apply: (P) => (P.mods.armor += 1) },
  { id: "oath", name: "Blood Oath", rarity: "rare", text: "Heal 1 HP for every kill.", apply: (P) => (P.mods.leech += 1) },
  { id: "bramble", name: "Bramble Cloak", rarity: "rare", text: "Foes that hit you take 4 damage.", apply: (P) => (P.mods.thorns += 4) },
  { id: "wind", name: "Second Wind", rarity: "rare", text: "-35% dodge cooldown.", apply: (P) => (P.mods.dodgeCd *= 0.65) },
  { id: "hermit", name: "Hermit's Blessing", rarity: "rare", text: "Regenerate 1 HP every 5 seconds.", apply: (P) => (P.mods.regen += 0.2) },
  { id: "bodkin", name: "Bodkin Points", rarity: "rare", text: "Projectiles pierce one more foe.", when: (P) => P.kit.type !== "melee", apply: (P) => (P.mods.pierce += 1) },
  { id: "wide", name: "Wide Swing", rarity: "rare", text: "+25% melee reach and arc.", when: (P) => P.kit.type === "melee", apply: (P) => (P.mods.arc *= 1.25) },
  { id: "twin", name: "Twin Shot", rarity: "epic", text: "+1 projectile per attack.", when: (P) => P.kit.type !== "melee", apply: (P) => (P.mods.multishot += 1) },
  { id: "heavy", name: "Heavy Blows", rarity: "epic", text: "+30% damage and stronger knockback.", when: (P) => P.kit.type === "melee", apply: (P) => { P.mods.dmg *= 1.3; P.mods.knock *= 1.6; } },
  { id: "giant", name: "Giant's Draught", rarity: "epic", text: "+12 max HP and +1 armour.", apply: (P) => { P.maxHp += 12; P.hp += 12; P.mods.armor += 1; } },
  { id: "deadeye", name: "Deadeye", rarity: "epic", text: "+15% crit chance, crits deal 2.5x.", apply: (P) => { P.mods.crit += 0.15; P.mods.critMul = 2.5; } },
];

export const RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };
export const RARITY_PRICE = { common: 20, rare: 34, epic: 55 };

export const RELIC_EFFECTS = {
  "Silver Arrow of the Tourney": { text: "+10% critical chance.", apply: (P) => (P.mods.crit += 0.1) },
  "Marian's Ribbon": { text: "+5 max HP.", apply: (P) => { P.maxHp += 5; P.hp += 5; } },
  "Sheriff's Signet (stolen)": { text: "Merchants charge 20% less.", apply: (P) => (P.mods.price *= 0.8) },
  "Pouch of King's Pennies": { text: "+30% gold.", apply: (P) => (P.mods.gold *= 1.3) },
  "Hunting Horn of Sherwood": { text: "-15% ability cooldown.", apply: (P) => (P.mods.cd *= 0.85) },
  "Tuck's Blessed Flask": { text: "Heal 25% HP after each clearing.", apply: (P) => (P.mods.clearHeal += 0.25) },
  "Map of Nottingham Sewers": { text: "-25% dodge cooldown.", apply: (P) => (P.mods.dodgeCd *= 0.75) },
  "Oak Leaf Brooch": { text: "+1 armour.", apply: (P) => (P.mods.armor += 1) },
  "Broken Ransom Chain": { text: "+10% damage.", apply: (P) => (P.mods.dmg *= 1.1) },
  "Lucky Grey-Goose Fletching": { text: "+5% crit chance and +5% speed.", apply: (P) => { P.mods.crit += 0.05; P.mods.speed *= 1.05; } },
};

export const PERK_IDS = {
  "Split the Arrow": "splitArrow",
  "Rob the Rich": "robRich",
  "Give to the Poor": "givePoor",
  "Greenwood Cloak": "cloak",
  "Merry Band": "merryBand",
  "Outlaw's Luck": "outlawsLuck",
  "Sherwood Born": "sherwoodBorn",
  "Silver Tongue": "silverTongue",
  Ambush: "ambush",
  "Sheriff's Bane": "sheriffsBane",
};

export const FLAW_IDS = {
  Wanted: "wanted",
  "Soft Heart": "softHeart",
  "Old Wound": "oldWound",
  Drinker: "drinker",
  Proud: "proud",
  Clumsy: "clumsy",
  "Hunted by the Abbot": "abbot",
};

export const FINAL_FLOOR = 7;
export const SHOP_AFTER = new Set([2, 4, 6]);
