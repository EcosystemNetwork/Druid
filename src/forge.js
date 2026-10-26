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

// ---------- trait tiers (build-your-own NFT collection) ----------

// Every trait option has a tier. In build mode a character's rarity comes from the
// summed points of its traits, and rare/legendary options have a capped mint supply.
export const TIERS = {
  common: { label: "Common", points: 0, weight: 6 },
  uncommon: { label: "Uncommon", points: 1, weight: 3 },
  rare: { label: "Rare", points: 3, weight: 1.5 },
  legendary: { label: "Legendary", points: 6, weight: 0.5 },
};
const RARITY_THRESHOLDS = [["legendary", 18], ["rare", 9], ["uncommon", 4], ["common", 0]];

export const COLLECTION = {
  name: "Outlaws of Sherwood",
  symbol: "OUTLAW",
  chain: "Robinhood Chain",
  maxSupply: 5000,
  // Mint cap per option, by tier. An option can override it with its own `cap`.
  caps: { rare: 200, legendary: 30 },
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const capital = (s) => s[0].toUpperCase() + s.slice(1);

// `text` goes into the Tripo prompt, `label` is the short NFT attribute value.
// `creator: true` options exist only in the build-your-own creator, so random rolls
// (and every seed rolled before they existed) are unchanged.
const opt = (text, tier = "common", extra = {}) => {
  const label = extra.label ?? capital(text);
  return { id: slug(label), text, label, tier, ...extra };
};
const rollable = (arr) => arr.filter((o) => !o.creator);

// Weapons are always stowed (slung, sheathed, holstered) so the hands stay
// free. Props fused to the hands are the most common cause of bad auto-rigs.
export const ARCHETYPES = {
  outlaw_archer: {
    label: "Outlaw Archer",
    role: "Ranged skirmisher",
    base: { might: 4, finesse: 8, cunning: 6, grit: 4 },
    hp: 18,
    body: [opt("lean"), opt("wiry"), opt("athletic")],
    outfit: [
      opt("hooded Lincoln-green tunic, leather jerkin, brown hose and soft leather boots", "common", { label: "Lincoln Green Hood" }),
      opt("green hooded cloak over a quilted gambeson, leather bracers, tall boots", "uncommon", { label: "Hooded Cloak & Gambeson" }),
      opt("forest-green jerkin with laced collar, feathered cap, belted tunic and knee boots", "rare", { label: "Feathered Cap & Jerkin" }),
      opt("hooded Lincoln-green tunic embroidered with golden oak leaves, silver-buckled leather jerkin, fine green hose and tall doeskin boots", "legendary", { label: "Hood of Locksley", creator: true }),
    ],
    gear: [opt("longbow slung across the back", "common", { label: "Slung Longbow" }), opt("quiver of grey-goose arrows on the back", "uncommon", { label: "Grey-Goose Quiver" })],
    sidearm: [opt("hunting knife on the belt", "common", { label: "Hunting Knife" }), opt("short sword sheathed at the hip", "uncommon", { label: "Short Sword" })],
    animations: ["preset:biped:shoot", "preset:biped:jump"],
  },
  merry_brawler: {
    label: "Merry Brawler",
    role: "Bruiser tank",
    base: { might: 8, finesse: 4, cunning: 3, grit: 8 },
    hp: 28,
    body: [opt("huge"), opt("broad-shouldered"), opt("towering")],
    outfit: [
      opt("sleeveless leather vest, rope belt, rolled linen shirt, heavy boots", "common", { label: "Leather Vest" }),
      opt("patched russet tunic, wide leather belt, wrapped forearms, sturdy boots", "uncommon", { label: "Patched Russet Tunic" }),
      opt("sleeveless studded leather vest, prize-fighter's brass championship belt, wrapped forearms, heavy hobnailed boots", "legendary", { label: "Champion's Belt", creator: true }),
    ],
    gear: [opt("long oak quarterstaff strapped diagonally across the back", "common", { label: "Oak Quarterstaff" })],
    sidearm: [opt("leather waterskin on the belt", "common", { label: "Waterskin" }), opt("iron-banded cudgel hanging at the hip", "uncommon", { label: "Iron-Banded Cudgel" })],
    animations: ["preset:biped:box_01", "preset:biped:front_kick_01"],
  },
  friar: {
    label: "Hedge Friar",
    role: "Healer / support",
    base: { might: 6, finesse: 3, cunning: 5, grit: 7 },
    hp: 24,
    body: [opt("stout"), opt("round-bellied"), opt("sturdy")],
    outfit: [
      opt("brown wool monk's habit with rope cincture and sandals", "common", { label: "Brown Habit" }),
      opt("hooded grey friar's robe, wooden prayer beads, leather satchel, sandals", "uncommon", { label: "Grey Friar's Robe" }),
      opt("rich purple-and-gold abbot's vestments worn over a patched habit, rope cincture, sandals", "legendary", { label: "Abbot's Stolen Vestments", creator: true }),
    ],
    gear: [opt("small wooden cask strapped to the back", "common", { label: "Ale Cask" }), opt("herb pouches on the belt", "uncommon", { label: "Herb Pouches" })],
    sidearm: [opt("heavy iron mace hanging at the hip", "common", { label: "Iron Mace" }), opt("wooden cross pendant on the chest", "uncommon", { label: "Wooden Cross" })],
    animations: ["preset:biped:cast_a_spell", "preset:biped:chop"],
  },
  sherwood_witch: {
    label: "Sherwood Witch",
    role: "Hexer / caster",
    base: { might: 2, finesse: 5, cunning: 9, grit: 4 },
    hp: 16,
    body: [opt("slender"), opt("gaunt"), opt("willowy")],
    outfit: [
      opt("layered moss-green and black robes, bone charms, bark-woven bodice, bare feet wrapped in cloth", "common", { label: "Moss Robes & Bone Charms" }),
      opt("hooded tattered cloak with antler clasp, herb-stained dress, leather boots", "uncommon", { label: "Antler-Clasp Cloak" }),
      opt("living moss-and-ivy mantle, antler crown circlet, bark-woven bodice, cloth-wrapped feet", "legendary", { label: "Mantle of the Green Lady", creator: true }),
    ],
    gear: [opt("gnarled twig staff strapped across the back", "common", { label: "Gnarled Twig Staff" }), opt("bundles of dried herbs on the belt", "uncommon", { label: "Dried Herb Bundles" })],
    sidearm: [opt("small ritual sickle at the hip", "common", { label: "Ritual Sickle" }), opt("crow-feather fetish on the shoulder", "uncommon", { label: "Crow-Feather Fetish" })],
    animations: ["preset:biped:cast_a_spell", "preset:biped:look_around"],
  },
  poacher: {
    label: "King's-Deer Poacher",
    role: "Trapper / assassin",
    base: { might: 5, finesse: 7, cunning: 8, grit: 3 },
    hp: 17,
    body: [opt("lean"), opt("hunched"), opt("scrappy")],
    outfit: [
      opt("deerskin hood and mantle, patched leather breeches, fur-wrapped boots", "common", { label: "Deerskin Mantle" }),
      opt("mud-brown hooded tunic, snare cords around the waist, wrapped shins", "uncommon", { label: "Snare-Corded Tunic" }),
      opt("white stag-hide hood and mantle with small antlers, patched leather breeches, fur-wrapped boots", "legendary", { label: "Pelt of the White Hart", creator: true }),
    ],
    gear: [opt("short crossbow slung on the back", "common", { label: "Short Crossbow" }), opt("coil of snare wire on the back", "uncommon", { label: "Snare Wire Coil" })],
    sidearm: [opt("skinning knife on the belt", "common", { label: "Skinning Knife" }), opt("pair of throwing knives on a bandolier", "uncommon", { label: "Throwing Knives" })],
    animations: ["preset:biped:shoot", "preset:biped:dig"],
  },
  disgraced_knight: {
    label: "Disgraced Knight",
    role: "Heavy melee",
    base: { might: 8, finesse: 5, cunning: 3, grit: 7 },
    hp: 26,
    body: [opt("broad"), opt("battle-scarred"), opt("tall")],
    outfit: [
      opt("dented chainmail hauberk under a torn crusader tabard, leather gloves, iron greaves", "common", { label: "Torn Crusader Tabard" }),
      opt("battered plate pauldrons over chainmail, defaced heraldic surcoat, steel sabatons", "uncommon", { label: "Defaced Surcoat & Plate" }),
      opt("blackened chainmail hauberk, torn white surcoat with a burnt red cross, steel gauntlets and sabatons", "legendary", { label: "Templar's Shame", creator: true }),
    ],
    gear: [opt("round wooden shield on the back", "common", { label: "Round Shield" }), opt("kite shield with a scratched-out crest on the back", "uncommon", { label: "Scratched Kite Shield" })],
    sidearm: [opt("longsword sheathed at the hip", "common", { label: "Longsword" }), opt("arming sword sheathed at the hip", "uncommon", { label: "Arming Sword" })],
    animations: ["preset:biped:slash", "preset:biped:hit_to_body_01"],
  },
  sheriffs_deserter: {
    label: "Sheriff's Deserter",
    role: "Soldier / all-rounder",
    base: { might: 6, finesse: 6, cunning: 5, grit: 5 },
    hp: 21,
    body: [opt("average build"), opt("stocky"), opt("weathered")],
    outfit: [
      opt("faded Nottingham red gambeson, kettle helm tied to the belt, leather gloves, boots", "common", { label: "Nottingham Gambeson" }),
      opt("padded tabard with torn-off sheriff's badge, open-faced iron cap, worn boots", "uncommon", { label: "Badgeless Tabard & Iron Cap" }),
      opt("crimson-and-gold Nottingham captain's brigandine with a torn sheriff's badge, leather gloves, riding boots", "legendary", { label: "Captain's Brigandine", creator: true }),
    ],
    gear: [opt("crossbow slung on the back", "common", { label: "Slung Crossbow" }), opt("rolled wanted poster tucked in the belt", "uncommon", { label: "Wanted Poster" })],
    sidearm: [opt("falchion sheathed at the hip", "common", { label: "Falchion" }), opt("billhook hanging at the hip", "uncommon", { label: "Billhook" })],
    animations: ["preset:biped:slash", "preset:biped:shoot"],
  },
  minstrel: {
    label: "Wandering Minstrel",
    role: "Bard / buffer",
    base: { might: 3, finesse: 7, cunning: 7, grit: 4 },
    hp: 17,
    body: [opt("slim"), opt("nimble"), opt("lanky")],
    outfit: [
      opt("parti-coloured doublet in green and gold, feathered cap, pointed shoes", "common", { label: "Parti-Coloured Doublet" }),
      opt("slashed-sleeve tunic, bright scarf, short cape, soft boots", "uncommon", { label: "Slashed-Sleeve Tunic" }),
      opt("gold-and-crimson royal minstrel's doublet with small bells on the sleeves, feathered cap, pointed shoes", "legendary", { label: "King's Own Minstrel", creator: true }),
    ],
    gear: [opt("wooden lute slung on the back", "common", { label: "Wooden Lute" })],
    sidearm: [opt("rapier-like slim sword at the hip", "common", { label: "Slim Sword" }), opt("purse of coins on the belt", "uncommon", { label: "Purse of Coins" })],
    animations: ["preset:biped:sing_01", "preset:biped:dance_01"],
  },
};

// `color` and `style` are only used by the 2D portrait (src/portrait.js).
const FACES = {
  age: [opt("young"), opt("young adult"), opt("seasoned"), opt("middle-aged"), opt("grizzled old", "uncommon")],
  hair: [
    opt("shaggy auburn hair", "common", { color: "#7a3a1a", style: "shaggy" }),
    opt("close-cropped black hair", "common", { color: "#1a1410", style: "cropped" }),
    opt("long braided blonde hair", "uncommon", { color: "#d8b060", style: "braids" }),
    opt("wild grey hair", "uncommon", { color: "#a3a19c", style: "wild" }),
    opt("tied-back chestnut hair", "common", { color: "#5a3218", style: "tied" }),
    opt("shaved head", "uncommon", { color: null, style: "shaved" }),
    opt("curly red hair", "rare", { color: "#a83a1a", style: "curly" }),
    opt("matted dark hair under the hood", "common", { color: "#2a1a10", style: "matted", label: "Matted dark hair" }),
    opt("raven-black hair with a single white streak", "rare", { color: "#121014", streak: "#e8e4dc", style: "cropped", creator: true }),
    opt("copper hair in warrior braids", "rare", { color: "#b5541e", style: "braids", creator: true }),
    opt("long silver-white hair woven with oak leaves", "legendary", { color: "#e2e2e8", style: "oakleaf", label: "Silver hair woven with oak leaves", creator: true }),
  ],
  facial: [
    opt("short beard", "common", { mark: "beard" }),
    opt("stubble", "common", { mark: "stubble" }),
    opt("clean-shaven", "common", { mark: "none" }),
    opt("thick moustache", "common", { mark: "moustache" }),
    opt("braided beard", "uncommon", { mark: "braidbeard" }),
    opt("freckles", "common", { mark: "freckles" }),
    opt("a scar across one cheek", "uncommon", { mark: "scar", label: "Cheek scar" }),
    opt("weathered skin", "common", { mark: "weathered" }),
    opt("a black leather eyepatch", "rare", { mark: "eyepatch", label: "Eyepatch", creator: true }),
    opt("swirling blue woad tattoos across the brow", "rare", { mark: "woad", label: "Woad tattoos", creator: true }),
    opt("eyes that glint faintly forest-green", "legendary", { mark: "feyeyes", label: "Fey-touched eyes", creator: true }),
  ],
  sex: ["man", "woman"],
};
// Facial hair options a woman can't roll (and can't pick in the creator).
const MALE_ONLY = /beard|moustache|stubble|shaven/;

const PALETTES = [
  opt("Lincoln green, brown leather and undyed linen", "common", { label: "Lincoln Green", colors: ["#3f6e2a", "#6a4a2c", "#d8cfb0"] }),
  opt("moss green, charcoal and rust", "uncommon", { label: "Moss & Rust", colors: ["#5a6b32", "#2e2e2c", "#9a4a24"] }),
  opt("forest green, ochre and dark walnut", "common", { label: "Forest & Ochre", colors: ["#2f5a2a", "#b08a3a", "#4a3020"] }),
  opt("faded red, iron grey and tan leather", "uncommon", { label: "Faded Red & Iron", colors: ["#8a3a30", "#6a6a70", "#a07850"] }),
  opt("russet, olive and bone white", "common", { label: "Russet & Bone", colors: ["#8a4a28", "#6a7a3a", "#e8e0cc"] }),
  opt("deep teal, black leather and brass", "rare", { label: "Teal & Brass", colors: ["#2a5a5a", "#1e1e1e", "#c09a40"] }),
  opt("ash grey, black and blood red", "rare", { label: "Ash & Blood", colors: ["#6e6e6a", "#8a1e1e", "#262626"], creator: true }),
  opt("autumn amber, oxblood and dark leather", "rare", { label: "Autumn Amber", colors: ["#c0802a", "#5a1a1a", "#3a2a1a"], creator: true }),
  opt("royal blue and gold of King Richard", "legendary", { label: "King Richard's Colours", colors: ["#1f3a7a", "#d4a52a", "#ece4cc"], creator: true }),
];

// Build mode only (random rolls keep their old prompts). The game and the portrait
// fall back to a seed-derived skin tone when a character has none.
const SKINS = [
  opt("fair skin", "common", { label: "Fair", color: "#f0c8a0" }),
  opt("ruddy skin", "common", { label: "Ruddy", color: "#d9a77c" }),
  opt("olive skin", "common", { label: "Olive", color: "#c08a60" }),
  opt("brown skin", "common", { label: "Brown", color: "#8a5a38" }),
  opt("deep brown skin", "common", { label: "Deep Brown", color: "#6a4028" }),
];

// Portrait backdrop only; never part of the Tripo prompt.
const BACKGROUNDS = [
  opt("Sherwood Glade", "common", { scene: "glade", colors: ["#2c4a22", "#7da04e"] }),
  opt("Misty Fen", "common", { scene: "fen", colors: ["#3a4a44", "#9aaaa0"] }),
  opt("Outlaw Camp", "uncommon", { scene: "camp", colors: ["#2a1e14", "#c0602a"] }),
  opt("Nottingham Walls", "uncommon", { scene: "walls", colors: ["#3a3632", "#8a8070"] }),
  opt("The Major Oak", "rare", { scene: "oak", colors: ["#1e3018", "#d8b860"] }),
  opt("Moonlit Clearing", "rare", { scene: "moon", colors: ["#101828", "#5a6a9a"] }),
  opt("Gallows Hill", "rare", { scene: "gallows", colors: ["#4a2a2a", "#c08a6a"] }),
  opt("The Golden Arrow Tourney", "legendary", { scene: "tourney", colors: ["#5a1a1a", "#e0b040"] }),
];

const NAMES = {
  first: {
    man: ["Will", "Alan", "Much", "Gilbert", "Hob", "Wat", "Osric", "Godric", "Tuck", "Arthur", "Simon", "Ralf", "Edwin", "Piers", "Jack"],
    woman: ["Marian", "Edith", "Maud", "Joan", "Agnes", "Isolde", "Alys", "Cecily", "Wynn", "Hild", "Rosamund", "Elspeth", "Mabel"],
  },
  epithet: [
    ["of Locksley", "legendary"], ["Scarlet", "rare"], ["the Miller's Son"], ["a-Dale", "rare"], ["Greenleaf"],
    ["the Fletcher"], ["of Barnsdale", "uncommon"], ["Two-Arrows", "uncommon"], ["the Unhanged", "rare"], ["Oakheart", "uncommon"],
    ["Crowfoot"], ["of Nottingham"], ["the Quiet"], ["Ashwood"], ["Longstride"],
  ].map(([text, tier]) => opt(text, tier, { label: text })),
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

// Relic names are keys into the game's RELIC_EFFECTS, so they can't be renamed.
const RELICS = [
  opt("Silver Arrow of the Tourney", "legendary"), opt("Marian's Ribbon", "rare"), opt("Sheriff's Signet (stolen)", "rare", { label: "Sheriff's Signet" }),
  opt("Pouch of King's Pennies"), opt("Hunting Horn of Sherwood", "uncommon"), opt("Tuck's Blessed Flask", "uncommon"),
  opt("Map of Nottingham Sewers", "uncommon"), opt("Oak Leaf Brooch"), opt("Broken Ransom Chain"), opt("Lucky Grey-Goose Fletching"),
];

// Every character gets these; archetypes add their 2 signature moves on top.
// Rig v1.0-20240301 biped preset names (see /en/docs/animations-retarget).
// Retarget accepts at most 5 animations per request (billed per clip), so hurt,
// defeat and victory are left to the game's procedural stand-ins (web/game/models.js).
export const CORE_ANIMATIONS = ["preset:biped:idle", "preset:biped:walk", "preset:biped:run"];
export const MAX_RETARGET_ANIMATIONS = 5;

// ---------- trait catalog (the creator's slots) ----------

const named = (list) => list.map((x) => ({ id: slug(x.name), label: x.name, tier: "common", ...x }));
const nameOpts = (list) => list.map((n) => ({ id: slug(n), label: n, text: n, tier: "common" }));

// Slots in creator order. `visual` slots make up a character's DNA: no two minted
// characters may share all of them. `scored` slots add tier points to its rarity.
export const SLOTS = [
  { id: "archetype", label: "Archetype", visual: true, options: () => Object.entries(ARCHETYPES).map(([id, a]) => ({ id, label: a.label, text: a.role, tier: "common" })) },
  { id: "sex", label: "Body", visual: true, options: () => [{ id: "man", label: "Man", tier: "common" }, { id: "woman", label: "Woman", tier: "common" }] },
  { id: "skin", label: "Skin", visual: true, options: () => SKINS },
  { id: "age", label: "Age", visual: true, scored: true, options: () => FACES.age },
  { id: "build", perArchetype: true, label: "Build", visual: true, options: (a) => ARCHETYPES[a].body },
  { id: "hair", label: "Hair", visual: true, scored: true, options: () => FACES.hair },
  { id: "face", label: "Face", visual: true, scored: true, options: (a, sex) => (sex === "woman" ? FACES.facial.filter((f) => !MALE_ONLY.test(f.text)) : FACES.facial) },
  { id: "outfit", perArchetype: true, label: "Outfit", visual: true, scored: true, options: (a) => ARCHETYPES[a].outfit },
  { id: "gear", perArchetype: true, label: "Gear", visual: true, scored: true, options: (a) => ARCHETYPES[a].gear },
  { id: "sidearm", perArchetype: true, label: "Sidearm", visual: true, scored: true, options: (a) => ARCHETYPES[a].sidearm },
  { id: "palette", label: "Colours", visual: true, scored: true, options: () => PALETTES },
  { id: "background", label: "Background", visual: true, scored: true, options: () => BACKGROUNDS },
  { id: "first", label: "Name", options: (a, sex) => nameOpts(NAMES.first[sex] ?? NAMES.first.man) },
  { id: "epithet", label: "Epithet", scored: true, options: () => NAMES.epithet },
  { id: "relic", label: "Relic", scored: true, options: () => RELICS },
  { id: "perk", label: "Perk", options: () => named(PERKS) },
  { id: "perk2", label: "Second perk", legendaryOnly: true, options: () => named(PERKS) },
  { id: "flaw", label: "Flaw", options: () => named(FLAWS) },
];
const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// Options for every slot, given the archetype and sex they depend on.
export function traitCatalog(archetype = Object.keys(ARCHETYPES)[0], sex = "man") {
  return SLOTS.map((s) => ({ ...s, options: s.options(archetype, sex) }));
}

export const optionCap = (o) => o.cap ?? COLLECTION.caps[o.tier] ?? null;

// Mint counts are kept per option; archetype-specific options are counted per archetype.
export const supplyKey = (slotId, archetype, id) => (SLOT[slotId]?.perArchetype ? `${slotId}:${archetype}:${id}` : `${slotId}:${id}`);

// Capped options a build-mode character uses that have no supply left, given mint counts by supplyKey.
export function soldOutTraits(character, counts) {
  const out = [];
  for (const s of SLOTS) {
    const o = traitOption(character, s.id);
    const cap = o && optionCap(o);
    if (cap == null) continue;
    const used = counts[supplyKey(s.id, character.archetype, o.id)] ?? 0;
    if (used >= cap) out.push({ slot: s.id, slotLabel: s.label, id: o.id, label: o.label, cap });
  }
  return out;
}

export function rarityFromScore(score) {
  return RARITY_THRESHOLDS.find(([, min]) => score >= min)[0];
}

// ---------- forge ----------

export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

export class TraitError extends Error {
  constructor(errors) {
    super(errors.join(" "));
    this.errors = errors;
  }
}

// Random roll from a seed (the original mode, used by the game's strangers and the CLI),
// or build mode when `traits` is given: { archetype, sex, skin, ..., perk, perk2?, flaw } as option ids.
export function forgeCharacter({ seed = randomSeed(), archetype, rarity, style = "stylized", sex, traits } = {}) {
  if (traits) return buildCharacter(traits, style);
  const rng = makeRng(seed);

  // The order of rng draws below is what keeps old seeds reproducible. Don't reorder.
  const archId = archetype && ARCHETYPES[archetype] ? archetype : rng.pick(Object.keys(ARCHETYPES));
  const arch = ARCHETYPES[archId];
  const rar = RARITIES.find((r) => r.id === rarity) ?? rng.weighted(RARITIES);
  const who = sex && FACES.sex.includes(sex) ? sex : rng.pick(FACES.sex);
  // Pinned options skip their rng draw, so a re-forge must pin exactly the same ones.
  const pins = {};
  if (archId === archetype) pins.archetype = archId;
  if (rar.id === rarity) pins.rarity = rar.id;
  if (who === sex) pins.sex = who;

  const chosen = {
    archetype: archId,
    sex: who,
    age: rng.pick(rollable(FACES.age)),
    build: rng.pick(rollable(arch.body)),
    hair: rng.pick(rollable(FACES.hair)),
    face: rng.pick(rollable(FACES.facial).filter((f) => who === "man" || !MALE_ONLY.test(f.text))),
    outfit: rng.pick(rollable(arch.outfit)),
    gear: rng.pick(rollable(arch.gear)),
    sidearm: rng.pick(rollable(arch.sidearm)),
    palette: rng.pick(rollable(PALETTES)),
  };
  const stats = rollStats(rng, arch, rar);
  const first = rng.pick(NAMES.first[who]);
  const epithet = rng.pick(NAMES.epithet);
  const perks = rng.pickN(PERKS, rar.id === "legendary" ? 2 : 1);
  const flaw = rng.pick(FLAWS);
  const relic = rng.pick(RELICS);
  return finish({ rng, seed: String(seed), style, arch, rar, chosen, stats, first, epithet, perks, flaw, relic, mode: "roll", pins });
}

function rollStats(rng, arch, rar) {
  const stats = {};
  for (const [k, v] of Object.entries(arch.base)) {
    stats[k] = Math.max(1, v + rng.int(-1, 2) + Math.floor(rar.statBonus / 2) + (rng.float() < rar.statBonus / 10 ? 1 : 0));
  }
  return stats;
}

// Checks every trait against the catalog. Returns the option objects, or throws a TraitError.
export function resolveTraits(traits) {
  const errors = [];
  const t = traits ?? {};
  const archetype = ARCHETYPES[t.archetype] ? t.archetype : null;
  if (!archetype) errors.push("Pick an archetype.");
  const sex = FACES.sex.includes(t.sex) ? t.sex : null;
  if (!sex) errors.push("Pick a body.");
  if (errors.length) throw new TraitError(errors);

  const chosen = { archetype, sex };
  const missing = [];
  for (const s of SLOTS) {
    if (s.id === "archetype" || s.id === "sex" || s.id === "perk2") continue;
    const o = s.options(archetype, sex).find((x) => x.id === t[s.id]);
    if (o) chosen[s.id] = o;
    else if (t[s.id]) errors.push(`"${t[s.id]}" isn't a valid ${s.label.toLowerCase()} for this character.`);
    else missing.push(s.label);
  }
  if (missing.length) errors.push(`Still to pick: ${missing.join(", ")}.`);
  if (errors.length) throw new TraitError(errors);

  const score = SLOTS.filter((s) => s.scored).reduce((n, s) => n + TIERS[chosen[s.id].tier].points, 0);
  const rarity = rarityFromScore(score);
  if (t.perk2) {
    const p2 = SLOT.perk2.options().find((x) => x.id === t.perk2);
    if (rarity !== "legendary") errors.push("A second perk is only for Legendary characters.");
    else if (!p2) errors.push(`"${t.perk2}" isn't a valid perk.`);
    else if (p2.id === chosen.perk.id) errors.push("Pick two different perks.");
    else chosen.perk2 = p2;
  }
  if (errors.length) throw new TraitError(errors);
  return { chosen, score, rarity };
}

// The visual traits, in a fixed order: two characters with the same key look the same.
export function visualKey(traits) {
  return SLOTS.filter((s) => s.visual).map((s) => `${s.id}=${traits[s.id] ?? ""}`).join("|");
}

// Short stable id for a look. Also the build-mode seed, so the Tripo mesh and the
// stat rolls are fixed per look and can't be rerolled.
export function traitDna(traits) {
  const key = visualKey(traits);
  return hashSeed(key).toString(16).padStart(8, "0") + hashSeed(key + "#dna").toString(16).padStart(8, "0");
}

function buildCharacter(traits, style) {
  const { chosen, score, rarity } = resolveTraits(traits);
  const ids = Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, typeof v === "string" ? v : v.id]));
  const dna = traitDna(ids);
  const rng = makeRng("dna-" + dna);
  const arch = ARCHETYPES[chosen.archetype];
  const rar = RARITIES.find((r) => r.id === rarity);
  const stats = rollStats(rng, arch, rar);
  const perks = [chosen.perk, chosen.perk2].filter(Boolean).map(({ name, text }) => ({ name, text }));
  const { name, text } = chosen.flaw;
  const c = finish({
    rng, seed: "dna-" + dna, style, arch, rar, chosen, stats,
    first: chosen.first.text, epithet: chosen.epithet, perks, flaw: { name, text }, relic: chosen.relic, mode: "build",
  });
  c.dna = dna;
  c.rarityScore = score;
  return c;
}

