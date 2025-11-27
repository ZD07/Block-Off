

export type Grid = (string | null)[][];

export interface Shape {
  id: string;
  matrix: number[][];
  color: string;
  uid?: number;
}

export interface DifficultyTier {
  score: number;
  level: number;
  name: string;
}

export interface DragState {
  start: { x: number; y: number };
  offset: { x: number; y: number };
  active: boolean;
  clickThreshold: boolean;
  startTime: number;
  shape: Shape | null;
  index: number;
}

export interface HistoryState {
  grid: Grid;
  availableShapes: Shape[];
  score: number;
  streak: number;
  powerUps: {
    hammer: number;
    refresh: number;
  };
  holdShape: Shape | null;
  canHold: boolean;
}

export interface FloatingText {
  id: number;
  r: number;
  c: number;
  text: string;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface GameState {
  grid: Grid;
  availableShapes: Shape[];
  holdShape: Shape | null;
  canHold: boolean;
  score: number;
  highScore: number;
  gameOver: boolean;
  streak: number;
  scorePop: boolean;
  soundEnabled: boolean;
  isPaused: boolean;
  powerUps: {
    hammer: number;
    refresh: number;
  };
  activePowerUp: 'hammer' | 'refresh' | null;
  comboText: string | null;
  difficultyModal: string | null;
  draggingShape: Shape | null;
  ghostPosition: { r: number; c: number } | null;
  previewClears: Set<string>;
  previewScore: number;
  soundEffectToPlay: { type: 'pickup' | 'drop' | 'clear' | 'rotate'; pitch?: number } | null;
  history: HistoryState[];
  placedCells: { r: number; c: number }[];
  clearedCells: { r: number; c: number }[];
  effects: FloatingText[];
}

export type GameAction =
  | { type: 'RESET_GAME' }
  | { type: 'REFILL_SHAPES'; payload: Shape[] }
  | { type: 'SET_GAME_OVER' }
  | { type: 'TOGGLE_SOUND' }
  | { type: 'ROTATE_SHAPE_IN_TRAY'; payload: { index: number } }
  | { type: 'ACTIVATE_POWERUP'; payload: 'hammer' | 'refresh' }
  | { type: 'USE_REFRESH' }
  | { type: 'USE_HAMMER'; payload: { r: number; c: number } }
  | { type: 'START_DRAG'; payload: Shape & { index: number } }
  | { type: 'UPDATE_GHOST'; payload: { r: number; c: number; matrix: number[][] } }
  | { type: 'CLEAR_GHOST' }
  | { type: 'PLACE_SHAPE' }
  | { type: 'HOLD_SHAPE' }
  | { type: 'CANCEL_DRAG' }
  | { type: 'STOP_SCORE_POP' }
  | { type: 'CLEAR_COMBO_TEXT' }
  | { type: 'CLEAR_SOUND_EFFECT' }
  | { type: 'SHOW_DIFFICULTY_CHANGE'; payload: string }
  | { type: 'CLOSE_DIFFICULTY_MODAL' }
  | { type: 'UNDO' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'RESUME_GAME' }
  | { type: 'LOAD_GAME'; payload: any }
  | { type: 'REMOVE_EFFECT'; payload: number }
  | { type: 'CLEAR_ANIMATIONS' };
