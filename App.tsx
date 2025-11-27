import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { RefreshCw, Trophy, Crown, Zap, Volume2, VolumeX, RotateCw, Hammer, Repeat, Activity, Undo2 } from 'lucide-react';
import { GRID_SIZE, SCORING, POWERUP_REWARDS, SHAPES_DATA } from './constants';
import { GameState, GameAction, Shape, Grid, DifficultyTier, DragState, HistoryState } from './types';

// --- LOGIC HELPERS ---

const rotateMatrix = (matrix: number[][]): number[][] => {
  const N = matrix.length;
  const M = matrix[0].length;
  let newMatrix = Array(M).fill(null).map(() => Array(N).fill(0));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < M; c++) {
      newMatrix[c][N - 1 - r] = matrix[r][c];
    }
  }
  return newMatrix;
};

// Generate all variants
const ALL_SHAPES: Shape[] = [];
SHAPES_DATA.forEach(shape => {
  let current = shape.matrix;
  for (let i = 0; i < 4; i++) {
    const exists = ALL_SHAPES.some(s => JSON.stringify(s.matrix) === JSON.stringify(current));
    if (!exists) {
      ALL_SHAPES.push({ ...shape, matrix: current, id: `${shape.id}-${i}` });
    }
    current = rotateMatrix(current);
  }
});

// Difficulty Tiers
const DIFFICULTY_TIERS: DifficultyTier[] = [
    { score: 0, level: 1, name: 'Easy' },
    { score: 800, level: 2, name: 'Medium' },
    { score: 2000, level: 3, name: 'Hard' },
];

const SHAPE_CATEGORIES = {
    EASY: ['dot', 'line-2', 'line-3', 'square', 'l-small', 'corner'],
    MEDIUM: ['line-4', 't-shape', 's-shape', 'z-shape'],
    HARD: ['line-5', 'l-big', 'j-big', 'diagonal-3', 'diagonal-2'],
};

const SHAPE_POOLS: Record<number, Shape[]> = {
  1: ALL_SHAPES.filter(shape => 
    SHAPE_CATEGORIES.EASY.some(id => shape.id.startsWith(id))
  ),
  2: ALL_SHAPES.filter(shape => 
    [...SHAPE_CATEGORIES.EASY, ...SHAPE_CATEGORIES.MEDIUM].some(id => shape.id.startsWith(id))
  ),
  3: ALL_SHAPES // All shapes
};

const getShapePoolByScore = (score: number) => {
    let level = 1;
    for(const tier of DIFFICULTY_TIERS) {
        if (score >= tier.score) level = tier.level;
    }
    return SHAPE_POOLS[level];
};

const canPlaceShape = (matrix: number[][], r: number, c: number, currentGrid: Grid) => {
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[0].length; j++) {
      if (matrix[i][j] === 1) {
        const gr = r + i, gc = c + j;
        if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE) return false;
        if (currentGrid[gr][gc] === 1) return false;
      }
    }
  }
  return true;
};

const checkPlayability = (shapes: Shape[], currentGrid: Grid) => {
  return shapes.some(shape => {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (canPlaceShape(shape.matrix, r, c, currentGrid)) return true;
      }
    }
    return false;
  });
};

const getPotentialClears = (gridToCheck: Grid) => {
  let rows: number[] = [], cols: number[] = [], squares: number[][] = [];
  
  for (let r = 0; r < GRID_SIZE; r++) {
    if (gridToCheck[r].every(cell => cell === 1)) rows.push(r);
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    if (gridToCheck.every(row => row[c] === 1)) cols.push(c);
  }
  
  // Cleaned up Magic Array: Dynamic Subgrid check
  for (let r = 0; r < GRID_SIZE; r += 3) {
    for (let c = 0; c < GRID_SIZE; c += 3) {
      let full = true;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (gridToCheck[r + i][c + j] === 0) full = false;
        }
      }
      if (full) squares.push([r, c]);
    }
  }

  const clearedSet = new Set<string>();
  rows.forEach(r => { for(let c=0; c<GRID_SIZE; c++) clearedSet.add(`${r},${c}`); });
  cols.forEach(c => { for(let r=0; r<GRID_SIZE; r++) clearedSet.add(`${r},${c}`); });
  squares.forEach(([r,c]) => { for(let i=0; i<3; i++) for(let j=0; j<3; j++) clearedSet.add(`${r+i},${c+j}`); });

  return { 
    count: rows.length + cols.length + squares.length, 
    clearedSet 
  };
};