function finish({ rng, seed, style, arch, rar, chosen, stats, first, epithet, perks, flaw, relic, mode, pins }) {
  stats ??= rollStats(rng, arch, rar);
  const look = {
    sex: chosen.sex,
    age: chosen.age.text,
    build: chosen.build.text,
    hair: chosen.hair.text,
    face: chosen.face.text,
    outfit: chosen.outfit.text,
    gear: chosen.gear.text,
    sidearm: chosen.sidearm.text,
    palette: chosen.palette.text,
  };
  if (chosen.skin) look.skin = chosen.skin.text;
  if (chosen.background) look.background = chosen.background.label;

  const traits = {};
  for (const s of SLOTS) {
    const v = chosen[s.id];
    if (v) traits[s.id] = typeof v === "string" ? v : v.id;
  }
  if (mode === "roll") {
    traits.first = slug(first);
    traits.epithet = epithet.id;
    traits.relic = relic.id;
    traits.perk = slug(perks[0].name);
    if (perks[1]) traits.perk2 = slug(perks[1].name);
    traits.flaw = slug(flaw.name);
  }

  const character = {
    seed,
    mode,
    name: `${first} ${epithet.text}`,
    archetype: chosen.archetype,
    archetypeLabel: arch.label,
    role: arch.role,
    rarity: rar.id,
    rarityLabel: rar.label,
    style,
    look,
    traits,
    stats,
    hp: arch.hp + stats.grit + rar.statBonus,
    gold: rng.int(5, 25) + rar.statBonus * 5,
    perks,
    flaw,
    relic: relic.text,
    animations: [...CORE_ANIMATIONS, ...arch.animations],
  };
  if (pins) character.pins = pins;
  character.prompt = buildPrompt(character, rar);
  character.negativePrompt = NEGATIVE_PROMPT;
  return character;
}

