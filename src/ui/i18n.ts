import type { Color, GameResult, PieceType } from '../domain/types';
import type { CameraMode } from '../rendering/cameraModes';

export type Lang = 'en' | 'es';

/** Languages offered in the HUD, in cycling order. */
export const LANGS: readonly Lang[] = ['en', 'es'];

/** Game title, kept in one place until the final name is chosen. */
export const APP_NAME = 'Checkmaw';

interface Dictionary {
  languageName: string;
  languageTitle: string;
  toMove: Record<Color, string>;
  check: string;
  reasons: Record<GameResult['reason'], string>;
  wins: Record<Color, string>;
  draw: string;
  undo: string;
  undoTitle: string;
  newGame: string;
  newGameTitle: string;
  battles: string;
  battlesTitle: string;
  walks: string;
  walksTitle: string;
  camera: string;
  cameraTitle: string;
  cameraModes: Record<CameraMode, string>;
  sound: string;
  soundTitle: string;
  on: string;
  off: string;
  devoured: string;
  moves: string;
  ate: Record<Color, string>;
  hint: string;
  promote: string;
  playAgain: string;
  reviewGame: string;
  reviewStart: string;
  /** 'Move {n} of {total}' */
  reviewMove: string;
  reviewBack: string;
  reviewHint: string;
  reviewNav: { first: string; prev: string; next: string; last: string };
  introTagline: string;
  introStart: string;
  /** Piece name with its article, as the subject of the transformation caption. */
  piece: Record<PieceType, string>;
  /** What each piece turns into during a battle. */
  form: Record<PieceType, string>;
  becomes: string;
}

