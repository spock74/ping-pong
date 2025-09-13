import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BALL_RADIUS,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  WINNING_SCORE,
  DIFFICULTY_SETTINGS,
} from '../constants';
import type { GameStatus, Difficulty } from '../types';
import {
  playPaddleHit,
  playWallHit,
  playScoreSound,
  playGameOverSound,
  resetGameOverSoundLock,
} from '../utils/sounds';


interface GameCanvasProps {
  status: GameStatus;
  playerY: number;
  setGameStatus: (status: GameStatus) => void;
  onGameOver: (winner: 'player' | 'computer') => void;
  difficulty: Difficulty;
  onPointScored: (scorer: 'player' | 'computer') => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ status, playerY, setGameStatus, onGameOver, difficulty, onPointScored }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOverInitiated = useRef(false);
  const prevScoreRef = useRef({ player: 0, computer: 0 });
  const pointScoredRef = useRef(false); // Lock to prevent multiple scores per point

  const { paddleSpeedAI, initialBallSpeedX } = DIFFICULTY_SETTINGS[difficulty];

  const [ball, setBall] = useState({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
  const [ballSpeed, setBallSpeed] = useState({ vx: initialBallSpeedX, vy: 2 });
  const [computerY, setComputerY] = useState(GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2);
  const [score, setScore] = useState({ player: 0, computer: 0 });
  const [isReady, setIsReady] = useState(false); // New state to prevent race condition

  const resetBall = useCallback((direction: number) => {
    setBall({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
    
    // New vertical speed calculation to ensure a minimum speed
    const MIN_ABS_VY = 1.5;
    const MAX_ABS_VY = 3.5;
    let vy = Math.random() * (MAX_ABS_VY - MIN_ABS_VY) + MIN_ABS_VY;
    if (Math.random() < 0.5) {
      vy = -vy;
    }
    setBallSpeed({ vx: initialBallSpeedX * direction, vy: vy });
  }, [initialBallSpeedX]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    // Clear canvas with a retro trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Dotted center line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 15]);
    ctx.beginPath();
    ctx.moveTo(GAME_WIDTH / 2, 0);
    ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw paddles
    ctx.fillStyle = '#00ff00'; // Player paddle (green)
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ff00';
    ctx.fillRect(PADDLE_WIDTH * 2, playerY - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
    
    ctx.fillStyle = '#ff0000'; // Computer paddle (red)
    ctx.shadowColor = '#ff0000';
    ctx.fillRect(GAME_WIDTH - PADDLE_WIDTH * 3, computerY - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
    
    // Draw ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'white';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw scores
    ctx.font = '60px "Courier New", Courier, monospace';
    ctx.fillStyle = '#00ff00';
    ctx.fillText(score.player.toString(), GAME_WIDTH / 4, 70);
    ctx.fillStyle = '#ff0000';
    ctx.fillText(score.computer.toString(), (GAME_WIDTH * 3) / 4, 70);

  }, [playerY, ball, computerY, score]);

  useEffect(() => {
    if (status !== 'running') return;

    let animationFrameId: number;

    const gameLoop = () => {
      // 1. Calculate next state based on current state
      let nextBall = { x: ball.x + ballSpeed.vx, y: ball.y + ballSpeed.vy };
      let nextBallSpeed = { ...ballSpeed };

      // AI movement (based on current ball position)
      setComputerY(prevY => {
        const diff = ball.y - prevY;
        let newY = prevY;
        if (Math.abs(diff) > 10) { // Dead zone to prevent jitter
            newY = prevY + Math.sign(diff) * paddleSpeedAI;
        }
        const minPaddleY = PADDLE_HEIGHT / 2;
        const maxPaddleY = GAME_HEIGHT - PADDLE_HEIGHT / 2;
        return Math.max(minPaddleY, Math.min(newY, maxPaddleY));
      });

      // 2. Collision detection & response for walls (perfectly elastic)
      if (nextBall.y > GAME_HEIGHT - BALL_RADIUS) {
        nextBall.y = GAME_HEIGHT - BALL_RADIUS; // Clamp position to the boundary
        nextBallSpeed.vy = -nextBallSpeed.vy;
        playWallHit();
      } else if (nextBall.y < BALL_RADIUS) {
        nextBall.y = BALL_RADIUS; // Clamp position to the boundary
        nextBallSpeed.vy = -nextBallSpeed.vy;
        playWallHit();
      }
      
      // 3. Collision detection & response for paddles
      const playerPaddleTop = playerY - PADDLE_HEIGHT / 2;
      const playerPaddleBottom = playerY + PADDLE_HEIGHT / 2;
      const computerPaddleTop = computerY - PADDLE_HEIGHT / 2;
      const computerPaddleBottom = computerY + PADDLE_HEIGHT / 2;

      // Player paddle: Check if the ball is moving left and crosses the paddle's plane
      if (
        nextBallSpeed.vx < 0 &&
        nextBall.x - BALL_RADIUS <= PADDLE_WIDTH * 3 &&
        ball.x - BALL_RADIUS > PADDLE_WIDTH * 3
      ) {
        if (nextBall.y > playerPaddleTop && nextBall.y < playerPaddleBottom) {
          nextBall.x = PADDLE_WIDTH * 3 + BALL_RADIUS; // Snap to outside paddle
          const intersectY = (playerY - nextBall.y) / (PADDLE_HEIGHT / 2);
          const newVy = -intersectY * 5;
          nextBallSpeed.vx = -nextBallSpeed.vx * 1.05;
          nextBallSpeed.vy = newVy;
          playPaddleHit();
        }
      }

      // Computer paddle: Check if the ball is moving right and crosses the paddle's plane
      if (
        nextBallSpeed.vx > 0 &&
        nextBall.x + BALL_RADIUS >= GAME_WIDTH - PADDLE_WIDTH * 3 &&
        ball.x + BALL_RADIUS < GAME_WIDTH - PADDLE_WIDTH * 3
      ) {
        if (nextBall.y > computerPaddleTop && nextBall.y < computerPaddleBottom) {
           nextBall.x = GAME_WIDTH - PADDLE_WIDTH * 3 - BALL_RADIUS; // Snap to outside
           nextBallSpeed.vx = -nextBallSpeed.vx;
           playPaddleHit();
        }
      }

      // 4. Scoring
      if (nextBall.x < 0) {
        // Computer scores
        if (!pointScoredRef.current) {
          pointScoredRef.current = true;
          onPointScored('computer');
          setScore(prev => ({ ...prev, computer: prev.computer + 1 }));
          playScoreSound();
        }
      } else if (nextBall.x > GAME_WIDTH) {
        // Player scores
        if (!pointScoredRef.current) {
          pointScoredRef.current = true;
          onPointScored('player');
          setScore(prev => ({ ...prev, player: prev.player + 1 }));
          playScoreSound();
        }
      } else {
        // 5. If no score, update ball state
        setBall(nextBall);
        setBallSpeed(nextBallSpeed);
      }

      // 6. Draw the new state
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          draw(context);
        }
      }
      
      // 7. Request the next frame
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, ball, ballSpeed, playerY, computerY, draw, resetBall, paddleSpeedAI, onPointScored]);

  // Reset game state when status changes
  useEffect(() => {
    if (status === 'running') {
      gameOverInitiated.current = false;
      pointScoredRef.current = false; // Reset score lock
      resetGameOverSoundLock(); // Reset sound lock for new game
      const newScore = { player: 0, computer: 0 };
      setScore(newScore);
      prevScoreRef.current = newScore;
      resetBall(Math.random() > 0.5 ? 1 : -1);
      setIsReady(true); // Game is ready after reset
    } else {
      setIsReady(false); // Not ready if not running
    }
  }, [status, resetBall]);

  // This effect handles resetting the ball after a point is scored.
  useEffect(() => {
    if (status !== 'running' || !isReady) return;

    const justScored = score.player !== prevScoreRef.current.player || score.computer !== prevScoreRef.current.computer;
    
    if (justScored) {
        // Don't reset on the winning point. Let the game end naturally.
        if (score.player < WINNING_SCORE && score.computer < WINNING_SCORE) {
            const direction = score.player !== prevScoreRef.current.player ? -1 : 1;
            // Delay allows player to see score update and ball leave screen.
            setTimeout(() => {
              resetBall(direction);
              pointScoredRef.current = false; // Unlock scoring for the next point
            }, 300);
        }
    }
    // Update the ref for the next render.
    prevScoreRef.current = score;
  }, [score, status, resetBall, isReady]);

  // Check for winner
  useEffect(() => {
    if (status !== 'running' || !isReady || gameOverInitiated.current) {
        return;
    }

    let winner: 'player' | 'computer' | null = null;
    if (score.player >= WINNING_SCORE) {
      winner = 'player';
    } else if (score.computer >= WINNING_SCORE) {
      winner = 'computer';
    }
    
    if (winner) {
      gameOverInitiated.current = true;
      onGameOver(winner);
      playGameOverSound();
      // Brief delay to let the final score register before showing the overlay.
      // This prevents the game from feeling like it ended abruptly.
      setTimeout(() => {
          setGameStatus('over');
      }, 500);
    }
  }, [score, status, setGameStatus, onGameOver, isReady]);

  return (
    <canvas
      ref={canvasRef}
      width={GAME_WIDTH}
      height={GAME_HEIGHT}
      className="w-full h-full"
    />
  );
};

export default GameCanvas;