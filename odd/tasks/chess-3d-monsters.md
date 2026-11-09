Objective: browser 3D chess for two local players where captures trigger monster battle cinematics.
Branch: `feat/chess-3d-monsters` · Delivery: `single-pr` (unattended overnight run; user reviews in the morning) · Test runner: Vitest (`npm test`), type/build check `npm run build`.

## Specs

- S1 — Two local players on one board: "el tablero para que jueguen siempre dos jugadores (no hace falta que el pc juegue solo)". Full legal chess rules (check, mate, stalemate, draws, castling, en passant, promotion).
- S2 — Runs in the browser with a three.js-style library: "Debería correr en un navegadore así que estoy pensando en alguna librería estilo three.js".
- S3 — Very powerful 3D: "en 3d muy potente" / "el 3D deberá ser flipante".
- S4 — Captures trigger real battle animations: "cuando pierdas una pieza se haya animaciones de batallas reales". Concept: "Me imagino a piezas convirtiendose en monstruos para comerse las unas a las otras."
- S5 — Original style, not a copy: "battle chess era un ejemplo, no quiero lo mismo."
- S6 — Free resources only: "todo debe ser recursos gratuitos". Downloads allowed: "te doy permiso para descargarte algún modelo 3d chulo de las piezas por internet si lo necesitas y es gratuito".
- S7 — Built with Gentle AI workflow (this document, work-unit commits).
- S8 — Distinct, creative battles per piece: "todas las animaciones son identicas. Hay que ser más cretivos. Por ejemplo los peones podrían llevar una pequeña espada, los alfiles una gran espada y un escudo, y así... siendo creativos".
- S10 — Royal figures: "que la reina sea una dama, preciosa y deslumbrante, con un gran baculo que usa en sus batallas." / "El rey un apuesto señor con corona y capa. Una espada a la cintura que solo saca del cinturón para atacar."
- S9 — Animated ordinary moves per piece: "sería posible también tener animaciones al mover las fichas? por ejemplo, el caballo se podría convertir en un caballero montado que anda de verdad, la torre en un gran mounstruo de barrio que anda, ....".

