// Local mint registry for the build-your-own NFT collection. It enforces what the
// Robinhood Chain contract will: one token per look (visual DNA), per-option supply
// caps and the collection's max supply. Each reservation writes ERC-721 metadata
// and the portrait under output/nft/, served at /nft/. Once the outlaw is forged in
// 3D, its animated GLB is copied to output/nft/models/ and becomes the animation_url.
//
// Single-process only: reservations are serialized through one promise chain.

import { readFile, writeFile, mkdir, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import { COLLECTION, SLOTS, forgeCharacter, soldOutTraits, supplyKey, tokenMetadata, traitOption, visualKey } from "./forge.js";
import { portraitSVG } from "./portrait.js";

export class ReserveError extends Error {
  constructor(message, details = {}) {
    super(message);
    Object.assign(this, details);
  }
}

export function createRegistry(dir) {
  const file = path.join(dir, "registry.json");
  let state = null;
  let queue = Promise.resolve();

  async function load() {
    if (state) return state;
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      state = { tokens: [] };
    }
    return state;
  }

  async function save() {
    await mkdir(dir, { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, file);
  }

  function counts(s) {
    const out = {};
    for (const t of s.tokens) {
      for (const slot of SLOTS) {
        const o = traitOption(t.character, slot.id);
        if (!o) continue;
        const k = supplyKey(slot.id, t.character.archetype, o.id);
        out[k] = (out[k] ?? 0) + 1;
      }
    }
    return out;
  }

  // Whether a build-mode character could be reserved right now.
  async function check(character) {
    const s = await load();
    const key = visualKey(character.traits);
    const taken = s.tokens.find((t) => t.key === key);
    return {
      unique: !taken,
      takenBy: taken ? { tokenId: taken.tokenId, name: taken.character.name } : null,
      soldOut: soldOutTraits(character, counts(s)),
      minted: s.tokens.length,
      maxSupply: COLLECTION.maxSupply,
    };
  }

  // Copies a forged GLB into the collection and points the token's metadata at it.
  async function writeModel(t, glbPath, baseUrl) {
    t.baseUrl ??= baseUrl; // tokens reserved before baseUrl was recorded
    await mkdir(path.join(dir, "models"), { recursive: true });
    await copyFile(glbPath, path.join(dir, "models", `${t.tokenId}.glb`));
    t.model = `${t.baseUrl}/nft/models/${t.tokenId}.glb`;
    const metaFile = path.join(dir, "metadata", `${t.tokenId}.json`);
    const meta = JSON.parse(await readFile(metaFile, "utf8"));
    meta.animation_url = t.model;
    await writeFile(metaFile, JSON.stringify(meta, null, 2));
  }

  function reserve({ traits, style }, baseUrl, findModel = async () => null) {
    const run = queue.then(async () => {
      const character = forgeCharacter({ traits, style });
      const status = await check(character);
      if (status.minted >= status.maxSupply) throw new ReserveError("The collection is fully minted.");
      if (!status.unique) throw new ReserveError(`That exact look is already token #${status.takenBy.tokenId} (${status.takenBy.name}). Change any visual trait.`, { takenBy: status.takenBy });
      if (status.soldOut.length) throw new ReserveError(`Sold out: ${status.soldOut.map((x) => `${x.label} (${x.slotLabel})`).join(", ")}.`, { soldOut: status.soldOut });

      const tokenId = state.tokens.reduce((n, t) => Math.max(n, t.tokenId), 0) + 1;
      const image = `${baseUrl}/nft/images/${tokenId}.svg`;
      const meta = tokenMetadata(character, { tokenId, image, externalUrl: `${baseUrl}/creator?token=${tokenId}` });
      await mkdir(path.join(dir, "images"), { recursive: true });
      await mkdir(path.join(dir, "metadata"), { recursive: true });
      await writeFile(path.join(dir, "images", `${tokenId}.svg`), portraitSVG(character, { tokenId }));
      await writeFile(path.join(dir, "metadata", `${tokenId}.json`), JSON.stringify(meta, null, 2));

      const token = { tokenId, key: visualKey(character.traits), dna: character.dna, character, baseUrl, created: new Date().toISOString() };
      // Forged before reserving: attach the model straight away.
      const glb = await findModel(character);
      if (glb) await writeModel(token, glb, baseUrl);
      state.tokens.push(token);
      await save();
      return { tokenId, character, metadata: meta, metadataUrl: `${baseUrl}/nft/metadata/${tokenId}.json`, imageUrl: image, modelUrl: token.model ?? null };
    });
    // Keep the chain alive after a failed reservation.
    queue = run.catch(() => {});
    return run;
  }

  // Forged after reserving: attach to the token whose model this is. The prompt decides
  // the mesh, so a token only takes a GLB forged from exactly its prompt.
  function attachModel(character, glbPath, baseUrl) {
    const run = queue.then(async () => {
      const s = await load();
      const t = s.tokens.find((x) => x.character.prompt === character.prompt && x.character.seed === character.seed && !x.model);
      if (!t) return null;
      await writeModel(t, glbPath, baseUrl);
      await save();
      return t.tokenId;
    });
    queue = run.catch(() => {});
    return run;
  }

  async function supply() {
    const s = await load();
    return { collection: COLLECTION, minted: s.tokens.length, counts: counts(s) };
  }

  async function tokens() {
    const s = await load();
    return s.tokens.map(({ tokenId, dna, character, created, model }) => ({ tokenId, dna, name: character.name, rarity: character.rarity, archetypeLabel: character.archetypeLabel, created, model: model ?? null }));
  }

  return { check, reserve, attachModel, supply, tokens };
}
