# benianwalls.com | interactive resume

A scroll-driven personal site: a mountain biker rides through a parallax mountain
world while resume sections appear as trail checkpoints. Day turns to night as you
ride, the bike's headlight comes on, and mile-marker signposts pass by at each section.

No build step, no dependencies, plain HTML / CSS / JS.

## Run locally

```bash
python3 -m http.server 4173
# open http://localhost:4173
```

(or just double-click `index.html`)



## Where things live

- `index.html` — all the content (edit resume text here)
- `style.css` — colors, cards, layout. Palette lives in `:root` at the top
- `script.js` — the world: procedural mountains/trees, parallax speeds (`SPEEDS`),
  wheel + pedaling animation, day→night cycle, signpost placement

## Tweaking

- **Parallax feel:** adjust `SPEEDS` in `script.js`
- **When night falls:** the `night` calculation in the `frame()` loop (currently starts at 55% scroll)
- **Signpost labels:** the `sections` array in `buildGround()`
