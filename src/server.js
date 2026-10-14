// Local web UI: roll characters, launch Tripo jobs, preview animated GLBs.
//   node src/server.js            -> http://localhost:5173

import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ARCHETYPES, RARITIES, STYLES, forgeCharacter } from "./forge.js";
import { DEFAULT_OPTIONS, runPipeline } from "./pipeline.js";
import { TripoClient } from "./tripo.js";
import { loadEnv } from "./env.js";
import { apiTarget, fileTarget, validAuth } from "./tripo-proxy.js";

loadEnv();

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");
const WEB = path.join(ROOT, "web");
const ENV_DRY_RUN = process.env.TRIPO_DRY_RUN === "1" || !process.env.TRIPO_API_KEY;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".fbx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const jobs = new Map(); // jobId -> { id, character, events, status, dir }

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e5) throw new Error("Body too large");
  }
  return data ? JSON.parse(data) : {};
}

async function serveFile(res, baseDir, rel) {
  const file = path.resolve(baseDir, "." + path.posix.normalize("/" + rel));
  if (!file.startsWith(baseDir + path.sep) && file !== baseDir) return send(res, 403, { error: "forbidden" });
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error();
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Content-Length": s.size });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

async function listCharacters() {
  const out = [];
  for (const sub of ["", "_dryrun"]) {
    const base = path.join(OUTPUT, sub);
    const dirs = await readdir(base, { withFileTypes: true }).catch(() => []);
    for (const d of dirs) {
      if (!d.isDirectory() || d.name === "_dryrun") continue;
      const rel = path.posix.join(sub, d.name);
      try {
        const state = JSON.parse(await readFile(path.join(base, d.name, "state.json"), "utf8"));
        out.push({
          dir: rel,
          dryRun: sub === "_dryrun",
          complete: !!state.complete,
          error: state.error ?? null,
          character: state.character,
          files: Object.fromEntries(Object.entries(state.steps).map(([k, v]) => [k, v.files ?? {}])),
          mtime: (await stat(path.join(base, d.name, "state.json"))).mtimeMs,
        });
      } catch {
        /* not a character folder */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function startJob({ character, options, dryRun }) {
  const job = { id: randomUUID(), character, events: [], status: "running", dir: null };
  jobs.set(job.id, job);
  const client = new TripoClient({
    apiKey: process.env.TRIPO_API_KEY,
    dryRun,
    log: (message) => job.events.push({ step: "log", status: "info", message, t: Date.now() }),
  });
  runPipeline({
    client,
    character,
    options,
    onEvent: (e) => {
      job.dir = path.relative(OUTPUT, path.resolve(e.dir)).split(path.sep).join("/");
      // Collapse progress ticks so the event list stays small.
      const last = job.events.at(-1);
      if (e.status === "running" && last?.step === e.step && last.status === "running") job.events[job.events.length - 1] = { ...e, t: Date.now() };
      else job.events.push({ ...e, t: Date.now() });
    },
  })
    .then(() => (job.status = "success"))
    .catch(() => (job.status = "failed"));
  return job;
}

// Mirrors netlify/edge-functions/tripo.js so the in-browser forge works locally too.
async function proxyTripo(req, res, url) {
  let upstream;
  if (url.pathname === "/api/tripo-file") {
    const target = fileTarget(url.searchParams.get("url"));
    if (!target) return send(res, 400, { code: -1, message: "Only Tripo file URLs can be fetched" });
    upstream = await fetch(target);
  } else {
    const target = apiTarget(req.method, url.pathname);
    if (!target) return send(res, 404, { code: -1, message: "Unknown Tripo route" });
    const auth = req.headers.authorization;
    if (!validAuth(auth)) return send(res, 401, { code: 2, message: "Missing or malformed Tripo API key (it starts with tsk_)" });
    let body;
    if (req.method === "POST") for await (const chunk of req) body = (body ?? "") + chunk;
    upstream = await fetch(target, { method: req.method, headers: { authorization: auth, "content-type": "application/json" }, body });
  }
  const headers = { "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "no-store" };
  const reset = upstream.headers.get("x-ratelimit-reset");
  if (reset) headers["x-ratelimit-reset"] = reset;
  res.writeHead(upstream.status, headers);
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
  else res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/tripo/") || url.pathname === "/api/tripo-file") {
      return await proxyTripo(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/meta") {
      return send(res, 200, {
        dryRun: ENV_DRY_RUN,
        hasKey: !!process.env.TRIPO_API_KEY,
        archetypes: Object.entries(ARCHETYPES).map(([id, a]) => ({ id, label: a.label, role: a.role })),
        rarities: RARITIES.map(({ id, label }) => ({ id, label })),
        styles: Object.keys(STYLES),
        defaults: DEFAULT_OPTIONS,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/roll") {
      return send(res, 200, forgeCharacter(await readBody(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/forge") {
      const body = await readBody(req);
      // Re-forge server-side from the seed so the prompt can't be tampered with.
      const character = forgeCharacter(body.roll ?? {});
      const dryRun = ENV_DRY_RUN || !!body.dryRun;
      const job = startJob({ character, options: { ...DEFAULT_OPTIONS, ...(body.options ?? {}) }, dryRun });
      return send(res, 202, { jobId: job.id, dryRun });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const job = jobs.get(url.pathname.split("/").pop());
      return job ? send(res, 200, job) : send(res, 404, { error: "unknown job" });
    }
    if (req.method === "GET" && url.pathname === "/api/characters") {
      return send(res, 200, await listCharacters());
    }
    if (req.method === "GET" && url.pathname.startsWith("/output/")) {
      return serveFile(res, OUTPUT, decodeURIComponent(url.pathname.slice("/output/".length)));
    }
    // forge.js is dependency-free ESM, so the game reuses the same tables and RNG in the browser.
    if (req.method === "GET" && url.pathname === "/lib/forge.js") {
      return serveFile(res, path.join(ROOT, "src"), "forge.js");
    }
    if (req.method === "GET" && url.pathname === "/game") {
      return serveFile(res, WEB, "game.html");
    }
    if (req.method === "GET") {
      return serveFile(res, WEB, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1)));
    }
    send(res, 405, { error: "method not allowed" });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Sherwood Forge running at http://localhost:${PORT}`);
  if (ENV_DRY_RUN) console.log("No TRIPO_API_KEY (or TRIPO_DRY_RUN=1): jobs run in dry-run mode, no credits spent.");
});
