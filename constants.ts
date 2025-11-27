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
  { id: 'dot', matrix: [[1]] },
  { id: 'line-2', matrix: [[1, 1]] },
  { id: 'line-3', matrix: [[1, 1, 1]] },
  { id: 'line-4', matrix: [[1, 1, 1, 1]] },
  { id: 'line-5', matrix: [[1, 1, 1, 1, 1]] },
  { id: 'square', matrix: [[1, 1], [1, 1]] },
  { id: 'l-small', matrix: [[1, 0], [1, 1]] },
  { id: 'l-big', matrix: [[1, 0, 0], [1, 1, 1]] },
  { id: 'j-big', matrix: [[0, 0, 1], [1, 1, 1]] },
  { id: 't-shape', matrix: [[0, 1, 0], [1, 1, 1]] },
  { id: 's-shape', matrix: [[0, 1, 1], [1, 1, 0]] },
  { id: 'z-shape', matrix: [[1, 1, 0], [0, 1, 1]] },
  { id: 'corner', matrix: [[1, 1], [1, 0]] },
  { id: 'diagonal-2', matrix: [[1, 0], [0, 1]] },
  { id: 'diagonal-3', matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
];
