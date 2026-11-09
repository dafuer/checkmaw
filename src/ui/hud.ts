import type { Color, GameResult, Piece, PieceType, PromotionType } from '../domain/types';
import { CAMERA_MODES, type CameraMode } from '../rendering/cameraModes';
import { APP_NAME, type I18n } from './i18n';

const GLYPHS: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

export interface HudActions {
  onUndo(): void;
  onRestart(): void;
  onToggleCinematics(on: boolean): void;
  onToggleMarches(on: boolean): void;
  onToggleSound(on: boolean): void;
  onCameraMode(mode: CameraMode): void;
}

/** Choices the HUD starts with (restored from the player's last session). */
export interface HudSettings {
  camera: CameraMode;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** What the overlay currently shows, so it can be redrawn in another language. */
type OverlayState =
  | { kind: 'none' }
  | { kind: 'intro'; onStart: () => void }
  | { kind: 'promotion'; color: Color; resolve: (t: PromotionType) => void }
  | { kind: 'gameOver'; result: GameResult; onRestart: () => void };

/**
 * DOM overlay: status, controls, captured pieces, dialogs and cinematic bars.
 * Every visible string comes from I18n and is redrawn when the language changes.
 */
export class Hud {
  readonly root = el('div', 'hud');
  private readonly title = el('h1', 'title');
  private readonly turn = el('div', 'turn');
  private readonly status = el('div', 'status');
  private readonly capturedByWhite = el('div', 'tray');
  private readonly capturedByBlack = el('div', 'tray');
  private readonly devouredTitle = el('h2');
  private readonly movesTitle = el('h2');
  private readonly moves = el('ol', 'moves');
  private readonly hint = el('div', 'hint');
  private readonly barTop = el('div', 'bar bar-top');
  private readonly barBottom = el('div', 'bar bar-bottom');
  private readonly captionEl = el('div', 'caption');
  private readonly overlay = el('div', 'overlay hidden');
  private readonly redrawControls: Array<() => void> = [];
  private overlayState: OverlayState = { kind: 'none' };
  private turnState: { color: Color; inCheck: boolean; result: GameResult | null } = { color: 'w', inCheck: false, result: null };
  private captured: Piece[] = [];
  private captionPiece: PieceType | null = null;

  constructor(container: HTMLElement, actions: HudActions, private readonly i18n: I18n, settings: HudSettings) {
    const header = el('header', 'panel header');
    header.append(this.title, this.turn, this.status);

    const controls = el('div', 'panel controls');
    const button = (label: () => string, title: () => string, onClick: () => void) => {
      const b = el('button', 'btn');
      b.addEventListener('click', onClick);
      const redraw = () => {
        b.textContent = label();
        b.title = title();
      };
      redraw();
      this.redrawControls.push(redraw);
      controls.append(b);
      return b;
    };
    button(() => this.i18n.t.undo, () => this.i18n.t.undoTitle, () => actions.onUndo());
    button(() => this.i18n.t.newGame, () => this.i18n.t.newGameTitle, () => actions.onRestart());
    const toggle = (label: () => string, title: () => string, cb: (on: boolean) => void) => {
      let on = true;
      const b = button(
        () => `${label()}: ${on ? this.i18n.t.on : this.i18n.t.off}`,
        title,
        () => {
          on = !on;
          b.classList.toggle('off', !on);
          this.redraw();
          cb(on);
        },
      );
    };
    toggle(() => this.i18n.t.battles, () => this.i18n.t.battlesTitle, actions.onToggleCinematics);
    toggle(() => this.i18n.t.walks, () => this.i18n.t.walksTitle, actions.onToggleMarches);
    /** A button that steps through a list of values, showing the current one. */
    const cycle = <T extends string>(values: readonly T[], initial: T, label: (v: T) => string, title: () => string, cb: (v: T) => void, key?: string) => {
      let value = initial;
      const step = () => {
        value = values[(values.indexOf(value) + 1) % values.length];
        this.redraw();
        cb(value);
      };
      button(() => label(value), title, step);
      if (key) {
        window.addEventListener('keydown', (e) => {
          if (e.key.toLowerCase() === key && !e.repeat && !this.root.classList.contains('intro-mode')) step();
        });
      }
    };
    cycle(CAMERA_MODES, settings.camera, (m) => `${this.i18n.t.camera}: ${this.i18n.t.cameraModes[m]}`, () => this.i18n.t.cameraTitle, actions.onCameraMode, 'c');
    toggle(() => this.i18n.t.sound, () => this.i18n.t.soundTitle, actions.onToggleSound);
    const lang = button(
      () => `🌐 ${this.i18n.t.languageName}`,
      () => this.i18n.t.languageTitle,
      () => this.i18n.set(this.i18n.next()),
    );
    lang.classList.add('lang');

    const side = el('aside', 'panel side');
    side.append(this.devouredTitle, this.capturedByWhite, this.capturedByBlack, this.movesTitle, this.moves);

    this.root.append(header, controls, side, this.hint, this.barTop, this.barBottom, this.captionEl, this.overlay);
    container.append(this.root);
    i18n.onChange(() => this.redraw());
    this.redraw();
  }

