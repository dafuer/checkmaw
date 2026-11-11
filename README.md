# Checkmaw

Two-player chess in the browser where every capture becomes a short monster fight:
the attacking piece comes alive — a toothy monster, a mounted rider, a wind-up
tin soldier, a lady or a lord — and finishes its victim in a cinematic sequence.

Everything is generated in code — the pieces, the monsters, the textures and the
sound effects — so the project uses **no external art or audio assets** and no
licences beyond the permissive open-source libraries listed below.

**Play it online:** https://dafuer.github.io/checkmaw/

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---------|--------------|
| `npm test` | Unit tests (Vitest): rules, piece identities, events, coordinates, animator, profiles, and a headless run of every finisher against every kind of victim |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type check + production build into `dist/` |

Every push to `main` runs the tests, builds the game and publishes it to GitHub
Pages (`.github/workflows/pages.yml`). The production build uses the base path
`/checkmaw/` (see `vite.config.ts`); the dev server stays at the root.

## How to play

- Click one of your pieces, then a glowing square. Green dots are moves, red rings are captures.
- Drag to orbit the camera, scroll to zoom.
- Hold **Space** to fast-forward a battle; press **U** to undo.
- Top-right controls: Undo, New game, Battles on/off (instant captures when off),
  Walks on/off (animated ordinary moves), Camera, Scene, Sound and 🌐 language.
- **Camera** (or press **C**) cycles the views: *auto* (turns to the side to
  move), *free* (stays where you leave it), *top* (straight down), *side*,
  *corner* (diagonal three-quarter view) and *orbit* (circles the board slowly).
  The choice is remembered.
- **Scene** switches between the dark ritual *arena* (braziers, runes, strong
  glow, ominous drone) and a sunny *meadow* in the mountains (snowy peaks,
  pines, flowers, clouds and butterflies, soft light and a calm music-box tune
  with birdsong). The choice is remembered.
- When the game ends, **Review the game** steps through every position:
  ⏮ ◀ ▶ ⏭ buttons or ← → Home End keys, click a move in the list to jump to it,
  Escape to go back to the result. The last move and any check stay highlighted.

## Languages

The game is in English and Spanish. It starts in the system language (any
`es-*` locale picks Spanish, anything unsupported falls back to English); the
🌐 button on the title screen and in the controls switches it, and the choice is
remembered in the browser. Strings live in `src/ui/i18n.ts`; adding a language
means adding one dictionary there (a test checks every key is translated).

## The monsters

Every capture is a short duel. Pawns and rooks turn into two-legged monsters,
the knight mounts a war horse, and the bishop, queen and king come alive as a
tin soldier, a lady and a lord.

**No two captures in a row look the same.** Each piece has several finishing
moves and takes a different one every time; its name appears on screen as it is
played:

| Piece | Becomes | Finishing moves |
|-------|---------|-----------------|
| Pawn | Gnasher: a little biter on two clawed legs, short sword and buckler | **Skewer & Gulp** (two stabs, a rising slash that tosses the victim into its jaws) · **Death from Above** (a shield bash leaves the victim seeing stars; it leaps and swallows it whole) · **Whirlwind** (a spinning-top flurry that shreds the victim and leaves the pawn dizzy) · **Timber & Slurp** (a low sweep fells the victim like a tree, eaten lengthwise bite by bite) |
| Knight | Night Rider: war horse, armoured rider, lance | **Joust** (charges, impales the victim and flings it into the air) · **Trample** (rears and brings the hooves down three times) · **Sky Lance** (a charge that ends in a soaring leap, landing lance-first) |
| Bishop | Tin Soldier: a wind-up toy with great sword and kite shield | **Cleave** (charges the blade and splits the victim from crown to base) · **Clockwork Flurry** (wound tight, four mechanical cuts and one clean diagonal that slides apart) · **Judgement** (presents arms and a colossal sword of light falls from the sky) |
| Rook | Tower Brute: huge fists, stomping legs | **Slam & Snack** (lifts the victim overhead, slams it flat and eats the pancake) · **Home Run** (a ground pound pops the victim up and one punch sends it out of the arena) · **Hammer Time** (hammers it into the board like a nail, then dusts off its hands) |
| Queen | The Radiant Lady: gown, tiara and a great crystal staff | **Crystal Tomb** (three bolts, then the victim turns to crystal and shatters) · **Singularity** (lifts the victim, spins it and crushes it to a point that bursts as a nova) · **Stardust** (the victim unravels into motes that stream into her staff and leave as fireworks) |
| King | The Sovereign: crown, cape and a sword at his belt | **One Stroke** (cuts through, sheathes the sword, and the victim falls in two) · **Riposte** (lets the victim strike first, steps aside, runs it through) · **Skyfall** (a rising cut throws the victim skyward; he leaps after it and strikes it back down) |

The rest of the duel varies too: the victim may **counter-attack** with its own
weapon (pawns and bishops block with their shields), **cower** or **taunt**; the
camera films from the side, from low among the pieces, from above or over the
attacker's shoulder, drifting slowly round the fight; and a checkmate ends with
one of three finales while the winner's army hops for joy. Heavy blows get a few
frozen frames, a zoom kick and slow motion; weapons leave trails of light.

Ordinary moves are animated too (the **Walks** toggle), again with three styles
per piece:

| Piece | Move styles |
|-------|-------------|
| Pawn | waddles · bounces along in springy hops · dashes with its sword up and skids to a stop |
| Knight | rides the L · clears it in one great leap · rears, then canters round the short leg first |
| Bishop | marches behind its shield · is wound up and shoots across on its heels · parades with sword presented |
| Rook | stomps as a brute · stays a castle and grinds across, stone on stone · crouches and bounds the whole way |
| Queen | glides in her gown · vanishes and reappears in a column of light · waltzes, turning as she goes |
| King | strides with his sword sheathed · advances warily with it drawn · swaggers and waves |

The choice is dealt like a shuffled deck (`src/rendering/battle/variety.ts`):
every option comes up once before any repeats, and never twice in a row.

reacts to those events, so rules and visuals can evolve independently.

### Debug views

- `http://localhost:5173/#lab` — every piece type, both colours, in armed monster form.
  `focusLab(index)` in the console shows one of them up close.
- `http://localhost:5173/#lab-closed` — the same pieces in their normal form.
- `window.chess.controller.restart('<FEN>')` in the console loads any position.
- `window.chess.stage.animator.speed = 0.2` slows every animation down.
- `chess.duel('q', 'stardust')` previews one finishing move (attacker type, finisher
  name, and optionally victim type, reaction and camera: `chess.duel('r', 'homeRun', 'n', 'taunt', 'low')`);
  `chess.walk('n', 'vault')` previews one move style. The names are listed in
  `src/rendering/battle/finisherNames.ts`.
- `chess.soundCheck()` renders every procedural sound offline and prints its peak,
  RMS and length (used to balance the per-sound levels in `src/audio/sfx.ts`).

## Swapping in real 3D models later

Pieces are built in `src/rendering/pieces/pieceView.ts`. Every monster feature is a
0..1 parameter (`monster`, `mouth`, `armed`, `mounted`, `avatar`, `rear`, `tongueOut`,
`tentacleReach`, `gait`, plus named gear pose weights such as `raise` and `strike`), so a
glTF model with equivalent animations can replace the procedural one behind the
same interface without touching the battle director.

## Libraries

- [three.js](https://threejs.org) (MIT) — rendering, post-processing
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause) — move generation and rules
- [Vite](https://vitejs.dev) (MIT), [Vitest](https://vitest.dev) (MIT), TypeScript (Apache-2.0)
