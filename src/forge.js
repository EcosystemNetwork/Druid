// The Sherwood Forge: seeded, reproducible character rolls for a
// Robin Hood themed medieval roguelike. Same seed + options = same character.

// ---------- seeded RNG ----------

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(hashSeed(String(seed)));
  const rng = {
    float: next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    pickN: (arr, n) => {
      const pool = [...arr];
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      return out;
    },
    weighted: (entries) => {
      const total = entries.reduce((s, e) => s + e.weight, 0);
      let roll = next() * total;
      for (const e of entries) if ((roll -= e.weight) < 0) return e;
      return entries[entries.length - 1];
    },
  };
  return rng;
}

// ---------- tables ----------

export const RARITIES = [
  { id: "common", label: "Common", weight: 60, statBonus: 0, flair: "worn, patched and muddy" },
  { id: "uncommon", label: "Uncommon", weight: 27, statBonus: 2, flair: "well-kept, sturdy craftsmanship" },
  { id: "rare", label: "Rare", weight: 10, statBonus: 4, flair: "fine tooled leather and embroidered trim" },
  { id: "legendary", label: "Legendary", weight: 3, statBonus: 7, flair: "masterwork gear with subtle gold filigree and a heroic presence" },
];

export const STYLES = {
  stylized: "stylized hand-painted fantasy game character, slightly exaggerated proportions, clean readable silhouette",
  realistic: "realistic medieval game character, grounded proportions, detailed natural materials",
  lowpoly: "low-poly stylized game character, flat-shaded faceted look, simple chunky shapes",
};

