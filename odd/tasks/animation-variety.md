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
| T1 | S2 | inline | pending | |
| T2 | S1 | inline | pending | |
| T3 | S1, S2 | inline | pending | |
| T4 | S1, S2 | inline | pending | |
| T5 | S1, S2 | inline | pending | |
| T6 | S1, S2 | inline | pending | |

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
