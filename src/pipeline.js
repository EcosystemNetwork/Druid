// Character pipeline: text-to-model (PBR textured) -> rig-check -> auto-rig
// -> animation retarget -> (optional) FBX export. Each finished step is
// recorded in state.json so a failed run can resume without re-spending credits.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./forge.js";

export const STEPS = ["generate", "rigcheck", "rig", "animate", "fbx"];

export const DEFAULT_OPTIONS = {
  model: "v3.1-20260211",
  textureQuality: "detailed", // fast | standard | detailed | extreme
  geometryQuality: "standard", // standard | detailed (Ultra)
  faceLimit: 40000, // game-ready humanoid
  fbx: false,
  inPlace: true, // root motion off; game controllers move the character
};

const extFromUrl = (url, fallback) => {
  const m = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : fallback;
};

export async function runPipeline({ client, character, outDir, options = {}, onEvent = () => {} }) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  // Dry runs get their own folder so fake task ids never leak into a real resume.
  const dir = outDir ?? path.join("output", client.dryRun ? "_dryrun" : "", slugify(character));
  await mkdir(dir, { recursive: true });

  const statePath = path.join(dir, "state.json");
  const state = await readFile(statePath, "utf8").then(JSON.parse).catch(() => ({ steps: {} }));
  delete state.error;
  state.character = character;
  state.options = opts;
  const save = () => writeFile(statePath, JSON.stringify(state, null, 2));
  await writeFile(path.join(dir, "character.json"), JSON.stringify(character, null, 2));
  await save();

  const emit = (step, status, extra = {}) => onEvent({ step, status, dir, ...extra });

  // Runs one Tripo task unless state.json says it already succeeded.
  async function step(name, route, payload, filePrefix, modelExt) {
    if (state.steps[name]?.status === "success") {
      emit(name, "skipped", { message: "already done (resumed)" });
      return state.steps[name];
    }
    emit(name, "running", { progress: 0 });
    const { taskId, task } = await client.run(route, payload, {
      onProgress: (status, progress) => emit(name, "running", { progress, taskStatus: status }),
    });

    const files = {};
    if (filePrefix) {
      for (const [key, url] of Object.entries(task.output ?? {})) {
        if (!key.endsWith("_url") || typeof url !== "string") continue;
        const kind = key.replace(/_url$/, "");
        // The model's format is known from the request; don't trust the CDN URL for it.
        const ext = kind === "model" && modelExt ? modelExt : extFromUrl(url, "bin");
        const file = `${filePrefix}${kind === "model" ? "" : `-${kind}`}.${ext}`;
        await client.download(url, path.join(dir, file));
        files[kind] = file;
      }
    }

    state.steps[name] = { status: "success", taskId, output: task.output, files, credits: task.credits_consumed ?? 0 };
    await save();
    emit(name, "success", { files, credits: task.credits_consumed ?? 0 });
    return state.steps[name];
  }

  try {
    const gen = await step(
      "generate",
      "/generation/text-to-model",
      {
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
      },
      "base",
      "glb",
    );

    const check = await step("rigcheck", "/animations/rig-check", { input: gen.taskId });
    const { riggable, rig_type: rigType } = check.output ?? {};
    if (!riggable || rigType !== "biped") {
      // Don't keep a failed check cached: a reroll should check again.
      delete state.steps.rigcheck;
      await save();
      throw new Error(
        `Model is not riggable as a humanoid (riggable=${riggable}, rig_type=${rigType}). ` +
          "Reroll with a new seed: usually a prop fused to the hands or a cloak merging the legs.",
      );
    }

    const rig = await step(
      "rig",
      "/animations/rig",
      // v1.0 is the biped rig that unlocks the 90+ preset library;
      // mixamo naming maps straight onto Unity/Unreal humanoid avatars.
      { input: gen.taskId, model: "v1.0-20240301", rig_type: "biped", spec: "mixamo", out_format: "glb" },
      "rigged",
      "glb",
    );

    const retarget = (format) => ({
      input: rig.taskId,
      animations: character.animations,
      out_format: format,
      bake_animation: true,
      export_with_geometry: true,
      animate_in_place: opts.inPlace,
    });

    await step("animate", "/animations/retarget", retarget("glb"), "animated", "glb");
    if (opts.fbx) await step("fbx", "/animations/retarget", retarget("fbx"), "animated", "fbx");

    state.complete = true;
    state.totalCredits = Object.values(state.steps).reduce((s, x) => s + (x.credits ?? 0), 0);
    await save();
    emit("done", "success", { totalCredits: state.totalCredits });
    return { dir, state };
  } catch (err) {
    state.error = err.message;
    await save();
    emit("error", "failed", { message: err.message, suggestion: err.suggestion });
    err.reported = true;
    throw err;
  }
}

function numericSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483647;
}