const calculateScoreResult = (originalGrid: Grid, r: number, c: number, shapeMatrix: number[][], currentStreak: number) => {
  const newGrid = originalGrid.map(row => [...row]);
  let blocksPlaced = 0;

  // Place block on temp grid
  shapeMatrix.forEach((row, i) => {
    row.forEach((val, j) => {
      if (val === 1) {
        newGrid[r + i][c + j] = 1;
        blocksPlaced++;
      }
    });
  });

  const { count, clearedSet } = getPotentialClears(newGrid);

  // Base score for placement
  let points = blocksPlaced * SCORING.BLOCK_PLACED;
  let comboText: string | null = null;
  let hammerBonus = 0;

  // Calculate clear score
  if (count > 0) {
    const potentialStreak = currentStreak + 1;
    const comboMultiplier = Math.min(
      SCORING.MAX_COMBO_MULTIPLIER,
      1 + (count - 1) * SCORING.COMBO_MULTIPLIER_BASE + (potentialStreak * SCORING.STREAK_MULTIPLIER)
    );
    
    points += Math.floor(SCORING.LINE_CLEAR_BASE * count * count * comboMultiplier);

    if (count >= 4) {
      comboText = "ULTRA COMBO! 🔥";
      hammerBonus = POWERUP_REWARDS.ULTRA_CLEAR;
    } else if (count === 3) {
      comboText = "TRIPLE COMBO! ⚡";
      hammerBonus = POWERUP_REWARDS.TRIPLE_CLEAR;
    } else if (count === 2) {
      comboText = "DOUBLE CLEAR! ✨";
      hammerBonus = POWERUP_REWARDS.DOUBLE_CLEAR;
    } else if (count === 1) {
      comboText = "NICE ONE! 👍";
    }
  }

  return {
    newGrid,
    points,
    clearedSet,
    clearedCount: count,
    comboText,
    hammerBonus
  };
};

// --- AUDIO SYSTEM ---
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext && typeof window !== 'undefined') {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      audioContext = new AudioContext();
    }
  }
  return audioContext;
};

const playSound = (type: string, soundEnabled: boolean) => {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'pickup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'rotate') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'drop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'clear') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(800, now + 0.1);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) { 
    console.error('Audio error:', e); 
  }
};

// --- REDUCER ---

const loadHighScore = () => {
  try {
    const saved = localStorage.getItem('blockPuzzleHighScore');
    const parsed = parseInt(saved || '0', 10);
    return isNaN(parsed) ? 0 : parsed;
  } catch (e) {
    console.error('Failed to load high score:', e);
    return 0;
  }
};

const initialState: GameState = {
  grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0)),
  availableShapes: [],
  score: 0,
  highScore: loadHighScore(),
  gameOver: false,
  streak: 0,
  scorePop: false,
  soundEnabled: true,
  powerUps: { hammer: 1, refresh: 0 },
  activePowerUp: null, 
  comboText: null, 
  draggingShape: null, 
  ghostPosition: null, 
  previewClears: new Set(),
  previewScore: 0,
  soundEffectToPlay: null,
  history: [],
};

const createHistorySnapshot = (state: GameState): HistoryState => ({
  grid: state.grid, 
  availableShapes: state.availableShapes,
  score: state.score,
  streak: state.streak,
  powerUps: { ...state.powerUps }
});

