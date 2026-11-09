# Monster Chess 3D

Two-player chess in the browser where every capture becomes a short monster fight:
the attacking piece cracks open, grows spider legs, teeth and glowing eyes, and
devours its victim in a cinematic sequence.

Everything is generated in code — the pieces, the monsters, the textures and the
sound effects — so the project uses **no external art or audio assets** and no
licences beyond the permissive open-source libraries listed below.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---------|--------------|
| `npm test` | Unit tests (Vitest): rules, piece identities, events, coordinates, animator, profiles |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type check + production build into `dist/` |

## How to play

- Click one of your pieces, then a glowing square. Green dots are moves, red rings are captures.
- Drag to orbit the camera, scroll to zoom.
- Hold **Space** to fast-forward a battle; press **U** to undo.
- Top-right controls: Undo, New game, Battles on/off (instant captures when off),
  Walks on/off (animated ordinary moves), Auto camera (turns the board to the
  side to move), Sound.

## Languages

The game is in English and Spanish. It starts in the system language (any
`es-*` locale picks Spanish, anything unsupported falls back to English); the
🌐 button on the title screen and in the controls switches it, and the choice is
remembered in the browser. Strings live in `src/ui/i18n.ts`; adding a language
means adding one dictionary there (a test checks every key is translated).

## The monsters

Every capture is a short duel. Pawns, knights, bishops and rooks turn into
monsters; the queen and king come alive as a lady and a lord instead. Each
type has its own weapon and finishing move:

| Piece | Monster | Arsenal | Finishing move |
|-------|---------|---------|----------------|
| Pawn | Gnasher | Short sword and buckler | Two stabs, a rising slash that tosses the victim into its jaws |
| Knight | Night Mare | War horse, armoured rider, lance | Backs off, charges, impales the victim and flings it into the air |
| Bishop | Grave Paladin | Glowing great sword and kite shield | Charges the blade and cleaves the victim in two |
| Rook | Tower Brute | Huge fists, stomping legs | Grabs the victim, lifts it overhead, slams it flat and eats the pancake |
| Queen | The Radiant Lady | A dazzling lady in a gown and tiara with a great crystal staff | Three bolts from the staff, then a pillar of light turns the victim to crystal and a tap of the staff shatters it |
| King | The Sovereign | A lord with crown, cape and a sword at his belt | Draws only to attack: cuts straight through the victim, sheathes the sword, and the victim falls in two |

The victim fights back first with its own weapon; pawns and bishops block the
blow with their shields.

Ordinary moves are animated too (the **Walks** toggle): the knight mounts its
horse and gallops along the L, the rook stomps across as a giant brute that
shakes the board, the queen glides in her gown leaving a trail of light, the
king strides with his cape flowing and his sword sheathed, and the other
pieces march with their weapons.

## Architecture

```
src/
  domain/        Pure chess model (chess.js for rules) with stable piece ids and domain events
  app/           GameController: input → domain moves → presentation, input locking
  rendering/     three.js presentation
    stage.ts       renderer, camera, lights, bloom, frame loop, camera flights
    board.ts       board, frame, arena, braziers, embers, square markers
    boardView.ts   one PieceView per domain piece; plays domain events as animations
    pieces/        procedural lathe pieces that split at the "mouth" into monsters,
                   plus gear (arms and weapons), the knight's mount and the
                   queen/king figures
    battle/        BattleDirector (capture duels) and Locomotion (walk, stomp, float, gallop)
    effects/       pooled shards and sparks; Fx: lightning, shockwaves, slash arcs, cutting in two
    animation/     promise-based tween timeline (respects fast-forward speed)
  audio/         Web Audio procedural sound effects
  ui/            HUD overlay (DOM + CSS)
  debug/         #lab view to inspect every monster up close
```

The domain never imports three.js. `ChessGame.move()` returns events such as
`captured`, `moved`, `promoted`, `check` and `gameOver`; the presentation only
reacts to those events, so rules and visuals can evolve independently.

### Debug views

- `http://localhost:5173/#lab` — every piece type, both colours, in armed monster form.
  `focusLab(index)` in the console shows one of them up close.
- `http://localhost:5173/#lab-closed` — the same pieces in their normal form.
- `window.chess.controller.restart('<FEN>')` in the console loads any position.
- `window.chess.stage.animator.speed = 0.2` slows every animation down.
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
