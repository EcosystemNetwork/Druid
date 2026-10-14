// Minimal Tripo v3 API client: create task -> poll -> download.
// Docs: https://developers.tripo3d.ai/en/docs/introduction

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://openapi.tripo3d.ai/v3";
const TERMINAL_FAIL = new Set(["failed", "cancelled", "banned", "expired"]);
// 1007 = request rate limit, 2000 = category concurrency full. Both are retryable.
const RETRYABLE_CODES = new Set([1007, 2000]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TripoError extends Error {
  constructor(message, { code, status, suggestion, requestId } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.suggestion = suggestion;
    this.requestId = requestId;
  }
}

export class TripoClient {
  constructor({ apiKey, dryRun = false, log = () => {} } = {}) {
    if (!apiKey && !dryRun) {
      throw new TripoError("TRIPO_API_KEY is not set. Copy .env.example to .env and add your key.");
    }
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.log = log;
    this.fakeSeq = 0;
  }

  async request(method, route, body, { retries = 5 } = {}) {
    if (this.dryRun) return this.fakeRequest(method, route, body);

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE_URL}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let json;
      try {
        json = await res.json();
      } catch {
        json = { code: -1, message: `Non-JSON response (HTTP ${res.status})` };
      }

      if (json.code === 0) return json.data;

      const retryable = res.status === 429 || res.status >= 500 || RETRYABLE_CODES.has(json.code);
      if (retryable && attempt < retries) {
        const resetAt = Number(res.headers.get("x-ratelimit-reset"));
        const waitMs = resetAt
          ? Math.max(1000, resetAt * 1000 - Date.now())
          : Math.min(30000, 1000 * 2 ** attempt);
        this.log(`Tripo ${json.code ?? res.status}: ${json.message}. Retrying in ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }

      throw new TripoError(`Tripo API error ${json.code}: ${json.message}`, {
        code: json.code,
        status: res.status,
        suggestion: json.suggestion,
        requestId: json.request_id,
      });
    }
  }

  createTask(route, payload) {
    return this.request("POST", route, payload).then((d) => d.task_id);
  }

  getTask(taskId) {
    return this.request("GET", `/tasks/${taskId}`);
  }

  balance() {
    return this.request("GET", "/account/balance");
  }

  async waitForTask(taskId, { onProgress = () => {}, interval = 2000, timeout = 15 * 60 * 1000 } = {}) {
    const start = Date.now();
    let lastProgress = -1;
    while (Date.now() - start < timeout) {
      const task = await this.getTask(taskId);
      if (task.progress !== lastProgress) {
        lastProgress = task.progress ?? 0;
        onProgress(task.status, lastProgress);
      }
      if (task.status === "success") return task;
      if (TERMINAL_FAIL.has(task.status)) {
        const hint = task.status === "banned" ? " (content policy: adjust the prompt)" : "";
        throw new TripoError(`Task ${taskId} ended with status "${task.status}"${hint}`);
      }
      await sleep(interval);
    }
    throw new TripoError(`Task ${taskId} timed out after ${Math.round(timeout / 60000)} min`);
  }

  async run(route, payload, opts) {
    const taskId = await this.createTask(route, payload);
    const task = await this.waitForTask(taskId, opts);
    return { taskId, task };
  }

  async download(url, dest) {
    // Dry runs reuse one copy of the sample model instead of refetching it per step.
    let bytes = this.dryRun ? this.sampleBytes : null;
    if (!bytes) {
      const res = await fetch(url);
      if (!res.ok) throw new TripoError(`Download failed (HTTP ${res.status}): ${url}`);
      bytes = Buffer.from(await res.arrayBuffer());
      if (this.dryRun) this.sampleBytes = bytes;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    return dest;
  }

  // Dry run: no network, no credits. Returns plausible responses so the
  // whole pipeline and UI can be exercised end to end.
  fakeRequest(method, route, body) {
    if (method === "POST") {
      this.log(`[dry-run] POST ${route} ${JSON.stringify(body)}`);
      const id = `task_dry_${++this.fakeSeq}_${route.split("/").pop()}`;
      return Promise.resolve({ task_id: id });
    }
    if (route === "/account/balance") return Promise.resolve({ balance: 0, frozen: 0 });
    const id = route.split("/").pop();
    const sample = "https://threejs.org/examples/models/gltf/Soldier.glb";
    const output = id.endsWith("rig-check")
      ? { riggable: true, rig_type: "biped" }
      : { model_url: sample };
    return Promise.resolve({ task_id: id, status: "success", progress: 100, output, credits_consumed: 0 });
  }
}
