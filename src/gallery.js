// Shared hero gallery on Supabase: Postgres holds the character sheets, a public Storage
// bucket holds the GLBs and thumbnails. Writes need the service-role key, so they only
// happen here, server-side. Used by src/server.js and netlify/edge-functions/heroes.js.
//
// A publish never takes model bytes from the browser. The client sends its Tripo key and
// task ids; the server reads those tasks from Tripo and downloads the files itself, and
// re-forges the character from its seed so the sheet can't be tampered with.

import { reforge } from "./forge.js";
import { TRIPO_API, fileTarget, validAuth } from "./tripo-proxy.js";

const BUCKET = "heroes";
const MAX_BYTES = 50 * 1024 * 1024; // Supabase's default per-file upload limit
const TASK_ID = /^[\w-]{1,80}$/;

class BadRequest extends Error {}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// New sb_secret_ keys go in the apikey header only; legacy service_role JWTs also need a Bearer header.
const supa = (env, extra = {}) => ({ apikey: env.key, ...(env.key.startsWith("eyJ") ? { authorization: `Bearer ${env.key}` } : {}), ...extra });
const publicUrl = (env, path, version) => `${env.url}/storage/v1/object/public/${BUCKET}/${path}?v=${version}`;

// GET /api/heroes -> gallery list; POST /api/heroes -> publish a forged hero.
export async function handleGallery(request, env) {
  const configured = !!(env.url && env.key);
  try {
    if (request.method === "GET") return configured ? json(200, await listGallery(env)) : json(200, []);
    if (request.method !== "POST") return json(405, { error: "method not allowed" });
    if (!configured) return json(503, { error: "The shared gallery isn't configured on this server" });
    const auth = request.headers.get("authorization");
    if (!validAuth(auth)) return json(401, { error: "Missing or malformed Tripo API key (it starts with tsk_)" });
    return json(201, await publish(env, auth, await request.json()));
  } catch (err) {
    return json(err instanceof BadRequest ? 400 : 502, { error: err.message });
  }
}

async function listGallery(env) {
  const res = await fetch(`${env.url}/rest/v1/heroes?select=seed,character,model_path,thumb_path,created_at&order=created_at.desc&limit=200`, {
    headers: supa(env),
  });
  if (!res.ok) throw new Error(`Gallery query failed (HTTP ${res.status})`);
  return (await res.json()).map((row) => {
    const v = Date.parse(row.created_at);
    return {
      seed: row.seed,
      character: row.character,
      model: publicUrl(env, row.model_path, v),
      thumb: row.thumb_path ? publicUrl(env, row.thumb_path, v) : null,
      created: v,
    };
  });
}

async function publish(env, auth, body) {
  const c = body?.character ?? {};
  const tasks = body?.tasks ?? {};
  if (typeof c.seed !== "string" || !c.seed || c.seed.length > 64) throw new BadRequest("Missing or invalid seed");
  if (c.mode === "build" && (typeof c.traits !== "object" || !c.traits)) throw new BadRequest("Missing traits");
  if (!TASK_ID.test(tasks.animate ?? "") || (tasks.generate && !TASK_ID.test(tasks.generate))) throw new BadRequest("Missing or invalid task ids");
  let character;
  try {
    character = reforge(c);
  } catch (err) {
    throw new BadRequest(err.message);
  }

  const anim = await tripoTask(auth, tasks.animate);
  const modelUrl = anim.output?.model_url ?? Object.entries(anim.output ?? {}).find(([k, v]) => k.endsWith("_url") && /\.glb/i.test(v))?.[1];
  if (!modelUrl) throw new Error("That Tripo task has no animated model");
  const thumbUrl = tasks.generate ? (await tripoTask(auth, tasks.generate).catch(() => null))?.output?.rendered_image_url : null;

  const dir = await seedDir(character.seed);
  const model = await download(modelUrl);
  await upload(env, `${dir}/animated.glb`, model.bytes, "model/gltf-binary");
  let thumbPath = null;
  if (thumbUrl) {
    const thumb = await download(thumbUrl).catch(() => null);
    if (thumb) {
      const known = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
      const type = known[thumb.type] ? thumb.type : "image/png";
      thumbPath = `${dir}/thumb.${known[type]}`;
      await upload(env, thumbPath, thumb.bytes, type);
    }
  }

  const row = {
    seed: character.seed,
    name: character.name,
    archetype: character.archetype,
    rarity: character.rarity,
    character,
    model_path: `${dir}/animated.glb`,
    thumb_path: thumbPath,
    created_at: new Date().toISOString(),
  };
  const res = await fetch(`${env.url}/rest/v1/heroes?on_conflict=seed`, {
    method: "POST",
    headers: supa(env, { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Saving the hero failed (HTTP ${res.status}): ${await res.text()}`);
  const v = Date.parse(row.created_at);
  return { seed: row.seed, character, model: publicUrl(env, row.model_path, v), thumb: thumbPath ? publicUrl(env, thumbPath, v) : null, created: v };
}

async function tripoTask(auth, id) {
  const res = await fetch(`${TRIPO_API}/tasks/${id}`, { headers: { authorization: auth } });
  const body = await res.json().catch(() => ({}));
  if (body.code !== 0) throw new Error(`Tripo: ${body.message ?? `task lookup failed (HTTP ${res.status})`}`);
  if (body.data.status !== "success") throw new Error(`Tripo task ${id} isn't finished (${body.data.status})`);
  return body.data;
}

async function download(raw) {
  const target = fileTarget(raw);
  if (!target) throw new Error("Only Tripo file URLs can be published");
  const res = await fetch(target);
  if (!res.ok) throw new Error(`Couldn't download from Tripo (HTTP ${res.status})`);
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new Error("Model is too large for the gallery");
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("Model is too large for the gallery");
  return { bytes, type: res.headers.get("content-type")?.split(";")[0] };
}

async function upload(env, path, bytes, type) {
  const res = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: supa(env, { "content-type": type, "x-upsert": "true", "cache-control": "3600" }),
    body: bytes,
  });
  if (!res.ok) throw new Error(`Storage upload failed (HTTP ${res.status}): ${await res.text()}`);
}

// Seeds are free text; hash them into a storage-safe folder name.
async function seedDir(seed) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  return [...hash.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