const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'RESET_GAME':
      return {
        ...initialState,
        highScore: state.highScore,
        soundEnabled: state.soundEnabled,
        availableShapes: [],
        history: [],
      };

    case 'REFILL_SHAPES':
      return {
        ...state,
        availableShapes: action.payload,
        gameOver: false,
      };

    case 'SET_GAME_OVER':
      if (state.score > state.highScore) {
        try {
          localStorage.setItem('blockPuzzleHighScore', state.score.toString());
        } catch (e) {
          console.error('Failed to save high score:', e);
        }
      }
      return {
        ...state,
        gameOver: true,
        highScore: Math.max(state.score, state.highScore),
      };

    case 'TOGGLE_SOUND':
      return { ...state, soundEnabled: !state.soundEnabled };

    case 'ROTATE_SHAPE_IN_TRAY': {
        const { index } = action.payload;
        const shapes = [...state.availableShapes];
        const shape = shapes[index];
        const newMatrix = rotateMatrix(shape.matrix);
        shapes[index] = { ...shape, matrix: newMatrix };
        return {
            ...state,
            availableShapes: shapes,
            soundEffectToPlay: 'rotate'
        };
    }
    
    case 'ACTIVATE_POWERUP': {
        if (state.powerUps[action.payload] === 0) {
          return {
            ...state,
            comboText: 'NO POWER-UPS LEFT! 😢',
            soundEffectToPlay: 'drop'
          };
        }
        
        if (state.activePowerUp === action.payload || state.gameOver) {
            return { ...state, activePowerUp: null }; 
        }
        
        return { 
          ...state, 
          activePowerUp: action.payload, 
          draggingShape: null, 
          soundEffectToPlay: 'pickup' 
        };
    }

    case 'USE_REFRESH': {
        if (state.activePowerUp !== 'refresh' || state.powerUps.refresh <= 0) return state;

        const snapshot = createHistorySnapshot(state);
        const newHistory = [...state.history, snapshot].slice(-20);

        return {
            ...state,
            history: newHistory,
            powerUps: { ...state.powerUps, refresh: state.powerUps.refresh - 1 },
            activePowerUp: null,
            availableShapes: [], 
            soundEffectToPlay: 'drop',
            comboText: 'FRESH START!'
        };
    }
        
    case 'USE_HAMMER': {
        if (state.activePowerUp !== 'hammer' || state.powerUps.hammer <= 0) return state;
        
        const { r, c } = action.payload; 
        
        let hasFilledCells = false;
        for (let row = r - 1; row <= r + 1; row++) {
            for (let col = c - 1; col <= c + 1; col++) {
                if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
                    if (state.grid[row][col] === 1) {
                        hasFilledCells = true;
                        break;
                    }
                }
            }
            if (hasFilledCells) break;
        }
        
        if (!hasFilledCells) {
            return {
                ...state,
                activePowerUp: null,
                comboText: 'NO BLOCKS TO CLEAR! 🔨',
                soundEffectToPlay: 'drop'
            };
        }

        const snapshot = createHistorySnapshot(state);
        const newHistory = [...state.history, snapshot].slice(-20);
        
        const newGrid = state.grid.map(row => [...row]);
        const cellsCleared = new Set();

        // Clear 3x3 area
        for (let row = r - 1; row <= r + 1; row++) {
            for (let col = c - 1; col <= c + 1; col++) {
                if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
                    if (newGrid[row][col] === 1) {
                         newGrid[row][col] = 0;
                         cellsCleared.add(`${row},${col}`);
                    }
                }
            }
        }
        
        const points = cellsCleared.size * SCORING.HAMMER_CLEAR_POINTS;
        const newScore = state.score + points;

        return {
            ...state,
            history: newHistory,
            grid: newGrid,
            score: newScore,
            powerUps: { ...state.powerUps, hammer: state.powerUps.hammer - 1 },
            activePowerUp: null,
            scorePop: true,
            comboText: 'HAMMER SMASH! 🔨',
            soundEffectToPlay: 'clear',
        };
    }

    case 'START_DRAG':
      return {
        ...state,
        draggingShape: action.payload, 
        activePowerUp: null, 
        soundEffectToPlay: 'pickup',
      };

    case 'UPDATE_GHOST': {
      const { r, c, matrix } = action.payload;
      
      const { points, clearedSet } = calculateScoreResult(
        state.grid, r, c, matrix, state.streak
      );

      return {
        ...state,
        ghostPosition: { r, c },
        previewClears: clearedSet,
        previewScore: points,
      };
    }

    case 'CLEAR_GHOST':
      return {
        ...state,
        ghostPosition: null,
        previewClears: new Set(),
        previewScore: 0,
      };

    case 'PLACE_SHAPE': {
      if (!state.ghostPosition || !state.draggingShape) return state;

      const { r, c } = state.ghostPosition;
      const shape = state.draggingShape;

      // Save history before modifying state
      const snapshot = createHistorySnapshot(state);
      const newHistory = [...state.history, snapshot].slice(-20);

      const { 
        newGrid, 
        points, 
        clearedSet, 
        clearedCount, 
        comboText, 
        hammerBonus 
      } = calculateScoreResult(state.grid, r, c, shape.matrix, state.streak);
      
      // Update grid with cleared cells removed
      if (clearedSet.size > 0) {
        clearedSet.forEach(key => {
          const [cr, cc] = key.split(',').map(Number);
          newGrid[cr][cc] = 0;
        });
      }

      const newStreak = clearedCount > 0 ? state.streak + 1 : 0;
      const newPowerUps = { ...state.powerUps };
      if (hammerBonus > 0) {
        newPowerUps.hammer += hammerBonus;
      }

      const newScore = Math.floor(state.score + points);

      return {
        ...state,
        history: newHistory,
        grid: newGrid,
        score: newScore,
        streak: newStreak,
        powerUps: newPowerUps,
        availableShapes: state.availableShapes.filter(s => s.uid !== shape.uid),
        draggingShape: null,
        ghostPosition: null,
        previewClears: new Set(),
        previewScore: 0,
        scorePop: true,
        comboText: comboText,
        soundEffectToPlay: clearedCount > 0 ? 'clear' : 'drop',
      };
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);
      
      return {
        ...state,
        grid: previous.grid,
        availableShapes: previous.availableShapes,
        score: previous.score,
        streak: previous.streak,
        powerUps: previous.powerUps,
        history: newHistory,
        gameOver: false, // Ensure game over is cleared on undo
        activePowerUp: null, // Reset active powerup selection
        draggingShape: null, // Reset dragging
        ghostPosition: null,
        previewClears: new Set(),
        previewScore: 0,
        comboText: null, // Clear combo text
      };
    }

    case 'CANCEL_DRAG':
      return {
        ...state,
        draggingShape: null,
        ghostPosition: null,
        previewClears: new Set(),
        previewScore: 0,
      };
      
    case 'STOP_SCORE_POP':
      return { ...state, scorePop: false };
      
    case 'CLEAR_COMBO_TEXT':
        return { ...state, comboText: null };

    case 'CLEAR_SOUND_EFFECT':
      return { ...state, soundEffectToPlay: null };
      
    case 'SHOW_DIFFICULTY_CHANGE':
      return {
        ...state,
        comboText: action.payload,
        soundEffectToPlay: 'clear'
      };

    default:
      return state;
  }
};


