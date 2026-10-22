# Imperium: Xalvoric, rebuilt in the igloo.inc format

A single-page, scroll-driven WebGL site for Xalvoric (websites, AI agents, product ads), structured like igloo.inc: a percentage loader, a wireframe-to-solid intro, a hero object made of blocks, floating shards for the main offer, a ring portal into light, and a room with a morphing particle form.

Stack: Vite + TypeScript + three.js, no framework. All copy is real HTML over the canvas. The 3D scene is a separate lazy chunk (about 161 KB gzip). The boot script is about 8 KB gzip.

## Commands

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + production build into dist/
```

```bash
npm run preview    # serve dist/
```

Useful URL flags: `?skip` (skip the intro), `?gl=off` (static page), `?motion=off` (same as reduced motion), `?quality=low`.

## The journey

| igloo.inc (observed) | Xalvoric version | Scroll `p` |
| --- | --- | --- |
| Small centred progress line on grey | `XALVORIC // INITIALISING` with a percentage tied to real build steps | before scroll |
| Wireframe network, wireframe igloo, blocks solidify | Constellation network and block blueprint draw on; graphite blocks fly in course by course; the core lights the seams | intro (time-based) |
| Igloo of ice blocks on a snow ridge, numbered blocks, corner HUD | Monolith of graphite blocks on procedural snow; numbered blocks joined by lines; blocks push away from the cursor, click sends a ripple | 0 – 0.08 |
| Blocks explode upward, camera climbs into cloud | Same idea: courses lift off top first, whiteout | 0.08 – 0.15 |
| Fog void with blurred text and portfolio shards with HUD callouts | Blurred studio copy drifts past; three shards (`</>`, `AI`, `▶`) hold the services; click a shard or `[ Click to explore ]` for the full description | 0.15 – 0.47 |
| Shattered ring portal into light | Four broken rings, one per process step, with leader lines; flight ends in the light | 0.47 – 0.75 |
| Room with platform, halo, particle character and link carousel | Stepped platform and halo; an abstract particle form changes per FAQ answer (window, neural sphere, prism, discs, layers, lattice); carousel with arrows and ←/→ keys | 0.75 – 0.90 |
| (loops back to the igloo) | Particles settle into the Xalvoric X; contact panel, form dialog, "Return to the surface" | 0.90 – 1 |

How igloo.inc was studied: REA captured the live page (it renders every word inside WebGL, loads Draco meshes, KTX2 textures, MSDF fonts and Ogg audio). Its full scroll sequence came from a screen recording of the site. Only the structure and the ideas were reused. No igloo code, text, meshes, textures, audio or its particle character were copied. Every shape here is procedural or the Xalvoric mark.

## Where to edit

| What | File |
| --- | --- |
| All copy (hero, services, process, FAQ, contact) | `index.html` |
| Contact inbox (`CONTACT_EMAIL`) | `src/config.ts` |
| Scroll length, when each beat happens, overlay fade windows, nav targets | `src/config.ts` (`SCROLL_VH`, `T`, `WINDOWS`, `JUMPS`) |
| Colours, fonts, HUD layout, phone layout | `src/styles.css` (tokens at the top) |
| Monolith shape, terrain, intro, cursor push, lift-off | `src/gl/surface.ts` |
| Shards, drifting text words, rings, light | `src/gl/voidStage.ts` |
| Platform, halo, particle behaviour | `src/gl/room.ts` |
| Particle shapes | `src/gl/shapes.ts` |
| Bloom, grain, vignette, whiteout | `src/gl/post.ts` |
| Ambient sound and interface tones (synthesised, no files) | `src/audio.ts` |

Camera paths are keyframes (`CamKey`) in each stage file, in the same `p` units as `src/config.ts`. Phones use a pulled-back version of each path (`pullBack`).

## Behaviour notes

- Native page scroll drives everything, so wheel, trackpad, touch, keyboard and the scrollbar all work. The scene follows a damped copy of the scroll position. Nav links fade to fog and cut instead of rushing through every stage.
- Keyboard focus moving into an overlay that is off screen scrolls to it. All overlay text stays in the DOM for screen readers.
- Overlay text is near-black on the grey scene (about 7.5:1). Light text appears only on the dark dialogs and on the block numbers.
- Reduced motion, no WebGL2, or a lost GPU context shows the static page: the same content as a normal document.
- Quality: DPR is capped at 1.5 (1.15 on low-tier devices, fewer particles and terrain vertices). If the first seconds after the intro run below about 38 fps, DPR drops to 1, then bloom turns off.
- Sound is off by default; the choice is remembered on the device.

## Placeholders

| Item | Status |
| --- | --- |
| Contact form | Not connected. With `CONTACT_EMAIL` empty it validates, then says nothing was sent. With an address it opens a pre-filled `mailto:` draft. |
| Logo | The faceted X placeholder from the Xalvoric site. |
| Social image | None yet (`og:image` not set). |
