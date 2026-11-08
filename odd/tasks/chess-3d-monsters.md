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

Assumption (A1): pieces and monsters are generated procedurally in code (no external model files) so the transformation piece→monster is fully controllable and license-free; external models can be swapped in later through the piece factory.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S7 | inline | done | scaffold |
| T2 | S1 | inline | pending | |
| T3 | S2, S3 | inline | pending | |
| T4 | S1 | inline | pending | |
| T5 | S3, S5 | inline | pending | |
| T6 | S4, S5 | inline | pending | |
| T7 | S3, S6 | inline | pending | |
| T8 | S1 | inline | pending | |
| T9 | S3 | inline | pending | |

- T1 Scaffold: Vite + TS + Three.js + chess.js + Vitest, hexagonal layout.
- T2 Domain: game model over chess.js with stable piece ids and domain events (moved, captured, castled, en passant, promoted, check, game over), undo. Unit tests.
- T3 3D scene: board, lighting, shadows, environment, orbit camera, turn-based camera side.
- T4 Interaction: pick piece, highlight legal targets, move, promotion picker.
- T5 Procedural piece models (6 types × 2 sides) with idle + walk animations.
- T6 Battle director: piece→monster transformation, cinematic camera, attack/devour sequences per attacker type, victim death, particles.
- T7 Procedural audio (WebAudio) — no asset files.
- T8 HUD: turn, check, captured pieces, undo, restart, game over, skip battles.
- T9 Polish: post-processing (bloom), performance, README.

Route evidence: no writer trigger (single sequential unattended session, no parallel units); all tasks inline.

## Log

- L1 (2026-11-08, original request): "estoy pensando en hacer un nuevo proyecto que consistiria en un ajedrez 3d. De momento, la idea es el tablero para que jueguen siempre dos jugadores (no hace falta que el pc juegue solo), en 3d muy potente en el que cuando pierdas una pieza se haya animaciones de batallas reales. Al más puro estilo Battle Chess, o similar. Debería correr en un navegadore así que estoy pensando en alguna librería estilo three.js . Y quiero hacerlo usando gentle AI. ¿Está disponible?"
- L2 (2026-11-08): "battle chess era un ejemplo, no quiero lo mismo. todo debe ser recursos gratuitos"
- L3 (2026-11-08): "si, desactiva la revisión por hoy." → `gentle-ai review mode disable --scope clone` executed; RDD off for this clone only. Re-enable tomorrow with `gentle-ai review mode enable --scope clone`.
- L4 (2026-11-08): "te doy permiso para descargarte algún modelo 3d chulo de las piezas por internet si lo necesitas y es gratuito. Quizá puedas empezar por algo disponible online y luego lo modificamos. Pero el 3D deberá ser flipante. Me imagino a piezas convirtiendose en monstruos para comerse las unas a las otras."
- L5: Decision A1 (procedural models) taken to avoid licence ambiguity and because the transformation effect needs per-part control.