  setTurn(color: Color, inCheck: boolean, result: GameResult | null = null): void {
    this.turnState = { color, inCheck, result };
    this.turn.dataset.color = color;
    this.status.classList.toggle('alert', inCheck);
    this.redrawTurn();
  }

  setCaptured(captured: Piece[]): void {
    this.captured = captured;
    this.redrawCaptured();
  }

  setMoves(sans: string[]): void {
    this.moves.replaceChildren();
    for (let i = 0; i < sans.length; i += 2) {
      const li = el('li');
      li.append(el('span', 'm', sans[i]), el('span', 'm', sans[i + 1] ?? ''));
      this.moves.append(li);
    }
    this.moves.scrollTop = this.moves.scrollHeight;
  }

  letterbox(on: boolean): void {
    this.root.classList.toggle('cinematic', on);
  }

  /** Shows "<piece> becomes <form>" for a transforming piece, or hides it with null. */
  announce(type: PieceType | null): void {
    this.captionPiece = type;
    this.captionEl.textContent = type ? this.i18n.becomes(type) : '';
    this.captionEl.classList.toggle('show', !!type);
  }

  askPromotion(color: Color): Promise<PromotionType> {
    return new Promise((resolve) => {
      this.overlayState = { kind: 'promotion', color, resolve };
      this.redrawOverlay();
    });
  }

  showGameOver(result: GameResult, onRestart: () => void): void {
    this.overlayState = { kind: 'gameOver', result, onRestart };
    this.redrawOverlay();
  }

  showIntro(onStart: () => void): void {
    this.overlayState = { kind: 'intro', onStart };
    this.root.classList.add('intro-mode');
    this.redrawOverlay();
  }

  hideOverlay(): void {
    this.overlayState = { kind: 'none' };
    this.redrawOverlay();
  }

  // ---------------------------------------------------------------- drawing

  private redraw(): void {
    const t = this.i18n.t;
    document.title = APP_NAME;
    this.title.textContent = APP_NAME.toUpperCase();
    this.devouredTitle.textContent = t.devoured;
    this.movesTitle.textContent = t.moves;
    this.hint.textContent = t.hint;
    for (const r of this.redrawControls) r();
    this.redrawTurn();
    this.redrawCaptured();
    if (this.captionPiece) this.captionEl.textContent = this.i18n.becomes(this.captionPiece);
    this.redrawOverlay();
  }

  private redrawTurn(): void {
    const t = this.i18n.t;
    const { color, inCheck, result } = this.turnState;
    this.turn.textContent = t.toMove[color];
    this.status.textContent = result ? t.reasons[result.reason].toUpperCase() : inCheck ? t.check : '';
  }

  private redrawCaptured(): void {
    const t = this.i18n.t;
    const render = (tray: HTMLElement, pieces: Piece[], label: string) => {
      tray.replaceChildren(el('span', 'tray-label', label));
      for (const p of pieces) tray.append(el('span', `glyph ${p.color}`, GLYPHS[p.color + p.type]));
    };
    render(this.capturedByWhite, this.captured.filter((p) => p.color === 'b'), t.ate.w);
    render(this.capturedByBlack, this.captured.filter((p) => p.color === 'w'), t.ate.b);
  }

  private redrawOverlay(): void {
    const t = this.i18n.t;
    const state = this.overlayState;
    this.overlay.replaceChildren();
    this.overlay.classList.toggle('hidden', state.kind === 'none');
    this.overlay.classList.toggle('end', state.kind === 'gameOver');
    if (state.kind !== 'intro') this.root.classList.remove('intro-mode');
    if (state.kind === 'none') return;

    const card = el('div', 'card');
    if (state.kind === 'promotion') {
      card.append(el('h2', '', t.promote));
      const row = el('div', 'promo');
      for (const type of ['q', 'r', 'b', 'n'] as PromotionType[]) {
        const b = el('button', 'promo-btn', GLYPHS[state.color + type]);
        b.title = t.piece[type];
        b.addEventListener('click', () => {
          this.hideOverlay();
          state.resolve(type);
        });
        row.append(b);
      }
      card.append(row);
    } else if (state.kind === 'gameOver') {
      const headline = state.result.winner ? t.wins[state.result.winner] : t.draw;
      card.append(el('h2', 'big', headline), el('p', '', t.reasons[state.result.reason]));
      const again = el('button', 'btn primary', t.playAgain);
      again.addEventListener('click', () => {
        this.hideOverlay();
        state.onRestart();
      });
      card.append(again);
    } else {
      card.classList.add('intro');
      card.append(el('h2', 'big', APP_NAME.toUpperCase()), el('p', '', t.introTagline));
      const start = el('button', 'btn primary', t.introStart);
      start.addEventListener('click', () => {
        this.hideOverlay();
        state.onStart();
      });
      // The intro hides the control panel, so it offers its own language switch.
      const lang = el('button', 'btn lang', `🌐 ${t.languageName}`);
      lang.title = t.languageTitle;
      lang.addEventListener('click', () => this.i18n.set(this.i18n.next()));
      const row = el('div', 'intro-actions');
      row.append(start, lang);
      card.append(row);
    }
    this.overlay.append(card);
  }
}
