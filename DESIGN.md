# Don't Look Away — proposed game direction

Status: the first complete browser implementation is available. See README.md for running it, controls, the shipped production pipeline, and verification. The original direction below remains the longer-term design reference. The current map contains a nave, sanctuary, entrance, sacristy, and archive, with the power → key → gate finale described as the initial fallback below.

## Intent

A complete, roughly 8–12 minute first-person Weeping Angels horror experience in one abandoned funerary chapel and its enclosed cloister. Two active angels, one escape route, a small number of authored encounters connected by consistent systemic behavior. Concentrate the visual budget into a place the player repeatedly sees from different, increasingly threatening angles.

The opening must communicate the hook without explanation: an angel stands at the end of a wet cloister; the player looks at a door; the angel is closer when they turn back. The player can cause and reproduce this moment in ordinary play.

The benchmark is a beautiful playable environment under a moving camera, including close inspection of the angel. Concept images and promotional renders do not establish runtime quality.

## Place and visual direction

A rain-soaked Victorian funerary chapel after closing. Weathered pale limestone, dark carved oak, oxidized bronze, wet flagstones, thin ground mist, occasional warm maintenance lights, and moonlight through a broken roof. Restrained color and readable silhouettes. Darkness conceals information without making navigation depend on raising monitor brightness.

The central composition is a winged stone angel beneath a ruined rose window. Rain crosses the moonlight behind it. The wings, hands, face, stone fractures, and robe folds must hold up at first-person viewing distance.

Five connected spaces:

- Entrance vestibule: a safe introduction and the visible, initially locked exit.
- Open cloister: the first angel encounter and the main landmark.
- Chapel nave: a longer sightline broken by pillars, with a manual shutter mechanism.
- Sacristy: the power control and the first forced decision about looking away.
- Narrow return passage: a shortcut back to the vestibule, introducing the second angel.

The route forms a loop with a short branch into the sacristy. Reusing the cloister makes changes in statue positions recognizable. Architecture supplies cover, navigation, and compositions; generated props supply detail.

## Playable arc

1. Arrival. Establish the exit, the dead power, and an apparently harmless angel. Let the player discover one small positional change before presenting immediate danger.
2. First dilemma. Reach and restore power in the sacristy. The angel follows through the cloister. The player must judge when it is safe to look at the control, with nearby cover offering a deliberate solution.
3. Escalation. Power exposes a route through the nave and opens the return passage. A second angel appears on that route. Familiar spaces now demand managing two sightlines. Use a clearly signaled, authored power interruption once; do not randomly cancel observation to force a scare.
4. Final puzzle. From clues planted earlier, lure the angels onto opposing sides of the nave's closed central shutters. Raise the shutters to expose them to one another and lock them in place. This is an authored, achievable arrangement supported by enemy-to-enemy visibility checks, not an arbitrary proximity trigger.
5. Escape. Return through the unlocked vestibule and leave. Give the player a clear completion state and an immediate replay option. Short checkpoints prevent the final puzzle from requiring a full restart.

Prototype the final arrangement early. If it cannot be taught clearly and completed reliably, substitute a gate-opening escape encounter for the first release rather than shipping an obscure puzzle.

## Rules that make the fear work

- An angel freezes whenever a readable portion of its body is visibly observed. Looking at its feet still counts. Never require the reticle to be on its face.
- Observation accounts for camera view, solid occlusion, and authored light coverage. Treat ambiguous peripheral visibility conservatively in the player's favor. Mist is atmosphere, not a hidden switch that releases enemies.
- No visible locomotion, pose interpolation, or repositioning. Offscreen motion follows navigable paths and respects walls. Pose changes use the same observation rule as movement.
- Angels progress through authored poses: face covered, hands lowered, head turned, reaching, lunging. Preserve one character's identity and material across poses.
- Use spatial stone scraping and footfalls to convey offscreen movement. Not every movement gets a musical sting. Silence while an angel is visible is part of the effect.
- Build and tune the look-away game before adding involuntary blinking. The proposed blink system allows manual blinking and gives a legible warning before a forced blink. It needs recovery windows and must not make death inevitable.
- No random teleport onto the player. Close encounters need warning and a feasible response. Enemy speed, activation, routes, blink timing, and available cover must be tuned together.
- Getting caught may use a brief time-displacement image of the same room followed by checkpoint restart. A fully explorable second era is outside the first release.
- Pause and lost window focus stop simulation. Loading, tab switching, and performance stalls must not create surprise deaths.

## Astra and fal production roles

