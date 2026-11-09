import type { Color, GameResult, Piece, PromotionType } from '../domain/types';

const GLYPHS: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const REASONS: Record<GameResult['reason'], string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  threefold: 'Threefold repetition',
  insufficient: 'Insufficient material',
  'fifty-moves': 'Fifty-move rule',
  draw: 'Draw',
};

export interface HudActions {
  onUndo(): void;
  onRestart(): void;
  onToggleCinematics(on: boolean): void;
  onToggleMarches(on: boolean): void;
  onToggleSound(on: boolean): void;
  onToggleAutoCamera(on: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** DOM overlay: status, controls, captured pieces, dialogs and cinematic bars. */
export class Hud {
  readonly root = el('div', 'hud');
  private readonly turn = el('div', 'turn');
  private readonly status = el('div', 'status');
  private readonly capturedByWhite = el('div', 'tray');
  private readonly capturedByBlack = el('div', 'tray');
  private readonly moves = el('ol', 'moves');
  private readonly barTop = el('div', 'bar bar-top');
  private readonly barBottom = el('div', 'bar bar-bottom');
  private readonly captionEl = el('div', 'caption');
  private readonly overlay = el('div', 'overlay hidden');

  constructor(container: HTMLElement, actions: HudActions) {
    const header = el('header', 'panel header');
    header.append(el('h1', 'title', 'MONSTER CHESS'), this.turn, this.status);

    const controls = el('div', 'panel controls');
    const button = (label: string, title: string, onClick: (b: HTMLButtonElement) => void) => {
      const b = el('button', 'btn', label);
      b.title = title;
      b.addEventListener('click', () => onClick(b));
      controls.append(b);
      return b;
    };
    button('↶ Undo', 'Undo last move (U)', () => actions.onUndo());
    button('⟲ New game', 'Start a new game', () => actions.onRestart());
    const toggle = (label: string, title: string, initial: boolean, cb: (on: boolean) => void) => {
      let on = initial;
      const b = button('', title, () => {
        on = !on;
        b.textContent = `${label}: ${on ? 'on' : 'off'}`;
        b.classList.toggle('off', !on);
        cb(on);
      });
      b.textContent = `${label}: ${on ? 'on' : 'off'}`;
    };
    toggle('Battles', 'Monster battle cinematics on captures', true, actions.onToggleCinematics);
    toggle('Walks', 'Pieces transform and walk, ride or float on every move', true, actions.onToggleMarches);
    toggle('Auto camera', 'Turn the camera to the side to move', true, actions.onToggleAutoCamera);
    toggle('Sound', 'Procedural sound effects', true, actions.onToggleSound);

    const side = el('aside', 'panel side');
    side.append(el('h2', '', 'Devoured'), this.capturedByWhite, this.capturedByBlack, el('h2', '', 'Moves'), this.moves);

    const hint = el('div', 'hint', 'Click a piece, then a glowing square · Drag to orbit · Scroll to zoom · Hold SPACE to fast-forward battles');

    this.root.append(header, controls, side, hint, this.barTop, this.barBottom, this.captionEl, this.overlay);
    container.append(this.root);
  }

  setTurn(color: Color, inCheck: boolean, result: GameResult | null = null): void {
    this.turn.textContent = `${color === 'w' ? 'White' : 'Black'} to move`;
    this.turn.dataset.color = color;
    this.status.textContent = result ? REASONS[result.reason].toUpperCase() : inCheck ? 'CHECK!' : '';
    this.status.classList.toggle('alert', inCheck);
  }

  setCaptured(captured: Piece[]): void {
    const render = (tray: HTMLElement, pieces: Piece[], label: string) => {
      tray.replaceChildren(el('span', 'tray-label', label));
      for (const p of pieces) tray.append(el('span', `glyph ${p.color}`, GLYPHS[p.color + p.type]));
    };
    render(this.capturedByWhite, captured.filter((p) => p.color === 'b'), 'White ate');
    render(this.capturedByBlack, captured.filter((p) => p.color === 'w'), 'Black ate');
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

  caption(text: string | null): void {
    this.captionEl.textContent = text ?? '';
    this.captionEl.classList.toggle('show', !!text);
  }

  askPromotion(color: Color): Promise<PromotionType> {
    return new Promise((resolve) => {
      this.overlay.replaceChildren();
      const card = el('div', 'card');
      card.append(el('h2', '', 'Promote your pawn'));
      const row = el('div', 'promo');
      for (const t of ['q', 'r', 'b', 'n'] as PromotionType[]) {
        const b = el('button', 'promo-btn', GLYPHS[color + t]);
        b.addEventListener('click', () => {
          this.overlay.classList.add('hidden');
          resolve(t);
        });
        row.append(b);
      }
      card.append(row);
      this.overlay.append(card);
      this.overlay.classList.remove('hidden');
    });
  }

  showGameOver(result: GameResult, onRestart: () => void): void {
    this.overlay.replaceChildren();
    const card = el('div', 'card');
    const headline = result.winner ? `${result.winner === 'w' ? 'White' : 'Black'} wins` : 'Draw';
    card.append(el('h2', 'big', headline), el('p', '', REASONS[result.reason]));
    const again = el('button', 'btn primary', 'Play again');
    again.addEventListener('click', () => {
      this.overlay.classList.add('hidden');
      onRestart();
    });
    card.append(again);
    this.overlay.append(card);
    this.overlay.classList.add('end');
    this.overlay.classList.remove('hidden');
  }

  showIntro(onStart: () => void): void {
    this.overlay.replaceChildren();
    const card = el('div', 'card intro');
    card.append(
      el('h2', 'big', 'MONSTER CHESS'),
      el('p', '', 'Two players, one board. Every capture awakens the monster inside the piece.'),
    );
    const start = el('button', 'btn primary', 'Begin the hunt');
    start.addEventListener('click', () => {
      this.overlay.classList.add('hidden');
      this.root.classList.remove('intro-mode');
      onStart();
    });
    card.append(start);
    this.overlay.append(card);
    this.overlay.classList.remove('hidden');
    this.root.classList.add('intro-mode');
  }

  hideOverlay(): void {
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('end');
  }
}
