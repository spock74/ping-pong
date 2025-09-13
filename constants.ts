import type { Difficulty } from './types';

// Game dimensions
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Ball properties
export const BALL_RADIUS = 10;

// Paddle properties
export const PADDLE_WIDTH = 15;
export const PADDLE_HEIGHT = 120;

// Game rules
export const WINNING_SCORE = 5;

// Difficulty settings
export const DIFFICULTY_SETTINGS: { [key in Difficulty]: { paddleSpeedAI: number, initialBallSpeedX: number } } = {
  easy: {
    paddleSpeedAI: 3,
    initialBallSpeedX: 4,
  },
  medium: {
    paddleSpeedAI: 4,
    initialBallSpeedX: 5,
  },
  hard: {
    paddleSpeedAI: 6,
    initialBallSpeedX: 7,
  },
};
