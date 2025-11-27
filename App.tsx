import React, { useState, useEffect, useRef, useCallback, useReducer, useLayoutEffect } from 'react';
import { RefreshCw, Trophy, Crown, Zap, Volume2, VolumeX, RotateCw, Hammer, Repeat, Activity, Undo2, Pause, Play, Home, Grid3X3, Star } from 'lucide-react';
import { GRID_SIZE, SCORING, POWERUP_REWARDS, SHAPES_DATA } from './constants';
import { GameState, GameAction, Shape, Grid, DifficultyTier, DragState, HistoryState, FloatingText, Particle } from './types';

const SAVE_KEY = 'blockPuzzleSaveState';

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

  shapeMatrix.forEach((row, i) => {
    row.forEach((val, j) => {
      if (val === 1) {
        newGrid[r + i][c + j] = 1;
        blocksPlaced++;
      }
    });
  });

  const { count, clearedSet } = getPotentialClears(newGrid);

  let points = blocksPlaced * SCORING.BLOCK_PLACED;
  let comboText: string | null = null;
  let hammerBonus = 0;

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
    const AudioCtxConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxConstructor) {
      audioContext = new AudioCtxConstructor();
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

// --- UI COMPONENTS ---

const ScoreCounter = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(value);
  
  useEffect(() => {
    if (displayValue === value) return;
    const diff = value - displayValue;
    const step = Math.ceil(diff / 10);
    
    const timer = setInterval(() => {
      setDisplayValue(prev => {
        if (Math.abs(value - prev) <= Math.abs(step)) {
          clearInterval(timer);
          return value;
        }
        return prev + step;
      });
    }, 16);
    
    return () => clearInterval(timer);
  }, [value, displayValue]);

  return <>{displayValue}</>;
};

const FloatingTextOverlay = ({ effects }: { effects: FloatingText[] }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {effects.map(effect => (
        <div
          key={effect.id}
          className="absolute animate-[float-up_1s_ease-out_forwards] font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] whitespace-nowrap"
          style={{
            left: `${(effect.c * 100 / GRID_SIZE) + 5}%`,
            top: `${(effect.r * 100 / GRID_SIZE) + 5}%`,
            fontSize: 'min(5vw, 24px)',
            color: effect.text.includes('Combo') ? '#fbbf24' : '#ffffff',
            zIndex: 40
          }}
        >
          {effect.text}
        </div>
      ))}
    </div>
  );
};