// Weapons are always stowed (slung, sheathed, holstered) so the hands stay
// free. Props fused to the hands are the most common cause of bad auto-rigs.
export const ARCHETYPES = {
  outlaw_archer: {
    label: "Outlaw Archer",
    role: "Ranged skirmisher",
    base: { might: 4, finesse: 8, cunning: 6, grit: 4 },
    hp: 18,
    body: ["lean", "wiry", "athletic"],
    outfit: [
      "hooded Lincoln-green tunic, leather jerkin, brown hose and soft leather boots",
      "green hooded cloak over a quilted gambeson, leather bracers, tall boots",
      "forest-green jerkin with laced collar, feathered cap, belted tunic and knee boots",
    ],
    gear: ["longbow slung across the back", "quiver of grey-goose arrows on the back"],
    sidearm: ["hunting knife on the belt", "short sword sheathed at the hip"],
    animations: ["preset:biped:shoot", "preset:biped:jump"],
  },
  merry_brawler: {
    label: "Merry Brawler",
    role: "Bruiser tank",
    base: { might: 8, finesse: 4, cunning: 3, grit: 8 },
    hp: 28,
    body: ["huge", "broad-shouldered", "towering"],
    outfit: [
      "sleeveless leather vest, rope belt, rolled linen shirt, heavy boots",
      "patched russet tunic, wide leather belt, wrapped forearms, sturdy boots",
    ],
    gear: ["long oak quarterstaff strapped diagonally across the back"],
    sidearm: ["leather waterskin on the belt", "iron-banded cudgel hanging at the hip"],
    animations: ["preset:biped:box_01", "preset:biped:front_kick_01"],
  },
  friar: {
    label: "Hedge Friar",
    role: "Healer / support",
    base: { might: 6, finesse: 3, cunning: 5, grit: 7 },
    hp: 24,
    body: ["stout", "round-bellied", "sturdy"],
    outfit: [
      "brown wool monk's habit with rope cincture and sandals",
      "hooded grey friar's robe, wooden prayer beads, leather satchel, sandals",
    ],
    gear: ["small wooden cask strapped to the back", "herb pouches on the belt"],
    sidearm: ["heavy iron mace hanging at the hip", "wooden cross pendant on the chest"],
    animations: ["preset:biped:cast_a_spell", "preset:biped:chop"],
  },
  sherwood_witch: {
    label: "Sherwood Witch",
    role: "Hexer / caster",
    base: { might: 2, finesse: 5, cunning: 9, grit: 4 },
    hp: 16,
    body: ["slender", "gaunt", "willowy"],
    outfit: [
      "layered moss-green and black robes, bone charms, bark-woven bodice, bare feet wrapped in cloth",
      "hooded tattered cloak with antler clasp, herb-stained dress, leather boots",
    ],
    gear: ["gnarled twig staff strapped across the back", "bundles of dried herbs on the belt"],
    sidearm: ["small ritual sickle at the hip", "crow-feather fetish on the shoulder"],
    animations: ["preset:biped:cast_a_spell", "preset:biped:look_around"],
  },
  poacher: {
    label: "King's-Deer Poacher",
    role: "Trapper / assassin",
    base: { might: 5, finesse: 7, cunning: 8, grit: 3 },
    hp: 17,
    body: ["lean", "hunched", "scrappy"],
    outfit: [
      "deerskin hood and mantle, patched leather breeches, fur-wrapped boots",
      "mud-brown hooded tunic, snare cords around the waist, wrapped shins",
    ],
    gear: ["short crossbow slung on the back", "coil of snare wire on the back"],
    sidearm: ["skinning knife on the belt", "pair of throwing knives on a bandolier"],
    animations: ["preset:biped:shoot", "preset:biped:dig"],
  },
  disgraced_knight: {
    label: "Disgraced Knight",
    role: "Heavy melee",
    base: { might: 8, finesse: 5, cunning: 3, grit: 7 },
    hp: 26,
    body: ["broad", "battle-scarred", "tall"],
    outfit: [
      "dented chainmail hauberk under a torn crusader tabard, leather gloves, iron greaves",
      "battered plate pauldrons over chainmail, defaced heraldic surcoat, steel sabatons",
    ],
    gear: ["round wooden shield on the back", "kite shield with a scratched-out crest on the back"],
    sidearm: ["longsword sheathed at the hip", "arming sword sheathed at the hip"],
    animations: ["preset:biped:slash", "preset:biped:hit_to_body_01"],
  },
  sheriffs_deserter: {
    label: "Sheriff's Deserter",
    role: "Soldier / all-rounder",
    base: { might: 6, finesse: 6, cunning: 5, grit: 5 },
    hp: 21,
    body: ["average build", "stocky", "weathered"],
    outfit: [
      "faded Nottingham red gambeson, kettle helm tied to the belt, leather gloves, boots",
      "padded tabard with torn-off sheriff's badge, open-faced iron cap, worn boots",
    ],
    gear: ["crossbow slung on the back", "rolled wanted poster tucked in the belt"],
    sidearm: ["falchion sheathed at the hip", "billhook hanging at the hip"],
    animations: ["preset:biped:slash", "preset:biped:shoot"],
  },
  minstrel: {
    label: "Wandering Minstrel",
    role: "Bard / buffer",
    base: { might: 3, finesse: 7, cunning: 7, grit: 4 },
    hp: 17,
    body: ["slim", "nimble", "lanky"],
    outfit: [
      "parti-coloured doublet in green and gold, feathered cap, pointed shoes",
      "slashed-sleeve tunic, bright scarf, short cape, soft boots",
    ],
    gear: ["wooden lute slung on the back"],
    sidearm: ["rapier-like slim sword at the hip", "purse of coins on the belt"],
    animations: ["preset:biped:sing_01", "preset:biped:dance_01"],
  },
};

const FACES = {
  age: ["young", "young adult", "seasoned", "middle-aged", "grizzled old"],
  hair: [
    "shaggy auburn hair", "close-cropped black hair", "long braided blonde hair", "wild grey hair",
    "tied-back chestnut hair", "shaved head", "curly red hair", "matted dark hair under the hood",
  ],
  facial: ["short beard", "stubble", "clean-shaven", "thick moustache", "braided beard", "freckles", "a scar across one cheek", "weathered skin"],
  sex: ["man", "woman"],
};

const PALETTES = [
  "Lincoln green, brown leather and undyed linen",
  "moss green, charcoal and rust",
  "forest green, ochre and dark walnut",
  "faded red, iron grey and tan leather",
  "russet, olive and bone white",
  "deep teal, black leather and brass",
];

