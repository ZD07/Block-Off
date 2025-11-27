
export const GRID_SIZE = 9;

export const SCORING = {
  BLOCK_PLACED: 1,
  LINE_CLEAR_BASE: 10,
  HAMMER_CLEAR_POINTS: 2,
  PERFECT_CLEAR_BONUS: 200,
  COMBO_MULTIPLIER_BASE: 0.5,
  STREAK_MULTIPLIER: 0.2,
  MAX_COMBO_MULTIPLIER: 5,
};

export const POWERUP_REWARDS = {
  DOUBLE_CLEAR: 1,
  TRIPLE_CLEAR: 1,
  ULTRA_CLEAR: 2,
};

export const SHAPES_DATA = [
  { id: 'dot', matrix: [[1]], color: '#fbbf24' },      // Amber-400
  { id: 'line-2', matrix: [[1, 1]], color: '#f472b6' }, // Pink-400
  { id: 'line-3', matrix: [[1, 1, 1]], color: '#ec4899' }, // Pink-500
  { id: 'line-4', matrix: [[1, 1, 1, 1]], color: '#f87171' }, // Red-400
  { id: 'line-5', matrix: [[1, 1, 1, 1, 1]], color: '#ef4444' }, // Red-500
  { id: 'square', matrix: [[1, 1], [1, 1]], color: '#fb923c' }, // Orange-400
  { id: 'l-small', matrix: [[1, 0], [1, 1]], color: '#a78bfa' }, // Violet-400
  { id: 'l-big', matrix: [[1, 0, 0], [1, 1, 1]], color: '#8b5cf6' }, // Violet-500
  { id: 'j-big', matrix: [[0, 0, 1], [1, 1, 1]], color: '#60a5fa' }, // Blue-400
  { id: 't-shape', matrix: [[0, 1, 0], [1, 1, 1]], color: '#c084fc' }, // Purple-400
  { id: 's-shape', matrix: [[0, 1, 1], [1, 1, 0]], color: '#4ade80' }, // Green-400
  { id: 'z-shape', matrix: [[1, 1, 0], [0, 1, 1]], color: '#22c55e' }, // Green-500
  { id: 'corner', matrix: [[1, 1], [1, 0]], color: '#2dd4bf' }, // Teal-400
  { id: 'diagonal-2', matrix: [[1, 0], [0, 1]], color: '#06b6d4' }, // Cyan-500
  { id: 'diagonal-3', matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], color: '#0891b2' }, // Cyan-600
];