// --- MAIN COMPONENT ---

const App = () => {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({ 
    start: { x: 0, y: 0 }, 
    offset: { x: 0, y: 0 },
    active: false,
    clickThreshold: false,
    startTime: 0,
    shape: null,
    index: -1
  });
  
  const lastGhostPos = useRef<string | null>(null);
  const lastUndoRef = useRef(0);

  const currentDifficulty = DIFFICULTY_TIERS.slice().reverse().find(tier => state.score >= tier.score) || DIFFICULTY_TIERS[0];
  const prevDifficulty = useRef(currentDifficulty.level);

  useEffect(() => {
    if (currentDifficulty.level > prevDifficulty.current && !state.gameOver) {
      setTimeout(() => {
        dispatch({ 
          type: 'SHOW_DIFFICULTY_CHANGE',
          payload: `DIFFICULTY: ${currentDifficulty.name.toUpperCase()}! 🔥`
        });
      }, 500);
      prevDifficulty.current = currentDifficulty.level;
    }
  }, [currentDifficulty.level, state.gameOver, currentDifficulty.name]);

  // --- EFFECT HANDLERS ---
  
  useEffect(() => {
    if (state.soundEffectToPlay) {
      playSound(state.soundEffectToPlay, state.soundEnabled);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
          if (state.soundEffectToPlay === 'clear') navigator.vibrate(20);
          else if (state.soundEffectToPlay === 'drop' || state.soundEffectToPlay === 'rotate') navigator.vibrate(5);
      }
      dispatch({ type: 'CLEAR_SOUND_EFFECT' });
    }
  }, [state.soundEffectToPlay, state.soundEnabled]);

  useEffect(() => {
    if (state.scorePop) {
      const timer = setTimeout(() => dispatch({ type: 'STOP_SCORE_POP' }), 200);
      return () => clearTimeout(timer);
    }
  }, [state.scorePop]);
  
  useEffect(() => {
    if (state.comboText) {
      const timer = setTimeout(() => dispatch({ type: 'CLEAR_COMBO_TEXT' }), 1500);
      return () => clearTimeout(timer);
    }
  }, [state.comboText]);

  // --- SHAPE GENERATION ---
  const generateShapes = useCallback((currentGrid: Grid, currentScore: number) => {
    const shapePool = getShapePoolByScore(currentScore);
    
    let newShapes: Shape[] = [];
    let isPlayable = false;
    let attempts = 0;
    
    while (!isPlayable && attempts < 50) {
        newShapes = [];
        for (let i = 0; i < 3; i++) {
            const randomShape = shapePool[Math.floor(Math.random() * shapePool.length)];
            // Fix: Robust UID generation
            newShapes.push({ ...randomShape, uid: Date.now() + Math.random() + i });
        }
        isPlayable = checkPlayability(newShapes, currentGrid);
        attempts++;
    }
    
    if (!isPlayable) {
        const dot = ALL_SHAPES.find(s => s.id.startsWith('dot'));
        // Fallback with strong ID
        if (dot && checkPlayability([{ ...dot, uid: Date.now() + Math.random() }], currentGrid)) {
          newShapes = [{ ...dot, uid: Date.now() + Math.random() }];
        } else {
          dispatch({ type: 'SET_GAME_OVER' });
          return;
        }
    }
    
    dispatch({ type: 'REFILL_SHAPES', payload: newShapes });
  }, []);

  useEffect(() => {
    if (state.gameOver) return;

    if (state.availableShapes.length === 0) {
      generateShapes(state.grid, state.score);
    } else {
      const canMove = checkPlayability(state.availableShapes, state.grid);
      if (!canMove) dispatch({ type: 'SET_GAME_OVER' });
    }
  }, [state.availableShapes, state.gameOver, state.grid, state.score, generateShapes]);

  // --- INTERACTION HANDLERS ---
  
  const getClientCoords = (e: React.TouchEvent | React.MouseEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if ('clientX' in e) return { x: e.clientX, y: e.clientY };
    return { x: 0, y: 0 };
  };

  const handlePointerDown = (e: React.PointerEvent, shape: Shape, index: number) => {
    // Resume Audio Context on interaction
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }

    if (state.activePowerUp) {
        dispatch({ type: 'ACTIVATE_POWERUP', payload: state.activePowerUp }); 
        return;
    }
    
    const coords = getClientCoords(e);
    
    // Smart Offset (Only lift for touch/mobile if detected via pointerType, simplified here)
    const isTouch = e.pointerType === 'touch';
    const offsetY = isTouch ? -70 : 0;

    dragRef.current = {
      start: coords,
      offset: { x: 0, y: offsetY }, 
      active: true,
      clickThreshold: true,
      startTime: Date.now(), 
      shape,
      index
    };
  };
  
  const handleGridClick = (e: React.MouseEvent) => {
    if (!gridRef.current || state.gameOver || state.draggingShape) return;

    if (state.activePowerUp === 'hammer') {
        const rect = gridRef.current.getBoundingClientRect();
        const cellSize = rect.width / GRID_SIZE;
        const coords = getClientCoords(e);
        
        const relX = coords.x - rect.left;
        const relY = coords.y - rect.top;
        
        const c = Math.floor(relX / cellSize);
        const r = Math.floor(relY / cellSize);
        
        dispatch({ type: 'USE_HAMMER', payload: { r, c } });
        return;
    }
  };

  const handleUndo = () => {
    const now = Date.now();
    if (now - lastUndoRef.current < 300) return; // 300ms debounce
    lastUndoRef.current = now;
    dispatch({ type: 'UNDO' });
  };

  const updateGhostLogic = useCallback((x: number, y: number, shape: Shape) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const cellSize = rect.width / GRID_SIZE;
    const matrix = shape.matrix;
    
    const relX = x - rect.left;
    const relY = y - rect.top;

    const matrixW = matrix[0].length * cellSize;
    const matrixH = matrix.length * cellSize;
    
    const col = Math.round((relX - (matrixW / 2) + (cellSize/2)) / cellSize);
    const row = Math.round((relY - (matrixH / 2) + (cellSize/2)) / cellSize);

    // Magnetic snap
    let validPos = null;
    if (canPlaceShape(matrix, row, col, state.grid)) {
        validPos = { r: row, c: col };
    } else {
        const deltas = [[0,1], [0,-1], [1,0], [-1,0]];
        for (let [dr, dc] of deltas) {
            if (canPlaceShape(matrix, row + dr, col + dc, state.grid)) {
                validPos = { r: row + dr, c: col + dc };
                break;
            }
        }
    }

    if (validPos) {
      const posKey = `${validPos.r},${validPos.c}`;
      if (lastGhostPos.current !== posKey) {
        lastGhostPos.current = posKey;
        dispatch({ type: 'UPDATE_GHOST', payload: { ...validPos, matrix } });
      }
    } else {
      if (lastGhostPos.current !== null) {
        lastGhostPos.current = null;
        dispatch({ type: 'CLEAR_GHOST' });
      }
    }
  }, [state.grid]);

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current.active) return;
      
      const coords = getClientCoords(e);
      
      const moveDist = Math.hypot(coords.x - dragRef.current.start.x, coords.y - dragRef.current.start.y);
      const timeSinceStart = Date.now() - dragRef.current.startTime;
      
      if (dragRef.current.clickThreshold && (moveDist > 15 || (moveDist > 5 && timeSinceStart > 150))) {
        dragRef.current.clickThreshold = false;
        if (!state.draggingShape && !state.activePowerUp && dragRef.current.shape) {
           dispatch({ 
             type: 'START_DRAG', 
             payload: { ...dragRef.current.shape, index: dragRef.current.index } 
           });
        }
      }

      if (!state.draggingShape || state.activePowerUp || !dragRef.current.shape) return;
      if (e.cancelable) e.preventDefault(); 

      const x = coords.x + dragRef.current.offset.x;
      const y = coords.y + dragRef.current.offset.y;
      
      const dragEl = document.getElementById('dragged-shape-layer');
      if (dragEl) dragEl.style.transform = `translate(${x}px, ${y}px)`;

      updateGhostLogic(x, y, dragRef.current.shape);
    };

    const handleUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;

      // Tap detection (rotation)
      if (dragRef.current.clickThreshold && !state.activePowerUp) {
        if (!state.gameOver) {
            dispatch({ type: 'ROTATE_SHAPE_IN_TRAY', payload: { index: dragRef.current.index } });
        }
        dispatch({ type: 'CANCEL_DRAG' });
        return;
      }

      // Drag drop
      if (state.draggingShape) {
          if (state.ghostPosition) {
            dispatch({ type: 'PLACE_SHAPE' });
          } else {
            dispatch({ type: 'CANCEL_DRAG' });
          }
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, [state.draggingShape, state.ghostPosition, state.gameOver, state.activePowerUp, updateGhostLogic]);

  // --- RENDER HELPERS ---
  const renderCell = (r: number, c: number) => {
    const cellValue = state.grid[r][c];
    
    let isGhost = false;
    if (state.ghostPosition && state.draggingShape && state.activePowerUp !== 'hammer') {
      const { r: gr, c: gc } = state.ghostPosition;
      const matrix = state.draggingShape.matrix;
      const mr = r - gr; 
      const mc = c - gc;
      if (mr >= 0 && mr < matrix.length && mc >= 0 && mc < matrix[0].length) {
          if (matrix[mr][mc] === 1) isGhost = true;
      }
    }

    const isAboutToClear = state.previewClears.has(`${r},${c}`);
    let baseClass = "transition-colors duration-200 rounded-[3px] "; 
    
    if (isAboutToClear) {
      baseClass += "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] border-2 border-cyan-200";
    } else if (cellValue === 1) {
      baseClass += "bg-blue-500 shadow-md border border-blue-400/30";
    } else if (isGhost) {
      baseClass += "bg-blue-400/40 border border-blue-300/50";
    } else {
      const isAlt = (Math.floor(r/3) + Math.floor(c/3)) % 2 === 0;
      baseClass += isAlt ? "bg-slate-800" : "bg-slate-800/80";
    }

    return (
      <div 
        key={`${r}-${c}`}
        className={baseClass}
        style={{
          marginRight: (c + 1) % 3 === 0 && c !== 8 ? '2px' : '0',
          marginBottom: (r + 1) % 3 === 0 && r !== 8 ? '2px' : '0',
        }}
      />
    );
  };
  
  const PowerUpButton = ({ type, Icon, count, compact }: { type: 'hammer' | 'refresh', Icon: any, count: number, compact?: boolean }) => {
      const isActive = state.activePowerUp === type;
      const isDisabled = count === 0 || state.gameOver;
      
      if (compact) {
        return (
          <button
              onClick={() => dispatch({ type: 'ACTIVATE_POWERUP', payload: type })}
              disabled={isDisabled}
              className={`
                  relative p-2 rounded-lg transition-all duration-150
                  ${isDisabled ? 'bg-slate-800/30 cursor-not-allowed opacity-40' : ''}
                  ${isActive ? 'bg-yellow-500 shadow-lg ring-2 ring-yellow-400/50 scale-105' : 'bg-slate-800/50 hover:bg-slate-700'}
              `}
              title={type === 'hammer' ? 'Hammer (Clear 3x3)' : 'Refresh (New shapes)'}
          >
              <Icon className={`w-4 h-4 ${isActive ? 'text-slate-900' : 'text-slate-300'}`} />
              <div className={`
                absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center 
                rounded-full text-[10px] font-bold text-white
                ${count > 0 ? 'bg-red-500' : 'bg-slate-600'}
              `}>
                  {count}
              </div>
          </button>
        );
      }
      return null;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 font-sans select-none overflow-hidden touch-none flex flex-col items-center">
      
      {/* Header */}
      <div className="w-full max-w-2xl px-4 md:px-6 pt-4 md:pt-6 pb-3 shrink-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col">
            <div className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-0.5">Score</div>
            <div className={`text-3xl md:text-4xl font-black text-white leading-none transition-transform duration-100 ${state.scorePop ? 'scale-110 text-blue-400' : 'scale-100'}`}>
              {state.score}
            </div>
          </div>
          
          {state.streak > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full border border-orange-500/30">
              <Zap size={16} className="text-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-bold text-sm">{state.streak}x</span>
            </div>
          )}
          
          <div className="flex flex-col items-end">
            <div className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-0.5 flex items-center gap-1">
              <Trophy className="w-3 h-3 text-yellow-500" />Best
            </div>
            <div className="text-2xl md:text-3xl font-bold text-slate-300 leading-none">{state.highScore}</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700">
            <Activity className="w-3.5 h-3.5 text-green-400" />
            <span className="text-sm font-bold text-green-400">{currentDifficulty.name}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <PowerUpButton 
                type="hammer" 
                Icon={Hammer} 
                count={state.powerUps.hammer} 
                compact
            />
            <PowerUpButton 
                type="refresh" 
                Icon={Repeat} 
                count={state.powerUps.refresh} 
                compact
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleUndo()}
              disabled={state.history.length === 0}
              className={`p-2 rounded-lg transition-colors ${state.history.length === 0 ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed' : 'bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white'}`}
              title="Undo last move"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button 
               onClick={() => dispatch({ type: 'TOGGLE_SOUND' })}
               className="p-2 bg-slate-800/50 rounded-lg hover:bg-slate-700 transition-colors"
            >
              {state.soundEnabled ? <Volume2 className="w-4 h-4 text-slate-400"/> : <VolumeX className="w-4 h-4 text-slate-500"/>}
            </button>
            <button 
              onClick={() => dispatch({ type: 'RESET_GAME' })}
              className="p-2 bg-blue-600/90 rounded-lg hover:bg-blue-500 active:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[min(90vw,500px)] px-4 py-4">
        <div 
          ref={gridRef}
          onClick={handleGridClick}
          className={`relative bg-slate-900 p-2 rounded-2xl shadow-2xl border-2 transition-all ${
            state.activePowerUp === 'hammer' 
              ? 'border-yellow-400 ring-4 ring-yellow-400/30 cursor-crosshair' 
              : 'border-slate-800'
          }`}
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            width: '100%',
            maxWidth: '500px',
            aspectRatio: '1/1',
            gap: '1px' 
          }}
        >
          {state.grid.map((row, r) => row.map((_, c) => renderCell(r, c)))}
          
          {state.comboText && (
             <div 
                key={state.comboText + Date.now()}
                className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
             >
               <div className={`
                 text-2xl md:text-4xl font-black px-6 py-3 rounded-2xl
                 bg-gradient-to-r text-white shadow-2xl
                 animate-in zoom-in-50 fade-in-0 duration-300
                 ${state.comboText.includes('COMBO') || state.comboText.includes('SMASH') || state.comboText.includes('DIFFICULTY') 
                   ? 'from-red-500 to-orange-500' 
                   : 'from-yellow-400 to-amber-500 text-slate-900'}
               `}>
                 {state.comboText}
               </div>
             </div>
          )}

          {state.ghostPosition && state.previewScore > 0 && state.activePowerUp !== 'hammer' && (
            <div 
                className="absolute z-20 pointer-events-none animate-in zoom-in fade-in duration-150"
                style={{
                    top: `${(state.ghostPosition.r * 100 / GRID_SIZE) + 3}%`,
                    left: `${(state.ghostPosition.c * 100 / GRID_SIZE) + 3}%`,
                }}
            >
                <div className="bg-gradient-to-br from-yellow-300 to-amber-400 text-slate-900 font-black text-xs md:text-sm px-2 py-0.5 rounded-lg shadow-lg">
                    +{state.previewScore}
                </div>
            </div>
          )}
        </div>
        
        {state.gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md" />
             <div className="relative z-10 bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 rounded-3xl p-8 max-w-sm w-full animate-in zoom-in fade-in duration-300 text-center">
                <Crown className="w-20 h-20 text-yellow-400 mb-4 mx-auto drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]" />
                <div className="text-4xl md:text-5xl font-black text-white mb-3">Game Over</div>
                <div className="text-slate-400 mb-2 text-sm font-medium">Final Score</div>
                <div className="text-5xl font-black text-white mb-8">{state.score}</div>
                {state.score === state.highScore && state.score > 0 && (
                  <div className="text-yellow-400 text-sm font-bold mb-4 animate-pulse">🏆 New High Score!</div>
                )}
                <button 
                  onClick={() => dispatch({ type: 'RESET_GAME' })}
                  className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold text-lg shadow-xl hover:shadow-blue-500/50 active:scale-95 transition-all"
                >
                  Play Again
                </button>
             </div>
          </div>
        )}
      </div>

      {/* Shapes Tray */}
      <div className="w-full max-w-2xl px-4 pb-6 md:pb-8 pt-4 shrink-0 z-10">
        <div className="flex items-center justify-center gap-3 md:gap-4">
          {state.availableShapes.map((shape, idx) => {
            const isDragging = state.draggingShape && state.draggingShape.uid === shape.uid;
            return (
              <div 
                key={shape.uid}
                className={`
                  flex-1 max-w-[140px] transition-all duration-300 
                  ${isDragging ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
                `}
                onPointerDown={(e) => handlePointerDown(e, shape, idx)}
              >
                <div className="
                  cursor-grab active:cursor-grabbing 
                  p-4 md:p-5 
                  rounded-xl 
                  hover:bg-slate-800/20
                  border border-transparent
                  hover:border-slate-700/30
                  transition-all 
                  active:scale-95 
                  aspect-square
                  flex items-center justify-center
                  relative
                  group
                ">
                  <MiniGrid matrix={shape.matrix} />
                  <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-40 transition-opacity">
                    <RotateCw className="w-3 h-3 text-slate-400" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag Layer */}
      <div 
        id="dragged-shape-layer"
        className="fixed top-0 left-0 pointer-events-none z-[100] will-change-transform"
        style={{ transform: 'translate(-1000px, -1000px)' }}
      >
        {state.draggingShape && (
           <div className="opacity-90 scale-[1.5] filter drop-shadow-2xl">
             <MiniGrid matrix={state.draggingShape.matrix} isDrag />
           </div>
        )}
      </div>
    </div>
  );
};

const MiniGrid = ({ matrix, isDrag }: { matrix: number[][], isDrag?: boolean }) => {
  return (
    <div 
      style={{ 
        display: 'grid', 
        gridTemplateRows: `repeat(${matrix.length}, 1fr)`,
        gridTemplateColumns: `repeat(${matrix[0].length}, 1fr)`,
        gap: '2px',
      }}
    >
      {matrix.map((row, r) => 
        row.map((val, c) => (
          <div 
            key={`${r}-${c}`} 
            className={`
              ${isDrag ? 'w-7 h-7' : 'w-4 h-4 md:w-5 md:h-5'} 
              rounded-sm
              transition-all
              ${val ? 'bg-blue-500 shadow-lg border-2 border-blue-400/60' : 'bg-transparent'}
            `}
          />
        ))
      )}
    </div>
  );
};

export default App;