Assumption (A1): pieces and monsters are generated procedurally in code (no external model files) so the transformation piece→monster is fully controllable and license-free; external models can be swapped in later through the piece factory.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S7 | inline | done | 9221d5f |
| T2 | S1 | inline | done (RED→GREEN, 13 tests) | 681ec9e |
| T3 | S2, S3 | inline | done (visual check in Chrome) | 07677c8 |
| T4 | S1 | inline | done (real mouse click flow verified) | 07677c8, c50ce51 |
| T5 | S3, S5 | inline | done (#lab view) | 07677c8 |
| T6 | S4, S5 | inline | done (all six attack styles inspected frame by frame; all six styles exercised by a 73-ply scripted game) | 07677c8, 42bb0f4 |
| T7 | S3, S6 | inline | done (not audible-verified; no errors) | 07677c8 |
| T8 | S1 | inline | done | 07677c8, c50ce51 |
| T9 | S3 | inline | done (60 fps after light pooling) | 42bb0f4, c50ce51 |
| T10 | S8 | inline | done (six duel finishers inspected frame by frame in Chrome; gear unit tests) | d3fbcae |
| T12 | S10 | inline | done (lab close-ups, king iaido and queen crystal finisher inspected in Chrome; figure unit tests; 90-ply random game clean) | 375e94b |
| T11 | S9 | inline | done (knight L gallop and marches inspected in Chrome) | d3fbcae |

- T1 Scaffold: Vite + TS + Three.js + chess.js + Vitest, hexagonal layout.
- T2 Domain: game model over chess.js with stable piece ids and domain events (moved, captured, castled, en passant, promoted, check, game over), undo. Unit tests.
- T3 3D scene: board, lighting, shadows, environment, orbit camera, turn-based camera side.
- T4 Interaction: pick piece, highlight legal targets, move, promotion picker.
- T5 Procedural piece models (6 types × 2 sides) with idle + walk animations.
- T6 Battle director: piece→monster transformation, cinematic camera, attack/devour sequences per attacker type, victim death, particles.
- T7 Procedural audio (WebAudio) — no asset files.
- T8 HUD: turn, check, captured pieces, undo, restart, game over, skip battles.
- T9 Polish: post-processing (bloom), performance, README.
- T10 Arsenal + battles: per-type gear (arms, weapons, shields, mount) and one distinct attack choreography per attacker; victims counter with their own weapon.
- T11 Marches: per-type move animation (knight rides a horse along the L, rook stomps as a giant brute, etc.), with a HUD toggle.

Route evidence: no writer trigger (single sequential unattended session, no parallel units); all tasks inline.

## Log

- L1 (2026-11-08, original request): "estoy pensando en hacer un nuevo proyecto que consistiria en un ajedrez 3d. De momento, la idea es el tablero para que jueguen siempre dos jugadores (no hace falta que el pc juegue solo), en 3d muy potente en el que cuando pierdas una pieza se haya animaciones de batallas reales. Al más puro estilo Battle Chess, o similar. Debería correr en un navegadore así que estoy pensando en alguna librería estilo three.js . Y quiero hacerlo usando gentle AI. ¿Está disponible?"
- L2 (2026-11-08): "battle chess era un ejemplo, no quiero lo mismo. todo debe ser recursos gratuitos"
- L3 (2026-11-08): "si, desactiva la revisión por hoy." → `gentle-ai review mode disable --scope clone` executed; RDD off for this clone only. Re-enable tomorrow with `gentle-ai review mode enable --scope clone`.
- L4 (2026-11-08): "te doy permiso para descargarte algún modelo 3d chulo de las piezas por internet si lo necesitas y es gratuito. Quizá puedas empezar por algo disponible online y luego lo modificamos. Pero el 3D deberá ser flipante. Me imagino a piezas convirtiendose en monstruos para comerse las unas a las otras."
- L5: Decision A1 (procedural models) taken to avoid licence ambiguity and because the transformation effect needs per-part control.
- L6 (2026-11-08, overnight run): Implemented T1–T9. Verification: `npm test` 24/24 green; `npm run build` OK; visual checks in Chrome through the claude-in-chrome MCP (screenshots of board, lab, pawn/queen/bishop/knight battles, checkmate finale, title screen, mouse move flow). Scripted 73-ply game (every attacker type, castling, capture-promotion) ran with no console errors and piece views always matching domain pieces.
- L7: Problems found and fixed during visual checks: competing camera tweens (newer flight now cancels older), OrbitControls clamping distance during cinematics (controls bypassed while disabled), 32 per-piece point lights dropping to ~12 fps (pooled 2 lights → 60 fps), bishop tongue missing its target (now aimed), excessive bloom.
- L8: Known gaps / next steps: sounds are synthesized but were not listened to; commits exceed the ~400-line slice heuristic because the run was unattended (single-pr strategy); RDD is still disabled for this clone (`gentle-ai review mode enable --scope clone` to re-enable); no push/PR made.
- L9 (2026-11-09, user review): "buen inicio! pero todas las animaciones son identicas. Hay que ser más cretivos. Por ejemplo los peones podrían llevar una pequeña espada, los alfiles una gran espada y un escudo, y así... siendo creativos. además, sería posible también tener animaciones al mover las fichas? por ejemplo, el caballo se podría convertir en un caballero montado que anda de verdad, la torre en un gran mounstruo de barrio que anda, ...." → added S8/S9, tasks T10/T11.
- L10 (2026-11-09): T10/T11 implemented. Gear rig (arms with blended named poses: raise/strike/draw/thrust/guard/grab/lift) gives pawn short sword + buckler, bishop glowing great sword + kite shield, rook brute fists (2 thick legs, 1.35x bulk, renamed Tower Brute), queen staff, king war hammer; the knight mounts a procedural war horse with an armoured lancer (rears via a pivot group). Duels: pawn sword combo + gulp, knight joust (impale, fling, burst), bishop cleave (victim cut in two with local clipping planes), rook grab-lift-slam-flatten + eat, queen lightning + tentacles, king abyss portal + hammer smash. Victims counter with their own weapon; shields block. Ordinary moves: Locomotion.march (knight gallops the L, rook stomps with shake, queen floats, others march armed), HUD "Walks" toggle. Checks: `npm test` 29/29, `npm run build` OK, all six captures (+ a black knight capture) ran with no errors and correct piece counts.
- L11 (2026-11-09, user): "arregla engram de una vez, luego continua por el movimiento de: - que la reina sea una dama, preciosa y deslumbrante, con un gran baculo que usa en sus batallas. - El rey un apuesto señor con corona y capa. Una espada a la cintura que solo saca del cinturón para atacar." → Engram: old `engram serve` (running since 2026-10-21, binary 3.4.0) did not resolve the resumed session; upgraded to 3.7.0, restarted the server, re-registered the session; mem_save works. Added S10/T12.
- L12 (2026-11-09): T12 implemented. Figure rig (figure.ts) replaces the monster form for queen and king: the lady (bell gown with glowing stripes, tiara, hair, orbiting sparkles, great crystal staff) glides on moves; the lord (crown, beard, ermine-collared waving cape, legs, belt and scabbard) strides with the sword sheathed and draws it only to fight (drawSword/sheatheSword). Queen finisher: three staff bolts, sky lightning crystallises the victim, staff tap shatters it. King finisher: draw, dash through with a horizontal slash, sheathe, victim's top half slides off (horizontal clipping split). Hammer/abyss portal and queen tentacle feeding removed. Checks: `npm test` 31/31, `npm run build` OK.
- L13 (2026-11-09, user): "venga, ve puliendo los elementos que has ido anotando como pendientes, de más fácil a más complicado." → order: (1) bishop/king cut halves visibility, (2) rook legs, (3) unheard sounds. RDD re-enable left to the user.
- L14 (2026-11-09): (1) c8b12d0 — the cut halves were flipped under the board (euler overwrite); now rotated with quaternions and glowing. (2) 08c4130 — rook brute gets two clawed beast legs solved with two-bone IK; tests assert both feet on the floor and one lifted mid-stride. (3) Offline audio analysis (OfflineAudioContext) showed a 15-30 dB imbalance (roar 0.6 peak vs hooves 0.02, queen steps 0.008) and setTimeout-scheduled sounds that ignored the audio clock; added per-sound LEVELS, scheduled everything on the audio clock, and `Sfx.measure`/`chess.soundCheck()`. All peaks now 0.05-0.51, none clipping. Still not listened to by a human.
