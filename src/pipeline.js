// Character pipeline: text-to-model (PBR textured) -> rig-check -> auto-rig
// -> animation retarget -> (optional) FBX export. Each finished step is
// recorded in state.json so a failed run can resume without re-spending credits.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify, PIPELINE_DEFAULTS, generatePayload, rigPayload, retargetPayload, rigCheckError } from "./forge.js";

export const STEPS = ["generate", "rigcheck", "rig", "animate", "fbx"];

export const DEFAULT_OPTIONS = PIPELINE_DEFAULTS;

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
    const gen = await step("generate", "/generation/text-to-model", generatePayload(character, opts), "base", "glb");

    const check = await step("rigcheck", "/animations/rig-check", { input: gen.taskId });
    const rigError = rigCheckError(check.output);
    if (rigError) {
      // Don't keep a failed check cached: a reroll should check again.
      delete state.steps.rigcheck;
      await save();
      throw new Error(rigError);
    }

    const rig = await step("rig", "/animations/rig", rigPayload(gen.taskId), "rigged", "glb");

    await step("animate", "/animations/retarget", retargetPayload(character, rig.taskId, "glb", opts), "animated", "glb");
    if (opts.fbx) await step("fbx", "/animations/retarget", retargetPayload(character, rig.taskId, "fbx", opts), "animated", "fbx");

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

