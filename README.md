# Sherwood Forge

Character generator for a Robin Hood themed medieval roguelike. Each roll is a seeded character (archetype, rarity, look, stats, perk, flaw, relic). The Tripo3D v3 API then turns it into a **PBR-textured, Mixamo-rigged, animated** 3D model.

## Setup

Requires Node 20.12+ and has no npm dependencies.

```bash
cp .env.example .env      # add TRIPO_API_KEY from https://platform.tripo3d.ai
npm start                 # web UI at http://localhost:5173
```

Without a key, everything runs in **dry-run** mode. The pipeline makes no Tripo calls, and a sample rigged GLB stands in for the result, so you can test the whole flow for free.

## The game: Outlaws of Sherwood

`npm start`, then open http://localhost:5173/game (or use **Play the game** in the Forge UI). It's a three.js action roguelike with no build step:

- **Heroes:** pick any forged character, which plays with its rigged GLB and baked clips, or roll a stranger in the browser. Strangers use the same `forge.js` tables and get a procedural low-poly look built from their archetype and palette.
- **Run:** seven procedurally generated forest clearings. Each one has 2–4 waves of the Sheriff's guards, hounds, crossbowmen, boars and abbey zealots, plus elites. Floor 7 is a boss fight with the Sheriff of Nottingham, who combos, fires volleys, charges and summons guards.
- **Between floors:** choose one of three boons. After floors 2, 4 and 6 the outlaw camp sells draughts, ale, upgrades and archer recruits.
- **Stats matter:** Might, Finesse, Cunning and Grit drive damage, attack speed, crit and cooldowns, and armour. Each archetype has its own attack and a Q ability (Volley, Ground Slam, Blessed Flask, Thorn Ring, Snare, Shield Charge, Billhook Sweep, Ballad of Valor).
- **Traits:** every perk, flaw and relic from the forge has a gameplay effect. Examples: Split the Arrow ricochets, Greenwood Cloak sneak attacks, Soft Heart spares fleeing foes, Wanted sends bounty hunters, Hunted by the Abbot turns shrines hostile, and Clumsy triggers more traps.

Controls: WASD to move, mouse to aim (hold to attack), Q or right-click for the ability, Space to dodge, E to interact, Esc to pause, M to mute, mouse wheel to zoom.

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
| animate | `POST /v3/animations/retarget` | Core set (idle, walk, run, hurt, defeat, victory) plus 2 archetype moves, baked in-place into one GLB |
| fbx | `POST /v3/animations/retarget` | Optional; same clips as FBX |

Output goes to `output/<name>-<seed>/`: `base.glb`, `base-rendered_image.*`, `rigged.glb`, `animated.glb`, an optional `animated.fbx`, `character.json` (game stats) and `state.json` (task ids, used for resume).

Each finished step is saved, so a failure or timeout part-way through doesn't re-spend credits on the steps before it. Use `resume`. Retries cover rate limits (`1007`) and full concurrency (`2000`).

## Files

- `src/forge.js`: archetype, look and trait tables, seeded RNG, prompt builder. Add archetypes here.
- `src/pipeline.js`: step orchestration and resume
- `src/tripo.js`: v3 API client (create, poll, download, retry, dry run)
- `src/server.js` + `web/index.html`: web UI with a three.js viewer and clip player
- `src/cli.js`: command line
- `web/game.html` + `web/game/`: the game. `main.js` (run flow, loop, menus), `world.js` (clearings, lighting, collision), `player.js`, `enemies.js` (AI and boss), `combat.js` (projectiles, damage, pickups, FX), `models.js` (procedural rigs and the GLB wrapper), `content.js` (kits, enemies, boons, relics), `hud.js`, `audio.js` (synthesized sound)