// Rebuilds a character sheet from what identifies it, so a client-supplied sheet can't be tampered with.
export function reforge(c) {
  if (c?.mode === "build") return forgeCharacter({ traits: c.traits, style: c.style });
  if (c?.pins) return forgeCharacter({ seed: c.seed, style: c.style, ...c.pins });
  // Sheets saved before `pins` existed: best effort, as before.
  return forgeCharacter({ seed: c.seed, archetype: c.archetype, rarity: c.rarity, style: c.style, sex: c.look?.sex });
}

// Kept under Tripo's 255-char negative prompt limit.
export const NEGATIVE_PROMPT =
  "multiple characters, pedestal, base, ground, weapon in hands, holding objects, cropped, missing limbs, fused fingers, sitting, modern clothing, sci-fi, blurry, low quality, broken mesh";

function buildPrompt(c, rar) {
  const l = c.look;
  const prompt = [
    `Full body ${STYLES[c.style] ?? STYLES.stylized}.`,
    `A ${l.age} ${l.build} ${l.sex}, a medieval Sherwood Forest ${c.archetypeLabel.toLowerCase()} from the Robin Hood legend,`,
    `${l.hair}, ${l.skin ? `${l.skin}, ` : ""}${l.face}.`,
    `Wearing ${l.outfit}, colour palette of ${l.palette}, ${rar.flair}.`,
    `Equipment: ${l.gear}, ${l.sidearm}.`,
    "Standing in a neutral A-pose, arms held away from the body, legs slightly apart, empty open hands, facing forward,",
    "symmetrical, single character, clean separated limbs for rigging, plain background.",
  ].join(" ");
  return prompt.slice(0, 1024);
}

