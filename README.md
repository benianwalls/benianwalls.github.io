# benianwalls.com | interactive resume

A scroll-driven 3D personal site: a low-poly mountain biker rides a trail through
the hills while resume sections appear as buildings along the way. Day turns to
night as you ride: windows light up, the headlight and campfire come on, and
fireflies show up. Collect all 7 coins to unlock hacker mode (the world goes wireframe).

Built with [three.js](https://threejs.org) (vendored in `vendor/three`, MIT). No
build step: everything in the world is generated in code, including the terrain,
trees, buildings, and the rider (legs are driven by two-bone IK from the crank angle).

The original 2D version lives at `/classic/` and is the automatic fallback for
browsers without WebGL.

## Run locally

```bash
python3 -m http.server 4173
# open http://localhost:4173  (add ?debug to expose window.__ride('projects') etc.)
```

## Where things live

- `index.html` — all the content (edit resume text in the popups here)
- `style.css` — colors, cards, labels, layout. Palette lives in `:root` at the top
- `script.js` — UI: popups, dock, tour, badges, hacker mode, scroll → ride progress
- `world.js` — the 3D world: terrain, props, landmark buildings, rider, sky, camera

## Tweaking

- **Trail shape / spacing:** `trailZ`, `trailY`, `SPACING` at the top of `world.js`
- **Buildings:** the `build*` functions (`buildHouse`, `buildOffice`, …) in `world.js`
- **Day → night timing:** the `KEYS` palette array and `night` in `frame()`
- **Camera framing:** the "camera" block near the end of `frame()`
- **Low-end devices:** `quality` in `script.js` (shadows/bloom are desktop-only; slow GPUs auto-degrade)
