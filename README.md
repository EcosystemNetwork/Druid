# Sherwood Forge

Character generator for a Robin Hood themed medieval roguelike. Each roll is a seeded character (archetype, rarity, look, stats, perk, flaw, relic). The Tripo3D v3 API then turns it into a **PBR-textured, Mixamo-rigged, animated** 3D model.

## Setup

Requires Node 20.12+ and has no npm dependencies.

```bash
cp .env.example .env      # add TRIPO_API_KEY from https://platform.tripo3d.ai
npm start                 # web UI at http://localhost:5173
```

Without a key, everything runs in **dry-run** mode. The pipeline makes no Tripo calls, and a sample rigged GLB stands in for the result, so you can test the whole flow for free.

## Outlaw Creator (NFT collection)

`npm start`, then open http://localhost:5173/creator. Outlaws of Sherwood is a build-your-own collection for Robinhood Chain: minters pick every trait instead of minting blind.

- **Traits:** archetype, body, skin, age, build, hair, face, outfit, gear, sidearm, colours and background make up a character's look. Name, epithet, relic, perk and flaw make up its legend. Every option has a tier (Common, Uncommon, Rare, Legendary), shown as a coloured dot. Some Rare and Legendary options (e.g. Hood of Locksley, King Richard's Colours, The Golden Arrow Tourney) exist only in the creator, so random rolls and old seeds are unchanged.
- **Rarity:** tier points (0/1/3/6) are summed over the scored slots: 4+ is Uncommon, 9+ Rare, 18+ Legendary. Rarity drives stat bonuses, and only Legendary characters get a second perk.
- **Scarcity:** no two tokens may share a look (all the visual slots). Each Rare option can be minted 200 times and each Legendary option 30 times, out of a supply of 5,000. All of this is configured in `COLLECTION` in `src/forge.js`.
- **DNA:** a build's seed is `dna-<hash of its look>`, so its stats and its Tripo mesh are fixed per look and can't be rerolled.
- **Portrait:** `src/portrait.js` draws a deterministic 1000×1000 SVG card from the traits. The creator shows it live and exports it as a 2000px PNG; the server renders the same SVG for token metadata.
- **Reserving:** with the local server running, **Reserve this outlaw** enforces uniqueness and caps (`src/collection.js`). It writes ERC-721 metadata to `output/nft/metadata/<id>.json` and the portrait to `output/nft/images/<id>.svg`, served at `/nft/`. Set `NFT_BASE_URL` to put a public URL in the metadata. This is a stand-in for the Robinhood Chain mint contract, which isn't built yet.
- **3D:** **Forge in 3D** runs the build through the Tripo pipeline from inside the creator. The local server forges it with `TRIPO_API_KEY`, or as a dry run without a key. The **3D model** tab shows the textured mesh as soon as it lands and then the rigged, animated result. The panel shows your Tripo balance, and a real forge needs a second click to confirm. A build's mesh depends only on its look, style and rarity, never its name. Output folders are keyed on those three (`output/<archetype>-dna-<hash>-<style>-<rarity>/`), so a build that has been forged loads for free, and identical simultaneous requests share one job. **More options in the 3D Forge →** opens the full Forge (FBX, face limit, geometry).
- **3D on the token:** a reserved token gets its forged GLB in `output/nft/models/<id>.glb` as the metadata's `animation_url`. This happens when you reserve if the build was already forged, or as soon as its forge finishes. Only a real forge of exactly that token's prompt is attached, never a dry run.

Every build lives in the URL hash, so **Copy share link** rebuilds it exactly.

## The game: Outlaws of Sherwood

`npm start`, then open http://localhost:5173/game (or use **Play the game** in the Forge UI). It's a three.js action roguelike with no build step:

- **Heroes:** pick any forged character, which plays with its rigged GLB and baked clips, or roll a stranger in the browser. Strangers use the same `forge.js` tables and get a procedural low-poly look built from their archetype and palette.
- **Run:** seven procedurally generated forest clearings. Each one has 2–4 waves of the Sheriff's guards, hounds, crossbowmen, boars and abbey zealots, plus elites. Floor 7 is a boss fight with the Sheriff of Nottingham, who combos, fires volleys, charges and summons guards.
- **Between floors:** choose one of three boons. After floors 2, 4 and 6 the outlaw camp sells draughts, ale, upgrades and archer recruits.
- **Stats matter:** Might, Finesse, Cunning and Grit drive damage, attack speed, crit and cooldowns, and armour. Each archetype has its own attack and a Q ability (Volley, Ground Slam, Blessed Flask, Thorn Ring, Snare, Shield Charge, Billhook Sweep, Ballad of Valor).
- **Traits:** every perk, flaw and relic from the forge has a gameplay effect. Examples: Split the Arrow ricochets, Greenwood Cloak sneak attacks, Soft Heart spares fleeing foes, Wanted sends bounty hunters, Hunted by the Abbot turns shrines hostile, and Clumsy triggers more traps.

