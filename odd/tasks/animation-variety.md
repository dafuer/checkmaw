Objective: richer, more impressive battle and move animations, with several pre-built variants per piece chosen at random each time.
Branch: `feat/animation-variety` (from `main` at tag `V1.0`) · Delivery: `single-pr` (unattended overnight run; user reviews in the morning) · Test runner: Vitest (`npm test`), type/build check `npm run build`.

## Specs

- S1 — Better animations: "revisas el proyecto y trates de impresionarme mejorando las animaciones".
- S2 — Not always the same: "me gustaría que no fueran siempre las mismas. Es decir, que una ficha al matar a otra (o al moverse) pudiera hacerlo cada vez de una manera (no sé, unas cuantas precalculadas y en función de un numero aleatorio elegir)."
- S3 — Tag the previous version: "me gustaría que pusieras un tag a la versión actual, antes de los cambios de fable, que sea V1.0."
- S4 — Unattended: "Me voy a la cama y quiero dejarte trabajando de manera autonoma. Mañana me levanto y lo reviso." / "recuerda que tienes acceso a chrome".

Assumptions: (A1) "unas cuantas" = at least three capture finishers and at least two move styles per piece type; (A2) the same variant is never played twice in a row for the same piece type; (A3) the tag is local only — pushing is left to the user.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T0 | S3 | inline | done (`git tag -l` shows V1.0 on 9a00242) | — |
| T1 | S2 | inline | done (variety + time-warp unit tests) | 628e58f |
| T2 | S1 | inline | done (used by every finisher; seen in Chrome) | 0fab30e, final commit |
| T3 | S1, S2 | inline | done (19 finishers; headless: each vs 6 victim types; 13 new ones inspected in Chrome) | 0fab30e, 0e0aaa1 |
| T4 | S1, S2 | inline | done (18 styles; headless per style; a few seen in Chrome, not closely) | 0e0aaa1 |
| T5 | S1, S2 | inline | done (3 reactions, 4 camera set-ups, 3 finales, finisher caption en/es) | 0e0aaa1 |
| T6 | S1, S2 | inline | done (105 tests, build OK, 82-ply random game in Chrome with 28 captures and no console errors) | final commit |

- T1 Variety picker (seedable, no immediate repeats, forceable for debugging) and animator time scale (hit-stop, slow motion). Unit tests.
- T2 Impact kit: weapon trails, dust rings, light pillars, sky blade, disintegration, dizzy stars, camera punch.
- T3 Split the battle director into a shared duel kit plus per-piece finisher catalogues; keep the six existing finishers and add new ones.
- T4 Move styles: several ways to travel per piece type.
- T5 Victim reactions, camera framings, checkmate finales and the on-screen name of the finishing move.
- T6 Headless smoke test of every attacker × victim × finisher, visual checks in Chrome, README.

Route evidence: no writer trigger (one sequential unattended session, units share the battle kit); all tasks inline.

## Log

- L1 (2026-11-10, original request): "tengo curiosidad de probar el modelo más inteligente, Fable 5.2 Para ello se me ha ocurrido que revisas el proyecto y trates de impresionarme mejorando las animaciones. Además me gustaría que no fueran siempre las mismas. Es decir, que una ficha al matar a otra (o al moverse) pudiera hacerlo cada vez de una manera (no sé, unas cuantas precalculadas y en función de un numero aleatorio elegir). Me voy a la cama y quiero dejarte trabajando de manera autonoma. Mañana me levanto y lo reviso. Además me gustaría que pusieras un tag a la versión actual, antes de los cambios de fable, que sea V1.0. Adelante (y recuerda que tienes acceso a chrome)"
- L2 (2026-11-10): Baseline: 52 tests green on `main`. RDD is off for this clone (decided earlier by the user), so no native review is run.
- L3 (2026-11-10, session cut by usage limit): Written but NOT yet wired into the game: `duelKit.ts` (shared duel beats), `finishers/{pawn,knight,bishop,rook,queen,king}.ts` (19 finishers: 6 ported + 13 new), `reactions.ts` (counter/cower/taunt), `finisherNames.ts` (catalogue of finisher, march, reaction, camera and finale names), new Fx (trail, pillar, beam, groundCrack, dizzyStars, afterimage, dissolve), `Stage.punch`, PieceView pitch/roll/twist/squash. The game still runs the old `battleDirector.ts`. Nothing new has been seen in Chrome yet. Next: rewrite `BattleDirector.battle` to use DuelKit + Variety + FINISHERS + REACTIONS (with try/finally), camera styles, march styles in Locomotion (names in MARCH_NAMES), finale variants, finisher caption (i18n en/es), headless smoke test of every attacker x victim x finisher, visual checks in Chrome, README.
- L4 (2026-11-11): Everything wired in. `BattleDirector` now picks camera, reaction and finisher from `Variety` (shuffled deck per key), wraps the duel in try/finally so a broken choreography cannot leave the game stuck, and shows the finisher's name. `Locomotion.march` picks one of three styles per piece. Console previews: `chess.duel(...)`, `chess.walk(...)`.
- L5 (2026-11-11): Verification. `npm test` 105/105 (new: variety, time warp, catalogue, every finisher x 6 victim types x rotating reactions ending at rest with no tweens/tickers/scene objects left, every move style, every finale, recovery from a throwing finisher). `npm run build` OK. Chrome (meadow scene): the 13 new finishers frame-checked at 2-5 moments each, no console errors; fixes made from what was seen: fallen victim overlapped the pawn in Timber & Slurp, "high" camera looked straight down behind the attacker, light pillars and cut glow whited out the screen, the Judgement sword was out of frame (camera now pulls back for it), the rook filled the frame. Finale "flourish" seen in the arena scene. Random game: 82 plies, 28 captures, views always matching domain pieces.
- L6 (2026-11-11): Not done / known gaps: move styles were only seen from the top-down camera and two poor angles (headless-tested, not judged for looks); the six ported finishers were not re-inspected frame by frame after the port to DuelKit (they run headless and in the random game); sounds for the new moves reuse existing effects and were not listened to; the quick (cinematics off) capture is unchanged. Tag V1.0 and the branch are local only: no push, no PR.