Astra handles level construction, controller and collision, observation logic, navigation, encounter direction, shaders, lighting integration, audio behavior, Blender processing scripts, optimization, and repeatable playtests.

Fal supplies asset candidates for deliberate selection and refinement:

- Use Nano Banana 2 (`fal-ai/nano-banana-2`) for the initial clean reference image, then Meshy v7 (`meshy/v7/image-to-3d`) for reconstruction. This is the user's selected asset pipeline, replacing the initial Hunyuan proposal.
- Generate a single full-body angel per reference image: neutral background, soft even illumination, complete wings and feet in frame, clearly separated arms, visible hands and face, restrained perspective, no environmental props. Start with a 2K PNG. Select the strongest design before paying for reconstruction; inspect the resulting mesh at actual gameplay camera distance.
- For the first hero mesh, start with standard generation, Ultra mode and PBR enabled. Meshy's documented Ultra mode cannot be combined with smart topology or lowpoly. Treat polygon reduction as a measured optimization after inspecting the detailed result. Model output still requires inspection and cleanup.
- PATINA can provide full seamless PBR material sets for stone, floor, wood, and metal. Use the relevant material channels, not just color maps.
- Generate a small number of supporting sculptural props. Build structural walls, doors, collision, and modular architecture with exact dimensions.

In Blender, inspect topology, separate or repair fused hands/wings if needed, prepare a poseable mesh, author the pose set, and export optimized static poses. Automatic rigging is not assumed to work on the raw generated sculpture. Static pose exports are sufficient because the player never sees a transition.

Build the source angel with its hands away from its face and its arms slightly separated from the robe. Author the iconic face-covered pose after reconstruction so the underlying face and hands remain usable for subsequent poses. Derive all gameplay poses from the same master mesh to preserve identity, wings, robe folds, and texture placement. Facial changes may require sculpted shape keys as well as a skeleton. Evaluate Meshy's optional humanoid rigging on the result, with custom Blender work for wings, fingers, and drapery as needed.

Generate assets during production and ship the selected assets with the game. Runtime play should not depend on generation queues or a player's API key. Record provenance, prompts, model IDs, settings, and selected outputs for a reproducible making-of.

## Platform decision

Browser delivery favors instant participation from an X post. A browser prototype should prove its actual visual ceiling on the target hardware before committing to the whole map. Use baked environment lighting where appropriate, selective dynamic shadows, compressed assets, and tightly budgeted effects. Establish a measured frame-time target with the user's hardware.

Native delivery is the alternative when maximum rendering fidelity outweighs link-to-play convenience. Engine selection requires checking available tooling and testing a representative scene. Do not promise AAA fidelity from a stack choice alone.

Do not build both versions for the first release.

## First production milestone

A single finished cloister corner, one production-quality angel with at least three poses, first-person movement, a working light, observation and occlusion, spatial sound, and one repeatable 30–60 second encounter.

Acceptance checks:

- The room and angel survive close inspection and moving-camera capture.
- The angel stays fixed while visible, including partial and peripheral views.
- Breaking sight makes it approach through valid space; it does not cross walls.
- The reveal reads in a short recording without captions or a spoken explanation.
- Stable performance on the chosen target device during shadows, mist, and close-up encounters.
- Several play attempts demonstrate a predictable rule and a tense decision.

Only then expand the loop, second angel, completion puzzle, checkpoints, and ending. The largest early risk is the angel asset at close range; solve it before producing dozens of environment assets.

## Showcase capture

The intended short clip is ordinary gameplay: a distant angel framed by the cloister; a glance toward the exit latch; a return glance revealing it much closer; a nervous backward retreat; a blink revealing a reaching pose. Keep the silhouette readable at phone size and preserve a few seconds of anticipation.

Publish the playable game alongside a separate production breakdown showing fal outputs, Blender cleanup and posing, and the finished runtime scene. No guarantee of virality; the design gives viewers a quickly understandable rule and a reason to try it themselves.

## Sources checked

- Linear brief: https://linear.app/features-and-labels/issue/CRE-336/create-gpt-6-astra-gaming-demos-and-use-cases
- Local reference inspected: ../fal-worldclaw/src/lib/fal.ts and ../fal-worldclaw/docs/shots/world-hero.png
- Meshy v7 API: https://fal.ai/models/meshy/v7/image-to-3d/api
- Nano Banana 2 API: https://fal.ai/models/fal-ai/nano-banana-2/api
- PATINA: https://blog.fal.ai/introducing-patina/
- Angel reference: https://www.doctorwho.tv/characters/weeping-angels
