# Don't Look Away

A complete desktop-browser horror vignette in Saint Orison's chapel. Two stone angels move through the level whenever they are unobserved. Restore the power, recover the gate key, and escape.

## Play locally

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:4187/** with a keyboard and mouse. Headphones make the positional movement sounds useful. All game assets and fonts are bundled; playing does not require an API key or a model request.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Walk |
| Mouse | Look |
| Shift | Run |
| E, held where indicated | Interact |
| Space | Blink deliberately |
| F | Draw / toggle flashlight |
| Escape | Pause and release the mouse |
| H | Hide the interface for captures |

The pause menu includes sensitivity, automatic blinking, sound, and High/Performance rendering settings. Losing focus or switching tabs pauses the game. Checkpoints restore earned progress at the sacristy and archive.

## The level

Enter through the iron gate and move through the nave. The sacristy is on the right toward the sanctuary; its electrical panel releases the archive lock. The archive is on the left toward the entrance. Its key opens the gate you arrived through. A keeper's note sits near the entrance's right aisle.

The angels respect solid cover, partial visibility, peripheral vision, and visible floor reflections. They navigate around walls and furniture. Statue pose changes only occur outside observation. The second angel and increased pursuit speed make the return journey more dangerous.

The first witnessed change in an angel starts a restrained heartbeat and breathing response. Fear rises with what the player sees and fades slowly after looking away. In the nave, a single gust extinguishes the candles from the sanctuary toward the entrance. Draw the flashlight with F; restoring power brings up the service lights. Darkness never relaxes the observation rule: a visible silhouette still freezes the entire angel.

## Production

| Asset | Production path |
| --- | --- |
| Angel | Nano Banana 2 reference → Meshy v7 Ultra/PBR with humanoid rig → Blender weight corrections and authored poses → GLB with shared morph targets |
| Carved pew | Nano Banana 2 reference → Meshy v7 Ultra/PBR → bounded-error simplification and instancing |
| Stone, floor, oak | PATINA base color, normal, and roughness maps |
| Chapel ambience, stone movement, breathing, candle snuff, flashlight draw, gate | ElevenLabs Sound Effects v2 through fal; positional playback, occlusion filtering, room reverb, and normalized levels |
| Adaptive heartbeat | Synthesized two-part pulse, paced by witnessed danger and recovery |
| Architecture and gameplay | TypeScript / Three.js; authored modular geometry, collision, navigation, observation, lighting, spatial audio, and interaction |

Blender fixes the auto-rig's wing weights and replaces its emissive preview material with the original PBR material. The four statue states share the same geometry and texture layout. Meshopt and WebP compression reduce the runtime model payloads; detailed source assets remain available for revision.

Production scripts read `FAL_KEY` from `.env.local` or the process environment. Set `FAL_ENV_FILE` to reuse another local environment file without copying its credentials into this repository.

```powershell
node scripts/generate-assets.mjs reference
node scripts/generate-assets.mjs mesh
node scripts/generate-assets.mjs materials
node scripts/generate-assets.mjs pew-reference
node scripts/generate-assets.mjs pew-mesh
node scripts/generate-assets.mjs audio
node scripts/generate-assets.mjs horror-audio
python scripts/optimize-textures.py
# Run scripts/pose-angel.py with Blender's --background --python flags.
node scripts/optimize-models.mjs
```

After revising just the angel in Blender, run `node scripts/optimize-models.mjs angel-poses` and `node scripts/asset-manifest.mjs` to update its runtime model and asset checksum. The pose script welds UV seam vertices, smooths sleeve weights while anchoring the wings, and bakes the inward-facing hands and tucked elbows into the initial Weeping pose.

Jobs are recorded and resumable. Re-running a completed mode reads its existing request instead of submitting another generation. Source references, input parameters, results, and unoptimized assets are in `assets/source/`. Runtime assets are in `public/assets/`. Blender authoring output and verification captures are in `output/`.

The development-only [asset inspector](http://127.0.0.1:4187/asset.html) allows orbiting the angel and inspecting every pose under neutral light.

## Verify and build

```powershell
npm test
npm run build
node scripts/verify.mjs
node scripts/walkthrough.mjs
node scripts/benchmark.mjs
```

The browser scripts require the dev server and Chrome. They test observation, looking away, blinking, pause, power/key/exit interactions, capture, and checkpoint recovery, and save screenshots. The benchmark measures actual frame times on the current GPU. `npm run build` creates a deployable static `dist/` directory.

For a production check, run `npm run preview -- --port 4188` and then `node scripts/production-smoke.mjs`. This also checks that the game needs no external requests and exposes no development controls.

On the development machine's integrated Radeon 880M at 1600×900, an intermediate optimized title-view benchmark measured approximately 40 fps in High and 60 fps in Performance. Gameplay, resolution, other GPU workloads, and device thermals affect frame times. Performance mode reduces render resolution and removes the reflection/bloom passes.

## Scope

This release implements the complete power → key → gate escape loop. The opposing-angels shutter puzzle and an explorable second era remain design ideas in `DESIGN.md`. The runtime uses deterministic enemy rules; generative models are part of asset production.