const NAMES = {
  first: {
    man: ["Will", "Alan", "Much", "Gilbert", "Hob", "Wat", "Osric", "Godric", "Tuck", "Arthur", "Simon", "Ralf", "Edwin", "Piers", "Jack"],
    woman: ["Marian", "Edith", "Maud", "Joan", "Agnes", "Isolde", "Alys", "Cecily", "Wynn", "Hild", "Rosamund", "Elspeth", "Mabel"],
  },
  epithet: [
    "of Locksley", "Scarlet", "the Miller's Son", "a-Dale", "Greenleaf", "the Fletcher", "of Barnsdale",
    "Two-Arrows", "the Unhanged", "Oakheart", "Crowfoot", "of Nottingham", "the Quiet", "Ashwood", "Longstride",
  ],
};

const PERKS = [
  { name: "Split the Arrow", text: "Critical hits ricochet to a second target." },
  { name: "Rob the Rich", text: "Elite enemies drop double gold." },
  { name: "Give to the Poor", text: "Spending gold at a shrine heals 3 HP per 10 gold." },
  { name: "Greenwood Cloak", text: "Start each room hidden; first attack is a sneak attack." },
  { name: "Merry Band", text: "Recruited followers deal +25% damage." },
  { name: "Outlaw's Luck", text: "Once per floor, survive a lethal blow at 1 HP." },
  { name: "Sherwood Born", text: "Forest rooms reveal one hidden cache." },
  { name: "Silver Tongue", text: "Merchants offer one extra item." },
  { name: "Ambush", text: "+50% damage against enemies that have not acted yet." },
  { name: "Sheriff's Bane", text: "Guards and soldiers take +20% damage from you." },
];

const FLAWS = [
  { name: "Wanted", text: "Bounty hunters spawn every third floor." },
  { name: "Soft Heart", text: "Cannot attack fleeing enemies." },
  { name: "Old Wound", text: "-2 Grit while below half HP." },
  { name: "Drinker", text: "Taverns cost no gold but drain 1 HP." },
  { name: "Proud", text: "Refusing a duel costs 5 renown." },
  { name: "Clumsy", text: "Traps trigger on you 25% more often." },
  { name: "Hunted by the Abbot", text: "Holy sites are hostile." },
];

const RELICS = [
  "Silver Arrow of the Tourney", "Marian's Ribbon", "Sheriff's Signet (stolen)", "Pouch of King's Pennies",
  "Hunting Horn of Sherwood", "Tuck's Blessed Flask", "Map of Nottingham Sewers", "Oak Leaf Brooch",
  "Broken Ransom Chain", "Lucky Grey-Goose Fletching",
];

// Every character gets these; archetypes add their 2 signature moves on top.
// Rig v1.0-20240301 biped preset names (see /en/docs/animations-retarget).
// Retarget accepts at most 5 animations per request (billed per clip), so hurt,
// defeat and victory are left to the game's procedural stand-ins (web/game/models.js).
export const CORE_ANIMATIONS = ["preset:biped:idle", "preset:biped:walk", "preset:biped:run"];
export const MAX_RETARGET_ANIMATIONS = 5;

// ---------- forge ----------

export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

export function forgeCharacter({ seed = randomSeed(), archetype, rarity, style = "stylized", sex } = {}) {
  const rng = makeRng(seed);

  const archId = archetype && ARCHETYPES[archetype] ? archetype : rng.pick(Object.keys(ARCHETYPES));
  const arch = ARCHETYPES[archId];
  const rar = RARITIES.find((r) => r.id === rarity) ?? rng.weighted(RARITIES);
  const who = sex && FACES.sex.includes(sex) ? sex : rng.pick(FACES.sex);

  const look = {
    sex: who,
    age: rng.pick(FACES.age),
    build: rng.pick(arch.body),
    hair: rng.pick(FACES.hair),
    face: who === "man" ? rng.pick(FACES.facial) : rng.pick(FACES.facial.filter((f) => !/beard|moustache|stubble|shaven/.test(f))),
    outfit: rng.pick(arch.outfit),
    gear: rng.pick(arch.gear),
    sidearm: rng.pick(arch.sidearm),
    palette: rng.pick(PALETTES),
  };

  const stats = {};
  for (const [k, v] of Object.entries(arch.base)) {
    stats[k] = Math.max(1, v + rng.int(-1, 2) + Math.floor(rar.statBonus / 2) + (rng.float() < rar.statBonus / 10 ? 1 : 0));
  }
  const hp = arch.hp + stats.grit + rar.statBonus;

  const name = `${rng.pick(NAMES.first[who])} ${rng.pick(NAMES.epithet)}`;
  const perks = rng.pickN(PERKS, rar.id === "legendary" ? 2 : 1);
  const flaw = rng.pick(FLAWS);
  const relic = rng.pick(RELICS);

  const character = {
    seed: String(seed),
    name,
    archetype: archId,
    archetypeLabel: arch.label,
    role: arch.role,
    rarity: rar.id,
    rarityLabel: rar.label,
    style,
    look,
    stats,
    hp,
    gold: rng.int(5, 25) + rar.statBonus * 5,
    perks,
    flaw,
    relic,
    animations: [...CORE_ANIMATIONS, ...arch.animations],
  };
  character.prompt = buildPrompt(character, rar);
  character.negativePrompt = NEGATIVE_PROMPT;
  return character;
}

