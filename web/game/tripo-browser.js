// In-browser version of src/pipeline.js: the same Tripo steps (generate -> rig-check ->
// rig -> animate), sent through this site's /api/tripo proxy with the user's own key.
// Finished task ids are kept in localStorage so a failed run resumes without re-spending credits.

import { PIPELINE_DEFAULTS, generatePayload, rigPayload, retargetPayload, rigCheckError } from "/lib/forge.js";
import { saveHero } from "./heroes.js";

const TERMINAL_FAIL = new Set(["failed", "cancelled", "banned", "expired"]);
const RETRYABLE_CODES = new Set([1007, 2000]); // rate limit, concurrency full
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TripoError extends Error {
  constructor(message, { code, suggestion } = {}) {
    super(message);
    this.code = code;
    this.suggestion = suggestion;
  }
}

export async function tripo(key, method, route, body, { retries = 5, log = () => {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`/api/tripo${route}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json;
    try {
      json = await res.json();
    } catch {
      json = { code: -1, message: res.status === 404 ? "The Tripo proxy isn't available on this host" : `Non-JSON response (HTTP ${res.status})` };
    }
    if (json.code === 0) return json.data;
    const retryable = res.status === 429 || res.status >= 500 || RETRYABLE_CODES.has(json.code);
    if (retryable && attempt < retries) {
      const resetAt = Number(res.headers.get("x-ratelimit-reset"));
      const waitMs = resetAt ? Math.max(1000, resetAt * 1000 - Date.now()) : Math.min(30000, 1000 * 2 ** attempt);
      log(`Tripo busy (${json.code ?? res.status}), retrying in ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
      continue;
    }
    throw new TripoError(`Tripo: ${json.message ?? "request failed"}`, { code: json.code, suggestion: json.suggestion });
  }
}

export const getBalance = (key) => tripo(key, "GET", "/account/balance");

async function waitForTask(key, taskId, onProgress) {
  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    const task = await tripo(key, "GET", `/tasks/${taskId}`);
    onProgress(task.progress ?? 0);
    if (task.status === "success") return task;
    if (TERMINAL_FAIL.has(task.status)) {
      const hint = task.status === "banned" ? " (content policy: reroll the hero)" : "";
      throw new TripoError(`Task ended with status "${task.status}"${hint}`);
    }
    await sleep(2500);
  }
  throw new TripoError("Task timed out after 15 minutes. Resume to keep waiting on it.");
}

// Tripo's CDN may or may not send CORS headers; try directly, then through the proxy.
async function fetchFile(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch {}
  const res = await fetch(`/api/tripo-file?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new TripoError(`Couldn't download the model (HTTP ${res.status})`);
  return res.blob();
}

const stateKey = (seed) => `sherwood.forge.${seed}`;
export function savedProgress(seed) {
  try {
    return JSON.parse(localStorage.getItem(stateKey(seed)) ?? "null");
  } catch {
    return null;
  }
}

export const STEP_LABELS = { generate: "Mesh + PBR", rigcheck: "Rig check", rig: "Auto-rig", animate: "Animate", download: "Download" };

export async function forgeInBrowser({ key, character, options = {}, onEvent = () => {} }) {
  const opts = { ...PIPELINE_DEFAULTS, ...options, fbx: false };
  let state = savedProgress(character.seed);
  // Only resume a run for the same prompt; otherwise the cached task ids describe another model.
  if (!state || state.prompt !== character.prompt) state = { prompt: character.prompt, steps: {} };
  const save = () => {
    try {
      localStorage.setItem(stateKey(character.seed), JSON.stringify(state));
    } catch {}
  };
  const log = (message) => onEvent({ step: "log", status: "info", message });

  async function step(name, route, payload) {
    if (state.steps[name]) {
      onEvent({ step: name, status: "skipped" });
      return state.steps[name];
    }
    onEvent({ step: name, status: "running", progress: 0 });
    const taskId = (await tripo(key, "POST", route, payload, { log })).task_id;
    const task = await waitForTask(key, taskId, (progress) => onEvent({ step: name, status: "running", progress }));
    state.steps[name] = { taskId, output: task.output, credits: task.credits_consumed ?? 0 };
    save();
    onEvent({ step: name, status: "success" });
    return state.steps[name];
  }

  const gen = await step("generate", "/generation/text-to-model", generatePayload(character, opts));
  const check = await step("rigcheck", "/animations/rig-check", { input: gen.taskId });
  const rigError = rigCheckError(check.output);
  if (rigError) {
    delete state.steps.rigcheck;
    save();
    throw new TripoError(rigError);
  }
  const rig = await step("rig", "/animations/rig", rigPayload(gen.taskId));
  const anim = await step("animate", "/animations/retarget", retargetPayload(character, rig.taskId, "glb", opts));

  onEvent({ step: "download", status: "running", progress: 30 });
  const modelUrl = anim.output?.model_url ?? Object.entries(anim.output ?? {}).find(([k, v]) => k.endsWith("_url") && /\.glb/i.test(v))?.[1];
  if (!modelUrl) throw new TripoError("Tripo returned no animated model");
  const glb = await fetchFile(modelUrl);
  let thumb = null;
  if (gen.output?.rendered_image_url) thumb = await fetchFile(gen.output.rendered_image_url).catch(() => null);
  onEvent({ step: "download", status: "success" });

  const credits = Object.values(state.steps).reduce((s, x) => s + (x.credits ?? 0), 0);
  const hero = { seed: character.seed, character, glb, thumb, credits, created: Date.now() };
  await saveHero(hero);
  try {
    localStorage.removeItem(stateKey(character.seed));
  } catch {}
  onEvent({ step: "done", status: "success", credits });
  return hero;
}
