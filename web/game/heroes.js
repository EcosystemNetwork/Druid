// Heroes forged in the browser live in IndexedDB: the GLB blob plus the character sheet.
// Tripo's download links expire, so the model itself is kept, not the URL.

const DB_NAME = "sherwood";
const STORE = "heroes";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "seed" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const saveHero = (hero) => tx("readwrite", (s) => s.put(hero));
export const deleteHero = (seed) => tx("readwrite", (s) => s.delete(seed));

export async function listHeroes() {
  try {
    const all = await tx("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.created - a.created);
  } catch {
    return []; // private windows or blocked storage
  }
}

// The shared gallery (Supabase, behind /api/heroes) is the durable copy everyone sees.
// The IndexedDB copy above is a fast local cache and a fallback until a publish succeeds.

export async function listGallery() {
  try {
    const r = await fetch("/api/heroes");
    if (r.ok && r.headers.get("content-type")?.includes("json")) return await r.json();
  } catch {}
  return [];
}

// The server fetches the model from Tripo itself, so only the task ids and the key are sent.
export async function publishHero(key, hero) {
  const res = await fetch("/api/heroes", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ character: hero.character, tasks: hero.tasks }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Publishing failed (HTTP ${res.status})`);
  await saveHero({ ...hero, published: true });
  return body;
}

// Retries heroes whose publish failed earlier; called whenever a working key is at hand.
export async function publishPending(key) {
  let count = 0;
  for (const h of await listHeroes()) {
    if (!h.tasks || h.published) continue;
    try {
      await publishHero(key, h);
      count++;
    } catch {}
  }
  return count;
}