const DICTIONARIES: Record<Lang, Dictionary> = {
  en: {
    languageName: 'English',
    languageTitle: 'Change language',
    toMove: { w: 'White to move', b: 'Black to move' },
    check: 'CHECK!',
    reasons: {
      checkmate: 'Checkmate',
      stalemate: 'Stalemate',
      threefold: 'Threefold repetition',
      insufficient: 'Insufficient material',
      'fifty-moves': 'Fifty-move rule',
      draw: 'Draw',
    },
    wins: { w: 'White wins', b: 'Black wins' },
    draw: 'Draw',
    undo: '↶ Undo',
    undoTitle: 'Undo last move (U)',
    newGame: '⟲ New game',
    newGameTitle: 'Start a new game',
    battles: 'Battles',
    battlesTitle: 'Battle cinematics on captures',
    walks: 'Walks',
    walksTitle: 'Pieces transform and walk, ride or glide on every move',
    camera: 'Camera',
    cameraTitle: 'Change the camera view (C)',
    cameraModes: { auto: 'auto', free: 'free', top: 'top', side: 'side', corner: 'corner', orbit: 'orbit' },
    sound: 'Sound',
    soundTitle: 'Procedural sound effects',
    on: 'on',
    off: 'off',
    devoured: 'Devoured',
    moves: 'Moves',
    ate: { w: 'White ate', b: 'Black ate' },
    hint: 'Click a piece, then a glowing square · Drag to orbit · Scroll to zoom · Hold SPACE to fast-forward battles',
    promote: 'Promote your pawn',
    playAgain: 'Play again',
    reviewGame: 'Review the game',
    reviewStart: 'Starting position',
    reviewMove: 'Move {n} of {total}',
    reviewBack: 'Back to the result',
    reviewHint: '← → step through the moves · click a move in the list to jump to it',
    reviewNav: { first: 'Start (Home)', prev: 'Previous move (←)', next: 'Next move (→)', last: 'Final position (End)' },
    introTagline: 'Two players, one board. Every capture awakens what sleeps inside the pieces.',
    introStart: 'Begin the hunt',
    piece: { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' },
    form: {
      p: 'Gnasher',
      n: 'the Night Rider',
      b: 'the Grave Paladin',
      r: 'the Tower Brute',
      q: 'the Radiant Lady',
      k: 'the Sovereign',
    },
    becomes: '{piece} becomes {form}',
  },
  es: {
    languageName: 'Español',
    languageTitle: 'Cambiar idioma',
    toMove: { w: 'Juegan blancas', b: 'Juegan negras' },
    check: '¡JAQUE!',
    reasons: {
      checkmate: 'Jaque mate',
      stalemate: 'Rey ahogado',
      threefold: 'Triple repetición',
      insufficient: 'Material insuficiente',
      'fifty-moves': 'Regla de los cincuenta movimientos',
      draw: 'Tablas',
    },
    wins: { w: 'Ganan las blancas', b: 'Ganan las negras' },
    draw: 'Tablas',
    undo: '↶ Deshacer',
    undoTitle: 'Deshacer la última jugada (U)',
    newGame: '⟲ Nueva partida',
    newGameTitle: 'Empezar una partida nueva',
    battles: 'Batallas',
    battlesTitle: 'Cinemáticas de batalla en cada captura',
    walks: 'Paseos',
    walksTitle: 'Las piezas se transforman y caminan, cabalgan o se deslizan en cada jugada',
    camera: 'Cámara',
    cameraTitle: 'Cambiar la vista de la cámara (C)',
    cameraModes: { auto: 'auto', free: 'libre', top: 'cenital', side: 'lateral', corner: 'esquina', orbit: 'órbita' },
    sound: 'Sonido',
    soundTitle: 'Efectos de sonido procedurales',
    on: 'sí',
    off: 'no',
    devoured: 'Devoradas',
    moves: 'Jugadas',
    ate: { w: 'Las blancas comieron', b: 'Las negras comieron' },
    hint: 'Pulsa una pieza y luego una casilla iluminada · Arrastra para girar · Rueda para acercar · Mantén ESPACIO para acelerar las batallas',
    promote: 'Corona tu peón',
    playAgain: 'Jugar otra vez',
    reviewGame: 'Revisar la partida',
    reviewStart: 'Posición inicial',
    reviewMove: 'Jugada {n} de {total}',
    reviewBack: 'Volver al resultado',
    reviewHint: '← → para recorrer las jugadas · pulsa una jugada de la lista para saltar a ella',
    reviewNav: { first: 'Inicio (Inicio)', prev: 'Jugada anterior (←)', next: 'Jugada siguiente (→)', last: 'Posición final (Fin)' },
    introTagline: 'Dos jugadores, un tablero. Cada captura despierta lo que duerme dentro de las piezas.',
    introStart: 'Que empiece la caza',
    piece: { p: 'El peón', n: 'El caballo', b: 'El alfil', r: 'La torre', q: 'La dama', k: 'El rey' },
    form: {
      p: 'Roedientes',
      n: 'el Jinete Nocturno',
      b: 'el Paladín Sepulcral',
      r: 'el Bruto de la Torre',
      q: 'la Dama Radiante',
      k: 'el Soberano',
    },
    becomes: '{piece} se convierte en {form}',
  },
};

const STORAGE_KEY = 'chess3d.lang';

/**
 * Picks the language: a saved choice wins, otherwise the first of the system's
 * preferred languages we support (`es-ES`, `es-419`… count as Spanish), else English.
 */
export function detectLanguage(preferred: readonly string[], saved: string | null): Lang {
  if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if ((LANGS as readonly string[]).includes(base)) return base as Lang;
  }
  return 'en';
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** Current language and its strings; notifies listeners when it changes. */
export class I18n {
  lang: Lang;
  private readonly listeners = new Set<() => void>();

  constructor(lang: Lang = detectLanguage(systemLanguages(), readSaved())) {
    this.lang = lang;
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }

  get t(): Dictionary {
    return DICTIONARIES[this.lang];
  }

  set(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Private mode or blocked storage: the choice simply is not remembered.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    for (const l of this.listeners) l();
  }

  /** The next language in LANGS (the HUD button cycles through them). */
  next(): Lang {
    return LANGS[(LANGS.indexOf(this.lang) + 1) % LANGS.length];
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  becomes(type: PieceType): string {
    const t = this.t;
    return t.becomes.replace('{piece}', t.piece[type]).replace('{form}', t.form[type]);
  }
}
