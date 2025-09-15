import type { Difficulty } from './types';

// Game dimensions
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Ball properties (pixels)
export const BALL_RADIUS = 10;
export const BALL_SPEED_INCREASE_FACTOR = 1.03; // Speed multiplier on each paddle hit
export const MAX_BALL_SPEED_MULTIPLIER = 2.5;  // Max speed relative to initial speed
export const INITIAL_BALL_SPEED_Y_MIN = 90; // pixels per second
export const INITIAL_BALL_SPEED_Y_MAX = 210; // pixels per second

// Paddle properties (pixels)
export const PADDLE_WIDTH = 15;
export const PADDLE_HEIGHT = 120;
export const PADDLE_BOUNCE_VY_MULTIPLIER = 300;
export const PADDLE_SMOOTHING_FACTOR = 0.2; // Base factor for 60fps smoothing adjustment

// Game rules
export const WINNING_SCORE = 5;

// Difficulty settings (values are in pixels per second)
export const DIFFICULTY_SETTINGS: { [key in Difficulty]: { paddleSpeedAI: number, initialBallSpeedX: number } } = {
  easy: {
    paddleSpeedAI: 180,
    initialBallSpeedX: 240,
  },
  medium: {
    paddleSpeedAI: 240,
    initialBallSpeedX: 300,
  },
  hard: {
    paddleSpeedAI: 360,
    initialBallSpeedX: 420,
  },
};
