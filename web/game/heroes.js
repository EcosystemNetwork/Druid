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