// Kept under Tripo's 255-char negative prompt limit.
export const NEGATIVE_PROMPT =
  "multiple characters, pedestal, base, ground, weapon in hands, holding objects, cropped, missing limbs, fused fingers, sitting, modern clothing, sci-fi, blurry, low quality, broken mesh";

function buildPrompt(c, rar) {
  const l = c.look;
  const prompt = [
    `Full body ${STYLES[c.style] ?? STYLES.stylized}.`,
    `A ${l.age} ${l.build} ${l.sex}, a medieval Sherwood Forest ${c.archetypeLabel.toLowerCase()} from the Robin Hood legend,`,
    `${l.hair}, ${l.face}.`,
    `Wearing ${l.outfit}, colour palette of ${l.palette}, ${rar.flair}.`,
    `Equipment: ${l.gear}, ${l.sidearm}.`,
    "Standing in a neutral A-pose, arms held away from the body, legs slightly apart, empty open hands, facing forward,",
    "symmetrical, single character, clean separated limbs for rigging, plain background.",
  ].join(" ");
  return prompt.slice(0, 1024);
}

export function slugify(c) {
  return `${c.name}-${c.seed}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------- Tripo pipeline payloads (shared by the Node pipeline and the browser forge) ----------

export const PIPELINE_DEFAULTS = {
  model: "v3.1-20260211",
  textureQuality: "detailed", // fast | standard | detailed | extreme
  geometryQuality: "standard", // standard | detailed (Ultra)
  faceLimit: 40000, // game-ready humanoid
  fbx: false,
  inPlace: true, // root motion off; game controllers move the character
};

export function numericSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483647;
}

export function generatePayload(character, opts) {
  return {
    prompt: character.prompt,
    negative_prompt: character.negativePrompt,
    model: opts.model,
    texture: true,
    pbr: true,
    texture_quality: opts.textureQuality,
    geometry_quality: opts.geometryQuality,
    face_limit: opts.faceLimit,
    auto_size: true,
    // Same seed string -> same mesh, so rerolls are reproducible.
    model_seed: numericSeed(character.seed),
    texture_seed: numericSeed(character.seed + ":tex"),
    image_seed: numericSeed(character.seed + ":img"),
  };
}

// v1.0 is the biped rig that unlocks the 90+ preset library;
// mixamo naming maps straight onto Unity/Unreal humanoid avatars.
export const rigPayload = (generateTaskId) => ({ input: generateTaskId, model: "v1.0-20240301", rig_type: "biped", spec: "mixamo", out_format: "glb" });

export const retargetPayload = (character, rigTaskId, format, opts) => ({
  input: rigTaskId,
  // Characters saved before the cap carried 8 clips; trim so their resumes don't 400.
  animations: character.animations.slice(0, MAX_RETARGET_ANIMATIONS),
  out_format: format,
  bake_animation: true,
  export_with_geometry: true,
  animate_in_place: opts.inPlace,
});

export function rigCheckError(output) {
  const { riggable, rig_type: rigType } = output ?? {};
  if (riggable && rigType === "biped") return null;
  return (
    `Model is not riggable as a humanoid (riggable=${riggable}, rig_type=${rigType}). ` +
    "Reroll with a new seed: usually a prop fused to the hands or a cloak merging the legs."
  );
}
