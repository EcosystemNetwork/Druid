#!/usr/bin/env node
// Usage:
//   node src/cli.js roll   [--seed x] [--archetype id] [--rarity id] [--style id] [--sex man|woman] [--count n]
//   node src/cli.js forge  [same flags] [--fbx] [--texture detailed] [--geometry standard] [--faces 40000] [--dry-run]
//   node src/cli.js resume <output/dir> [--dry-run]
//   node src/cli.js balance

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ARCHETYPES, RARITIES, STYLES, forgeCharacter } from "./forge.js";
import { runPipeline } from "./pipeline.js";
import { TripoClient } from "./tripo.js";
import { loadEnv } from "./env.js";

loadEnv();

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: "string" },
    archetype: { type: "string" },
    rarity: { type: "string" },
    style: { type: "string", default: "stylized" },
    sex: { type: "string" },
    count: { type: "string", default: "1" },
    fbx: { type: "boolean", default: false },
    texture: { type: "string", default: "detailed" },
    geometry: { type: "string", default: "standard" },
    faces: { type: "string", default: "40000" },
    "root-motion": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

const [cmd = "roll", target] = positionals;
const dryRun = args["dry-run"] || process.env.TRIPO_DRY_RUN === "1";

function printCard(c) {
  const s = c.stats;
  console.log(`\n  ${c.name}  ·  ${c.rarityLabel} ${c.archetypeLabel} (${c.role})  ·  seed ${c.seed}`);
  console.log(`  HP ${c.hp}  MIGHT ${s.might}  FINESSE ${s.finesse}  CUNNING ${s.cunning}  GRIT ${s.grit}  GOLD ${c.gold}`);
  console.log(`  Perk: ${c.perks.map((p) => `${p.name}: ${p.text}`).join(" | ")}`);
  console.log(`  Flaw: ${c.flaw.name}: ${c.flaw.text}`);
  console.log(`  Relic: ${c.relic}`);
  console.log(`  Animations: ${c.animations.map((a) => a.split(":").pop()).join(", ")}`);
  console.log(`\n  Prompt: ${c.prompt}\n`);
}

function validate() {
  const bad = (flag, val, list) => {
    if (val && !list.includes(val)) {
      console.error(`Unknown --${flag} "${val}". Options: ${list.join(", ")}`);
      process.exit(1);
    }
  };
  bad("archetype", args.archetype, Object.keys(ARCHETYPES));
  bad("rarity", args.rarity, RARITIES.map((r) => r.id));
  bad("style", args.style, Object.keys(STYLES));
  bad("sex", args.sex, ["man", "woman"]);
}

function logEvent(e) {
  if (e.step === "done") return console.log(`\n✔ Done. Credits used: ${e.totalCredits}. Files in ${e.dir}`);
  if (e.step === "error") return console.error(`\n✘ ${e.message}${e.suggestion ? `\n  ${e.suggestion}` : ""}`);
  if (e.status === "running") {
    process.stdout.write(`\r  ${e.step.padEnd(9)} ${String(e.progress ?? 0).padStart(3)}% ${e.taskStatus ?? ""}      `);
  } else {
    const files = e.files ? Object.values(e.files).join(", ") : e.message ?? "";
    console.log(`\r  ${e.step.padEnd(9)} ${e.status.padEnd(8)} ${files}`.padEnd(70));
  }
}

const pipelineOptions = () => ({
  textureQuality: args.texture,
  geometryQuality: args.geometry,
  faceLimit: Number(args.faces),
  fbx: args.fbx,
  inPlace: !args["root-motion"],
});

async function main() {
  if (args.help) {
    console.log(await readFile(new URL(import.meta.url), "utf8").then((t) => t.split("\n").slice(1, 6).join("\n")));
    console.log(`\nArchetypes: ${Object.keys(ARCHETYPES).join(", ")}\nRarities: ${RARITIES.map((r) => r.id).join(", ")}\nStyles: ${Object.keys(STYLES).join(", ")}`);
    return;
  }
  validate();
  const rollOpts = { seed: args.seed, archetype: args.archetype, rarity: args.rarity, style: args.style, sex: args.sex };

  if (cmd === "roll") {
    for (let i = 0; i < Number(args.count); i++) printCard(forgeCharacter(i === 0 ? rollOpts : { ...rollOpts, seed: undefined }));
    return;
  }

  const client = new TripoClient({ apiKey: process.env.TRIPO_API_KEY, dryRun, log: (m) => console.log(`\n  ${m}`) });

  if (cmd === "balance") {
    console.log(await client.balance());
    return;
  }

  if (cmd === "forge") {
    const character = forgeCharacter(rollOpts);
    printCard(character);
    if (dryRun) console.log("  (dry run: no credits will be spent)\n");
    await runPipeline({ client, character, options: pipelineOptions(), onEvent: logEvent });
    return;
  }

  if (cmd === "resume") {
    if (!target) throw new Error("Usage: resume <output/dir>");
    const state = JSON.parse(await readFile(path.join(target, "state.json"), "utf8"));
    printCard(state.character);
    await runPipeline({ client, character: state.character, outDir: target, options: state.options, onEvent: logEvent });
    return;
  }

  throw new Error(`Unknown command "${cmd}". Try --help.`);
}

main().catch((err) => {
  if (!err.reported) console.error(`\n✘ ${err.message}`);
  process.exit(1);
});