Controls: WASD to move, mouse to aim (hold to attack), Q or right-click for the ability, Space to dodge, E to interact, Esc to pause, M to mute, mouse wheel to zoom.

**Forging from the game:** roll a stranger, press **Forge this hero in 3D**, paste your Tripo API key (`tsk_…`) and start. The browser runs the same generate, rig-check, rig and animate steps as the CLI. Requests go through a same-origin proxy that only allows those Tripo endpoints: `netlify/edge-functions/tripo.js` on Netlify and the matching route in `src/server.js` locally. The key is sent with each request and never stored server-side; it's kept in the browser only if you tick "Remember". Finished steps are saved, so a failed run resumes without re-spending credits. When the run finishes, the hero is published to the shared gallery (below), and a copy is also kept in the browser's IndexedDB as a cache, because Tripo's download links expire.

## Shared gallery (Supabase)

Every hero forged in the game goes into one public roster that every player sees. Postgres holds the character sheets (`heroes` table), and a public Storage bucket (`heroes`) holds the GLBs and thumbnails.

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: in `.env` locally, and in the Netlify site's environment variables for the deploy.

`/api/heroes` (`src/gallery.js`, served by `netlify/edge-functions/heroes.js` and `src/server.js`) is the only thing that writes. A publish never takes model bytes from the browser. The client sends its Tripo key and task ids; the server reads those tasks from Tripo, downloads the GLB itself, and re-forges the character from its seed. If a publish fails, the hero stays in that browser and is retried the next time the player's key is used. Without the env vars, the gallery is just empty and everything else works as before. To remove a hero, delete its row and folder in the Supabase dashboard.

**Netlify:** `netlify.toml` publishes `web/`, copies `src/forge.js` to `web/lib/` at build time, serves the game at `/` and deploys the Tripo proxy edge function. The Forge page (`index.html`) needs the Node server, so it only works locally.

If a forged model faces the wrong way, use **Rotate hero model 90°** in the pause menu. The game remembers it per character.

## CLI

```bash
npm run roll -- --count 5                          # preview characters, free
npm run roll -- --seed locksley --archetype outlaw_archer
npm run forge -- --seed locksley --fbx             # full pipeline, spends credits
npm run dry -- --seed locksley                     # full pipeline, dry run
node src/cli.js resume output/<character-dir>      # continue a failed run
npm run balance
```

Flags: `--archetype --rarity --style (stylized|realistic|lowpoly) --sex --texture (standard|detailed|extreme) --geometry (standard|detailed) --faces 40000 --fbx --root-motion`.

## Pipeline

| Step | Endpoint | Notes |
|---|---|---|
| generate | `POST /v3/generation/text-to-model` | `v3.1`, PBR, A-pose prompt, weapons stowed, seeds derived from the character seed |
| rigcheck | `POST /v3/animations/rig-check` | Stops if the model is not a riggable biped, before any rig credits are spent |
| rig | `POST /v3/animations/rig` | `v1.0-20240301` biped, `spec: mixamo` (maps to Unity/Unreal humanoid) |
| animate | `POST /v3/animations/retarget` | Core set (idle, walk, run) plus 2 archetype moves (Tripo caps a request at 5), baked in-place into one GLB |
| fbx | `POST /v3/animations/retarget` | Optional; same clips as FBX |

Output goes to `output/<name>-<seed>/`: `base.glb`, `base-rendered_image.*`, `rigged.glb`, `animated.glb`, an optional `animated.fbx`, `character.json` (game stats) and `state.json` (task ids, used for resume).

Each finished step is saved, so a failure or timeout part-way through doesn't re-spend credits on the steps before it. Use `resume`. Retries cover rate limits (`1007`) and full concurrency (`2000`).

## Files

- `src/forge.js`: archetype, look and trait tables (with tiers), seeded RNG, prompt builder, build-mode validation, DNA, supply helpers and ERC-721 metadata. Add archetypes and trait options here.
- `src/portrait.js`: the 2D NFT portrait (SVG), shared by the browser and the server
- `src/collection.js` + `web/creator.html`: the Outlaw Creator and its local mint registry
- `src/pipeline.js`: step orchestration and resume
- `src/tripo.js`: v3 API client (create, poll, download, retry, dry run)
- `src/server.js` + `web/index.html`: web UI with a three.js viewer and clip player
- `src/cli.js`: command line
- `web/game.html` + `web/game/`: the game. `main.js` (run flow, loop, menus), `world.js` (clearings, lighting, collision), `player.js`, `enemies.js` (AI and boss), `combat.js` (projectiles, damage, pickups, FX), `models.js` (procedural rigs and the GLB wrapper), `content.js` (kits, enemies, boons, relics), `hud.js`, `audio.js` (synthesized sound), `tripo-browser.js` (in-browser forge), `heroes.js` (IndexedDB cache and gallery client)
- `src/tripo-proxy.js`: the allowlist shared by the local and Netlify Tripo proxies
- `src/gallery.js` + `supabase/schema.sql`: the shared hero gallery
