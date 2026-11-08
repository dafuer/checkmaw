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
  Auto camera (turns the board to the side to move), Sound.

## The monsters

Each piece type has its own monster form and attack:

| Piece | Monster | Attack |
|-------|---------|--------|
| Pawn | Gnasher | Lunges and chomps three times |
| Knight | Night Mare | Leaps through the air and bites from above |
| Bishop | Hollow Prophet | Lashes a long tongue and reels the victim in |
| Rook | Siege Maw | Ground slam throws the victim up into its huge maw |
| Queen | Hydra Regina | Tentacles lift and shake the victim before eating it |
| King | Abyss King | Opens a vortex that sucks the victim in |

The victim always fights back with a snap before being eaten.

## Architecture

```
src/
  domain/        Pure chess model (chess.js for rules) with stable piece ids and domain events
  app/           GameController: input → domain moves → presentation, input locking
  rendering/     three.js presentation
    stage.ts       renderer, camera, lights, bloom, frame loop, camera flights
    board.ts       board, frame, arena, braziers, embers, square markers
    boardView.ts   one PieceView per domain piece; plays domain events as animations
    pieces/        procedural lathe pieces that split at the "mouth" into monsters
    battle/        BattleDirector: the capture cinematics
    effects/       pooled shards and sparks
    animation/     promise-based tween timeline (respects fast-forward speed)
  audio/         Web Audio procedural sound effects
  ui/            HUD overlay (DOM + CSS)
  debug/         #lab view to inspect every monster up close
```

The domain never imports three.js. `ChessGame.move()` returns events such as
`captured`, `moved`, `promoted`, `check` and `gameOver`; the presentation only
reacts to those events, so rules and visuals can evolve independently.

### Debug views

- `http://localhost:5173/#lab` — every piece type, both colours, in monster form.
- `http://localhost:5173/#lab-closed` — the same pieces in their normal form.
- `window.chess.controller.restart('<FEN>')` in the console loads any position.
- `window.chess.stage.animator.speed = 0.2` slows every animation down.

## Swapping in real 3D models later

Pieces are built in `src/rendering/pieces/pieceView.ts`. Every monster feature is a
0..1 parameter (`monster`, `mouth`, `tongueOut`, `tentacleReach`, `gait`), so a
glTF model with equivalent animations can replace the procedural one behind the
same interface without touching the battle director.

## Libraries

- [three.js](https://threejs.org) (MIT) — rendering, post-processing
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause) — move generation and rules
- [Vite](https://vitejs.dev) (MIT), [Vitest](https://vitest.dev) (MIT), TypeScript (Apache-2.0)