export function slugify(c) {
  // A build's mesh depends only on its look (the seed), style and rarity (both in the prompt),
  // never its name. Keying the folder on those reuses a paid forge and never mixes up two styles.
  if (c.mode === "build") return slug(`${c.archetype}-${c.seed}-${c.style}-${c.rarity}`);
  return `${c.name}-${c.seed}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------- NFT metadata (ERC-721 / OpenSea metadata standard) ----------

// Option object for a trait id, for labels and portrait colours.
export function traitOption(character, slotId) {
  const s = SLOT[slotId];
  const id = character.traits?.[slotId];
  if (!s || id == null) return null;
  return s.options(character.archetype, character.look.sex).find((o) => o.id === id) ?? null;
}

export function tokenMetadata(c, { tokenId, image, animationUrl, externalUrl } = {}) {
  const attributes = [];
  for (const s of SLOTS) {
    if (s.id === "first" || s.id === "perk2") continue;
    const o = traitOption(c, s.id);
    if (o) attributes.push({ trait_type: s.label, value: o.label });
  }
  if (c.perks[1]) attributes.push({ trait_type: "Second perk", value: c.perks[1].name });
  attributes.push({ trait_type: "Rarity", value: c.rarityLabel });
  if (c.rarityScore != null) attributes.push({ display_type: "number", trait_type: "Rarity Score", value: c.rarityScore });
  attributes.push({ display_type: "number", trait_type: "HP", value: c.hp });
  for (const [k, v] of Object.entries(c.stats)) attributes.push({ display_type: "number", trait_type: capital(k), value: v, max_value: 20 });

  const meta = {
    name: tokenId != null ? `${c.name} #${tokenId}` : c.name,
    description:
      `${c.rarityLabel} ${c.archetypeLabel} (${c.role}) of ${COLLECTION.name}. ` +
      `${c.perks.map((p) => `${p.name}: ${p.text}`).join(" ")} Flaw, ${c.flaw.name}: ${c.flaw.text} Carries the ${c.relic}.`,
    attributes,
    properties: { seed: c.seed, dna: c.dna ?? null, style: c.style, archetype: c.archetype, traits: c.traits },
  };
  if (image) meta.image = image;
  if (animationUrl) meta.animation_url = animationUrl;
  if (externalUrl) meta.external_url = externalUrl;
  return meta;
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