const ParticleOverlay = ({ placed, cleared }: { placed: {r: number, c: number}[], cleared: {r: number, c: number}[] }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const requestRef = useRef<number | undefined>(undefined);
  const previousTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (placed.length === 0 && cleared.length === 0) return;

    const newParticles: Particle[] = [];
    
    // Spawn dust for placement
    placed.forEach(cell => {
        for (let i = 0; i < 3; i++) {
            newParticles.push({
                id: Math.random(),
                x: (cell.c * 100 / GRID_SIZE) + 5 + (Math.random() * 8 - 4),
                y: (cell.r * 100 / GRID_SIZE) + 5 + (Math.random() * 8 - 4),
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                life: 1.0,
                color: '#60a5fa', // blue-400
                size: Math.random() * 3 + 2
            });
        }
    });

    // Spawn explosion for clears
    cleared.forEach(cell => {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 1.5;
            newParticles.push({
                id: Math.random(),
                x: (cell.c * 100 / GRID_SIZE) + 5,
                y: (cell.r * 100 / GRID_SIZE) + 5,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color: Math.random() > 0.5 ? '#ffffff' : '#fbbf24', // white or amber
                size: Math.random() * 4 + 3
            });
        }
    });

    setParticles(prev => [...prev, ...newParticles]);
  }, [placed, cleared]);

  const animate = (time: number) => {
    if (previousTimeRef.current !== undefined) {
      setParticles(prevParticles => {
        if (prevParticles.length === 0) return [];
        return prevParticles
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.05, // gravity
            life: p.life - 0.02,
            size: p.size * 0.95
          }))
          .filter(p => p.life > 0);
      });
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-2xl">
      {particles.map(p => (
        <div
            key={p.id}
            style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                opacity: p.life,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`
            }}
        />
      ))}
    </div>
  );
};

const DifficultyAnnouncement = ({ text }: { text: string | null }) => {
  if (!text) return null;
  
  // Extract level name from string if possible, or just use the text
  const levelName = text.replace('DIFFICULTY:', '').replace('!', '').trim();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
       <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-[fade-in_0.5s_ease-out]" />
       <div className="relative flex flex-col items-center justify-center animate-[difficulty-zoom_0.8s_cubic-bezier(0.22,1,0.36,1)_forwards]">
         <div className="relative">
             <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-red-500 blur-xl opacity-50 rounded-full animate-pulse" />
             <Crown className="w-24 h-24 text-yellow-400 relative z-10 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
         </div>
         <h2 className="mt-6 text-2xl font-bold text-yellow-100 uppercase tracking-widest opacity-80">Difficulty Increased</h2>
         <div className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 animate-[shine_2s_linear_infinite] bg-[length:200%_auto] drop-shadow-lg mt-2">
            {levelName}
         </div>
       </div>
    </div>
  );
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
  isPaused: false,
  streak: 0,
  scorePop: false,
  soundEnabled: true,
  powerUps: { hammer: 1, refresh: 0 },
  activePowerUp: null, 
  comboText: null, 
  difficultyModal: null,
  draggingShape: null, 
  ghostPosition: null, 
  previewClears: new Set(),
  previewScore: 0,
  soundEffectToPlay: null,
  history: [],
  placedCells: [],
  clearedCells: [],
  effects: []
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
        effects: []
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
        if (state.isPaused) return state;
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
        const newHistory = [snapshot];

        return {
            ...state,
            history: newHistory,
            powerUps: { ...state.powerUps, refresh: state.powerUps.refresh - 1 },
            activePowerUp: null,
            availableShapes: [], 
            soundEffectToPlay: 'drop',
            comboText: 'FRESH START!',
            effects: [...state.effects, { id: Date.now(), r: 4, c: 4, text: "Refresh!" }]
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
        const newHistory = [snapshot]; 
        
        const newGrid = state.grid.map(row => [...row]);
        const cellsCleared = new Set<string>();
        const clearedCoords: {r: number, c: number}[] = [];

        // Clear 3x3 area
        for (let row = r - 1; row <= r + 1; row++) {
            for (let col = c - 1; col <= c + 1; col++) {
                if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
                    if (newGrid[row][col] === 1) {
                         newGrid[row][col] = 0;
                         cellsCleared.add(`${row},${col}`);
                         clearedCoords.push({r: row, c: col});
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
            comboText: null, 
            soundEffectToPlay: 'clear',
            clearedCells: clearedCoords,
            effects: [...state.effects, { id: Date.now(), r, c, text: `+${points}` }, { id: Date.now()+1, r: Math.max(0, r-1), c, text: 'HAMMER SMASH!' }]
        };
    }

    case 'START_DRAG':
      if (state.isPaused) return state;
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
      const newHistory = [snapshot];

      const { 
        newGrid, 
        points, 
        clearedSet, 
        clearedCount, 
        comboText, 
        hammerBonus 
      } = calculateScoreResult(state.grid, r, c, shape.matrix, state.streak);
      
      const newlyPlaced: {r: number, c: number}[] = [];
      shape.matrix.forEach((row, idx) => {
          row.forEach((val, jdx) => {
              if (val === 1) newlyPlaced.push({r: r + idx, c: c + jdx});
          });
      });

      const newlyCleared: {r: number, c: number}[] = [];
      if (clearedSet.size > 0) {
        clearedSet.forEach(key => {
          const [cr, cc] = key.split(',').map(Number);
          newGrid[cr][cc] = 0;
          newlyCleared.push({r: cr, c: cc});
        });
      }

      const newStreak = clearedCount > 0 ? state.streak + 1 : 0;
      const newPowerUps = { ...state.powerUps };
      if (hammerBonus > 0) {
        newPowerUps.hammer += hammerBonus;
      }

      const newScore = Math.floor(state.score + points);
      
      const newEffects = [...state.effects, { id: Date.now(), r, c, text: `+${Math.floor(points)}` }];
      if (comboText) {
          // Use effects for combos instead of static center text
          newEffects.push({ id: Date.now() + 1, r: Math.max(0, r-1), c, text: comboText });
      }

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
        comboText: null, 
        soundEffectToPlay: clearedCount > 0 ? 'clear' : 'drop',
        placedCells: newlyPlaced,
        clearedCells: newlyCleared,
        effects: newEffects
      };
    }

    case 'UNDO': {
      if (state.history.length === 0 || state.isPaused) return state;
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
        gameOver: false,
        activePowerUp: null,
        draggingShape: null,
        ghostPosition: null,
        previewClears: new Set(),
        previewScore: 0,
        comboText: null,
        placedCells: [],
        clearedCells: [],
        effects: []
      };
    }
    
    case 'REMOVE_EFFECT':
        return {
            ...state,
            effects: state.effects.filter(e => e.id !== action.payload)
        };
        
    case 'CLEAR_ANIMATIONS':
        return {
            ...state,
            placedCells: [],
            clearedCells: []
        };

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
        difficultyModal: action.payload,
        soundEffectToPlay: 'clear'
      };

    case 'CLOSE_DIFFICULTY_MODAL':
      return { ...state, difficultyModal: null };

    case 'TOGGLE_PAUSE':
      return { 
        ...state, 
        isPaused: !state.isPaused, 
        draggingShape: null, 
        ghostPosition: null, 
        activePowerUp: null 
      };

    case 'RESUME_GAME':
      return { ...state, isPaused: false };

    case 'LOAD_GAME':
      return {
        ...action.payload,
        isPaused: false,
        draggingShape: null,
        ghostPosition: null,
        activePowerUp: null,
        scorePop: false,
        comboText: null,
        difficultyModal: null,
        soundEffectToPlay: null,
        previewClears: new Set(),
        effects: [],
        placedCells: [],
        clearedCells: [],
        history: action.payload.history || []
      };

    default:
      return state;
  }
};


// --- MAIN COMPONENT ---

const App = () => {
  const [view, setView] = useState<'home' | 'game'>('home');
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [confirmReset, setConfirmReset] = useState(false);
  
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
  
  // Tray animation refs
  const prevShapesRef = useRef<Shape[]>([]);
  const trayRef = useRef<HTMLDivElement>(null);

  const currentDifficulty = DIFFICULTY_TIERS.slice().reverse().find(tier => state.score >= tier.score) || DIFFICULTY_TIERS[0];
  const prevDifficulty = useRef(currentDifficulty.level);

  const hasSavedGame = () => {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch { return false; }
  };

  // FLIP Animation for Tray
  useLayoutEffect(() => {
    if (!trayRef.current) return;
    
    // 1. Snapshot previous positions
    const prevPositions = new Map();
    prevShapesRef.current.forEach(shape => {
        const el = document.getElementById(`shape-${shape.uid}`);
        if (el) prevPositions.set(shape.uid, el.getBoundingClientRect());
    });
    
    // 2. Browser updates DOM with new state (happens automatically before this runs)
    
    // 3. Calculate changes and apply invert transform
    state.availableShapes.forEach(shape => {
        const el = document.getElementById(`shape-${shape.uid}`);
        const prevRect = prevPositions.get(shape.uid);
        
        if (el && prevRect) {
            const currentRect = el.getBoundingClientRect();
            const deltaX = prevRect.left - currentRect.left;
            const deltaY = prevRect.top - currentRect.top;
            
            if (deltaX !== 0 || deltaY !== 0) {
                el.style.transition = 'none';
                el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                
                // 4. Play animation
                requestAnimationFrame(() => {
                    el.style.transition = 'transform 300ms cubic-bezier(0.2, 0, 0.2, 1)';
                    el.style.transform = '';
                });
            }
        }
    });
    
    prevShapesRef.current = state.availableShapes;
  }, [state.availableShapes]);


  // Auto-save effect
  useEffect(() => {
    if (view !== 'game') return;

    const saveState = () => {
        if (!state.gameOver) {
            const saveData = {
              ...state,
              history: state.history, 
              isPaused: false, 
              draggingShape: null,
              ghostPosition: null,
              previewClears: [], 
              effects: [],
              placedCells: [],
              clearedCells: [],
              scorePop: false,
              comboText: null,
              difficultyModal: null,
              soundEffectToPlay: null
            };
            try {
              localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
            } catch (e) { console.error("Save failed", e); }
        } else {
            localStorage.removeItem(SAVE_KEY);
        }
    };

    const timer = setTimeout(saveState, 500); 
    return () => clearTimeout(timer);
  }, [state, view]);
  
  // Cleanup effects
  useEffect(() => {
      if (state.placedCells.length > 0 || state.clearedCells.length > 0) {
          const timer = setTimeout(() => {
              dispatch({ type: 'CLEAR_ANIMATIONS' });
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [state.placedCells, state.clearedCells]);
  
  useEffect(() => {
      if (state.effects.length > 0) {
          const timers = state.effects.map(effect => 
             setTimeout(() => dispatch({ type: 'REMOVE_EFFECT', payload: effect.id }), 1000)
          );
          return () => timers.forEach(clearTimeout);
      }
  }, [state.effects]);

  // Difficulty Change Logic
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

  useEffect(() => {
    if (state.difficultyModal) {
      const timer = setTimeout(() => dispatch({ type: 'CLOSE_DIFFICULTY_MODAL' }), 2500);
      return () => clearTimeout(timer);
    }
  }, [state.difficultyModal]);

  // Restart confirmation timeout
  useEffect(() => {
    if (confirmReset) {
      const timer = setTimeout(() => setConfirmReset(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmReset]);

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
            newShapes.push({ ...randomShape, uid: Date.now() + Math.random() + i });
        }
        isPlayable = checkPlayability(newShapes, currentGrid);
        attempts++;
    }
    
    if (!isPlayable) {
        const dot = ALL_SHAPES.find(s => s.id.startsWith('dot'));
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
    if (state.gameOver || view !== 'game') return;

    if (state.availableShapes.length === 0) {
      generateShapes(state.grid, state.score);
    } else {
      const canMove = checkPlayability(state.availableShapes, state.grid);
      if (!canMove) dispatch({ type: 'SET_GAME_OVER' });
    }
  }, [state.availableShapes, state.gameOver, state.grid, state.score, generateShapes, view]);

  // --- INTERACTION HANDLERS ---
  
  const getClientCoords = (e: React.TouchEvent | React.MouseEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if ('clientX' in e) return { x: e.clientX, y: e.clientY };
    return { x: 0, y: 0 };
  };

  const handlePointerDown = (e: React.PointerEvent, shape: Shape, index: number) => {
    if (state.isPaused) return;

    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }

    if (state.activePowerUp) {
        dispatch({ type: 'ACTIVATE_POWERUP', payload: state.activePowerUp }); 
        return;
    }
    
    const coords = getClientCoords(e);
    
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
    if (!gridRef.current || state.gameOver || state.draggingShape || state.isPaused) return;

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

  const handleResetClick = () => {
    if (confirmReset) {
      dispatch({ type: 'RESET_GAME' });
      setConfirmReset(false);
      dispatch({ type: 'RESUME_GAME' }); // Ensure unpaused
    } else {
      setConfirmReset(true);
    }
  };

  const handleHomeClick = () => {
    setView('home');
  };

  const handleNewGame = () => {
    dispatch({ type: 'RESET_GAME' });
    setView('game');
  };

  const handleContinueGame = () => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        dispatch({ type: 'LOAD_GAME', payload: parsed });
        setView('game');
      }
    } catch (e) { console.error('Load failed', e); }
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
        if (!state.draggingShape && !state.activePowerUp && dragRef.current.shape && !state.isPaused) {
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
      if (dragRef.current.clickThreshold && !state.activePowerUp && !state.isPaused) {
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
  }, [state.draggingShape, state.ghostPosition, state.gameOver, state.activePowerUp, updateGhostLogic, state.isPaused]);

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

    const isAboutToClear = state.previewClears?.has(`${r},${c}`);
    const isJustPlaced = state.placedCells.some(cell => cell.r === r && cell.c === c);
    const isJustCleared = state.clearedCells.some(cell => cell.r === r && cell.c === c);
    
    let baseClass = "transition-colors duration-200 rounded-[3px] border "; 
    
    if (isJustCleared) {
        baseClass += "bg-white animate-clear shadow-[0_0_15px_rgba(255,255,255,0.8)] border-white";
    } else if (isJustPlaced) {
        baseClass += "bg-blue-400 animate-pop border-blue-300";
    } else if (isAboutToClear) {
      baseClass += "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] border-cyan-200";
    } else if (cellValue === 1) {
      baseClass += "bg-blue-500 shadow-md border-blue-400/30";
    } else if (isGhost) {
      baseClass += "bg-blue-400/20 border-2 border-dashed border-blue-400/60 animate-pulse";
    } else {
      const isAlt = (Math.floor(r/3) + Math.floor(c/3)) % 2 === 0;
      baseClass += (isAlt ? "bg-slate-800" : "bg-slate-800/80") + " border-transparent";
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
      const isDisabled = count === 0 || state.gameOver || state.isPaused;
      
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

  // --- VIEW RENDERING ---

  if (view === 'home') {
    return (
      <div className="fixed inset-0 bg-slate-950 text-slate-100 font-sans flex flex-col items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        <div className="w-full max-w-md space-y-8 text-center animate-in fade-in zoom-in duration-500">
          <div className="space-y-2">
            <div className="flex justify-center mb-6">
              <div className="relative">
                 <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-30 animate-pulse rounded-full" />
                 <Grid3X3 className="w-20 h-20 text-blue-500 relative z-10" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-200 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
              BLOCK SUDOKU
            </h1>
            <p className="text-slate-400 text-lg">Master the grid.</p>
          </div>

          <div className="flex flex-col gap-4 max-w-xs mx-auto w-full pt-8">
            {hasSavedGame() && (
              <button
                onClick={handleContinueGame}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 border border-blue-400/20"
              >
                <Play className="w-6 h-6 fill-current" />
                Continue Game
              </button>
            )}
            
            <button
              onClick={handleNewGame}
              className={`w-full py-4 rounded-xl font-bold text-lg border transition-all flex items-center justify-center gap-3 ${
                  !hasSavedGame() 
                    ? 'bg-blue-600 hover:bg-blue-500 border-none text-white shadow-lg shadow-blue-500/20 active:scale-95' 
                    : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-slate-300 active:scale-95'
              }`}
            >
              {hasSavedGame() ? 'New Game' : <><Play className="w-6 h-6 fill-current" /> New Game</>}
            </button>
          </div>

          <div className="pt-8 flex flex-col items-center">
            <div className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-2">High Score</div>
            <div className="text-3xl font-black text-white flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
              {state.highScore}
            </div>
          </div>
          
          <button 
             onClick={() => dispatch({ type: 'TOGGLE_SOUND' })}
             className="absolute bottom-8 right-8 p-3 bg-slate-800/50 rounded-full hover:bg-slate-700 transition-colors text-slate-400 border border-slate-700/50"
          >
            {state.soundEnabled ? <Volume2 className="w-5 h-5"/> : <VolumeX className="w-5 h-5"/>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 font-sans select-none overflow-hidden touch-none flex flex-col items-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/50 via-slate-950 to-slate-950">
      
      {/* Header */}
      <div className="w-full max-w-2xl px-4 md:px-6 pt-4 md:pt-6 pb-3 shrink-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col">
            <div className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-0.5">Score</div>
            <div className={`text-3xl md:text-4xl font-black text-white leading-none transition-transform duration-100 ${state.scorePop ? 'scale-110 text-blue-400' : 'scale-100'}`}>
              <ScoreCounter value={state.score} />
            </div>
          </div>
          
          {state.streak > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full border border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.1)]">
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
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
              currentDifficulty.level > 1 
                ? 'bg-slate-800/80 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                : 'bg-slate-800/50 border-slate-700'
          }`}>
            <Activity className={`w-3.5 h-3.5 ${currentDifficulty.level > 1 ? 'text-blue-400' : 'text-green-400'}`} />
            <span className={`text-sm font-bold ${currentDifficulty.level > 1 ? 'text-blue-400' : 'text-green-400'}`}>{currentDifficulty.name}</span>
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
              disabled={state.history.length === 0 || state.isPaused}
              className={`p-2 rounded-lg transition-colors ${state.history.length === 0 || state.isPaused ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed' : 'bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white'}`}
              title="Undo last move"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button 
               onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}
               className={`p-2 rounded-lg transition-colors ${state.isPaused ? 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/20' : 'bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white'}`}
            >
              {state.isPaused ? <Play className="w-4 h-4 fill-current"/> : <Pause className="w-4 h-4 fill-current"/>}
            </button>
            <button 
              onClick={handleResetClick}
              disabled={state.isPaused}
              className={`p-2 rounded-lg transition-colors duration-200 ${state.isPaused ? 'bg-slate-800/30 opacity-50' : (confirmReset ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20' : 'bg-blue-600/90 hover:bg-blue-500 active:bg-blue-700')}`}
              title={confirmReset ? "Click again to confirm" : "Restart Game"}
            >
              <RefreshCw className={`w-4 h-4 text-white ${confirmReset ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[min(90vw,500px)] px-4 py-4 relative">
        <div 
          ref={gridRef}
          onClick={handleGridClick}
          className={`relative bg-slate-900/80 backdrop-blur-sm p-2 rounded-2xl shadow-2xl border-2 transition-all ${
            state.activePowerUp === 'hammer' && !state.isPaused
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
          
          <FloatingTextOverlay effects={state.effects} />
          <ParticleOverlay placed={state.placedCells} cleared={state.clearedCells} />

          {/* Difficulty Announcement Modal */}
          <DifficultyAnnouncement text={state.difficultyModal} />

          {/* Pause Overlay */}
          {state.isPaused && (
             <div className="absolute inset-0 z-40 bg-slate-950/60 backdrop-blur-md rounded-xl flex flex-col items-center justify-center animate-in fade-in duration-200">
               <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-2xl flex flex-col gap-3 w-48">
                 <div className="text-center font-bold text-white text-xl mb-2">Paused</div>
                 <button 
                    onClick={() => dispatch({ type: 'RESUME_GAME' })}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-blue-500/20"
                 >
                   <Play className="w-4 h-4 fill-current" /> Resume
                 </button>
                 <button 
                    onClick={handleResetClick}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
                 >
                   <RefreshCw className="w-4 h-4" /> Restart
                 </button>
                 <button 
                    onClick={handleHomeClick}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
                 >
                   <Home className="w-4 h-4" /> Home
                 </button>
               </div>
             </div>
          )}

          {state.comboText && (
             <div 
                key={state.comboText + Date.now()}
                className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
             >
               <div className={`
                 text-2xl md:text-4xl font-black px-6 py-3 rounded-2xl
                 bg-gradient-to-r text-white shadow-2xl
                 animate-in zoom-in-50 fade-in-0 duration-300
                 ${state.comboText.includes('COMBO') || state.comboText.includes('SMASH') 
                   ? 'from-red-500 to-orange-500' 
                   : 'from-yellow-400 to-amber-500 text-slate-900'}
               `}>
                 {state.comboText}
               </div>
             </div>
          )}

          {state.ghostPosition && state.previewScore > 0 && state.activePowerUp !== 'hammer' && !state.isPaused && (
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
             <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" />
             <div className="relative z-10 bg-slate-800/80 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 max-w-sm w-full animate-in zoom-in fade-in duration-300 text-center shadow-2xl">
                <div className="relative inline-block">
                    <div className="absolute inset-0 bg-yellow-400 blur-2xl opacity-20 rounded-full" />
                    <Crown className="w-20 h-20 text-yellow-400 mb-4 mx-auto relative z-10 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                </div>
                <div className="text-4xl md:text-5xl font-black text-white mb-3">Game Over</div>
                <div className="text-slate-400 mb-2 text-sm font-medium uppercase tracking-wider">Final Score</div>
                <div className="text-5xl font-black text-white mb-8">{state.score}</div>
                {state.score === state.highScore && state.score > 0 && (
                  <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm font-bold mb-6 animate-pulse bg-yellow-400/10 py-2 px-4 rounded-full">
                      <Star className="w-4 h-4 fill-current" />
                      New High Score!
                  </div>
                )}
                <button 
                  onClick={() => dispatch({ type: 'RESET_GAME' })}
                  className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold text-lg shadow-xl shadow-blue-500/20 active:scale-95 transition-all mb-3 border border-blue-400/20"
                >
                  Play Again
                </button>
                <button 
                  onClick={handleHomeClick}
                  className="w-full px-8 py-3 bg-slate-700/50 text-white rounded-xl font-bold text-lg hover:bg-slate-700 transition-all border border-slate-600/50"
                >
                  Main Menu
                </button>
             </div>
          </div>
        )}
      </div>

      {/* Shapes Tray */}
      <div 
        ref={trayRef}
        className={`w-full max-w-2xl px-4 pb-6 md:pb-8 pt-4 shrink-0 z-10 min-h-[160px] flex items-center transition-opacity duration-300 ${state.isPaused ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
      >
        <div className="flex items-center justify-center gap-3 md:gap-4 w-full">
          {state.availableShapes.map((shape, idx) => {
            const isDragging = state.draggingShape && state.draggingShape.uid === shape.uid;
            return (
              <div 
                id={`shape-${shape.uid}`}
                key={shape.uid}
                className={`
                  flex-1 max-w-[140px] transition-all duration-300 
                  ${isDragging ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
                  animate-enter
                `}
                style={{ animationDelay: `${idx * 100}ms` }}
                onPointerDown={(e) => handlePointerDown(e, shape, idx)}
              >
                <div className="
                  cursor-grab active:cursor-grabbing 
                  p-4 md:p-5 
                  rounded-xl 
                  hover:bg-slate-800/40
                  border border-transparent
                  hover:border-slate-700/50
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
           <div className="opacity-95 scale-110 -rotate-12 drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)] transition-all duration-200 ease-out">
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