import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BALL_RADIUS,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  WINNING_SCORE,
  DIFFICULTY_SETTINGS,
  INITIAL_BALL_SPEED_Y_MAX,
  INITIAL_BALL_SPEED_Y_MIN,
  PADDLE_BOUNCE_VY_MULTIPLIER,
  BALL_SPEED_INCREASE_FACTOR,
  MAX_BALL_SPEED_MULTIPLIER,
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
  calibrationStep: 'idle' | 'setting_top' | 'setting_bottom' | 'finished' | null;
  calibrationPaddleY: number;
  calibrationHoldProgress: number;
  lockedBoundaries: { top: number | null, bottom: number | null };
}

const GameCanvas: React.FC<GameCanvasProps> = ({ status, playerY, setGameStatus, onGameOver, difficulty, onPointScored, calibrationStep, calibrationPaddleY, calibrationHoldProgress, lockedBoundaries }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOverInitiated = useRef(false);
  const prevScoreRef = useRef({ player: 0, computer: 0 });
  const pointScoredRef = useRef(false); // Lock to prevent multiple scores per point
  const lastTimeRef = useRef<number>(performance.now());

  const { paddleSpeedAI, initialBallSpeedX } = DIFFICULTY_SETTINGS[difficulty];
  const maxBallSpeedX = initialBallSpeedX * MAX_BALL_SPEED_MULTIPLIER;

  const [ball, setBall] = useState({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
  const [ballSpeed, setBallSpeed] = useState({ vx: initialBallSpeedX, vy: 120 });
  const [computerY, setComputerY] = useState(GAME_HEIGHT / 2);
  const [score, setScore] = useState({ player: 0, computer: 0 });
  const [isReady, setIsReady] = useState(false); // New state to prevent race condition

  const resetBall = useCallback((direction: number) => {
    setBall({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
    
    // Vertical speed calculation using pixels-per-second constants
    let vy = Math.random() * (INITIAL_BALL_SPEED_Y_MAX - INITIAL_BALL_SPEED_Y_MIN) + INITIAL_BALL_SPEED_Y_MIN;
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

    // --- Paddle Drawing ---
    const currentPaddleY = status === 'calibrating' ? calibrationPaddleY : playerY;
    
    // Draw player paddle
    ctx.fillStyle = '#00ff00';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ff00';
    ctx.fillRect(PADDLE_WIDTH * 2, currentPaddleY - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
    
    ctx.fillStyle = '#ff0000'; // Computer paddle (red)
    ctx.shadowColor = '#ff0000';
    ctx.fillRect(GAME_WIDTH - PADDLE_WIDTH * 3, computerY - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
    
    // Draw ball (unless calibrating)
    if (status !== 'calibrating') {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'white';
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Draw scores (unless calibrating)
    if (status !== 'calibrating') {
        ctx.font = '60px "Courier New", Courier, monospace';
        ctx.fillStyle = '#00ff00';
        ctx.fillText(score.player.toString(), GAME_WIDTH / 4, 70);
        ctx.fillStyle = '#ff0000';
        ctx.fillText(score.computer.toString(), (GAME_WIDTH * 3) / 4, 70);
    }

    // --- NEW: Draw "Direct Manipulation" Calibration UI ---
    if (status === 'calibrating' && calibrationStep) {
        ctx.save();
        ctx.fillStyle = '#00ff00';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 10;
        ctx.font = '48px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        let text = '';
        if (calibrationStep === 'setting_top') {
            text = 'Toque na BORDA SUPERIOR com a raquete e SEGURE';
        } else if (calibrationStep === 'setting_bottom') {
            text = 'Ótimo! Agora toque na BORDA INFERIOR e SEGURE';
        }
        if (text) {
            ctx.fillText(text, GAME_WIDTH / 2, GAME_HEIGHT / 2);
        }
        ctx.restore();

        // Draw "hold-to-confirm" progress indicator
        if (calibrationHoldProgress > 0) {
            ctx.save();
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 8;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffff00';
            ctx.beginPath();
            ctx.arc(
                PADDLE_WIDTH * 2.5,
                currentPaddleY,
                PADDLE_HEIGHT / 2.5,
                -Math.PI / 2,
                -Math.PI / 2 + (Math.PI * 2 * calibrationHoldProgress)
            );
            ctx.stroke();
            ctx.restore();
        }

        // Draw locked boundary confirmations
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ff00';
        if (lockedBoundaries.top !== null) {
            ctx.beginPath();
            ctx.moveTo(0, 2);
            ctx.lineTo(GAME_WIDTH, 2);
            ctx.stroke();
        }
        if (lockedBoundaries.bottom !== null) {
            ctx.beginPath();
            ctx.moveTo(0, GAME_HEIGHT - 2);
            ctx.lineTo(GAME_WIDTH, GAME_HEIGHT - 2);
            ctx.stroke();
        }
        ctx.restore();
    }

  }, [playerY, ball, computerY, score, status, calibrationStep, calibrationPaddleY, calibrationHoldProgress, lockedBoundaries]);

  useEffect(() => {
    if (status !== 'running') return;

    let animationFrameId: number;

    const gameLoop = (timestamp: number) => {
      let dt = (timestamp - lastTimeRef.current) / 1000; // Delta time in seconds
      lastTimeRef.current = timestamp;

      // CRITICAL STABILITY FIX: Clamp delta time to prevent physics glitches.
      dt = Math.max(0, Math.min(dt, 0.05));
      if (dt === 0) {
        animationFrameId = requestAnimationFrame(gameLoop);
        return; // Skip update if no time has passed.
      }


      // 1. Calculate next state based on current state
      let nextBall = { 
        x: ball.x + ballSpeed.vx * dt, 
        y: ball.y + ballSpeed.vy * dt 
      };
      let nextBallSpeed = { ...ballSpeed };

      // AI movement (frame-rate independent)
      setComputerY(prevY => {
        const diff = ball.y - prevY;
        let newY = prevY;
        if (Math.abs(diff) > 10) { // Dead zone to prevent jitter
            newY = prevY + Math.sign(diff) * paddleSpeedAI * dt;
        }
        const minPaddleY = PADDLE_HEIGHT / 2;
        const maxPaddleY = GAME_HEIGHT - PADDLE_HEIGHT / 2;
        return Math.max(minPaddleY, Math.min(newY, maxPaddleY));
      });

      // 2. Collision detection & response for walls
      if (nextBall.y > GAME_HEIGHT - BALL_RADIUS) {
        nextBall.y = GAME_HEIGHT - BALL_RADIUS;
        nextBallSpeed.vy = -nextBallSpeed.vy;
        playWallHit();
      } else if (nextBall.y < BALL_RADIUS) {
        nextBall.y = BALL_RADIUS;
        nextBallSpeed.vy = -nextBallSpeed.vy;
        playWallHit();
      }
      
      // 3. Robust paddle collision detection to prevent "tunneling"
      const playerPaddleTop = playerY - PADDLE_HEIGHT / 2;
      const playerPaddleBottom = playerY + PADDLE_HEIGHT / 2;
      const computerPaddleTop = computerY - PADDLE_HEIGHT / 2;
      const computerPaddleBottom = computerY + PADDLE_HEIGHT / 2;

      // Player paddle
      const playerCollisionPlaneX = PADDLE_WIDTH * 3 + BALL_RADIUS;
      if (
        nextBallSpeed.vx < 0 && // Moving left
        nextBall.x <= playerCollisionPlaneX && // Has crossed or is on the plane
        ball.x > playerCollisionPlaneX // Was previously to the right of the plane
      ) {
        const dx = nextBall.x - ball.x;
        if (dx !== 0) {
          const dy = nextBall.y - ball.y;
          const t = (playerCollisionPlaneX - ball.x) / dx;
          const intersectionY = ball.y + dy * t;
          if (intersectionY >= playerPaddleTop && intersectionY <= playerPaddleBottom) {
            nextBall.x = playerCollisionPlaneX;
            const intersectYRatio = (playerY - intersectionY) / (PADDLE_HEIGHT / 2);
            const newVy = -intersectYRatio * PADDLE_BOUNCE_VY_MULTIPLIER;
            
            let newVx = -nextBallSpeed.vx * BALL_SPEED_INCREASE_FACTOR;
            // Cap the speed to keep the game playable
            if (Math.abs(newVx) > maxBallSpeedX) {
              newVx = Math.sign(newVx) * maxBallSpeedX;
            }
            nextBallSpeed.vx = newVx;
            nextBallSpeed.vy = newVy;
            playPaddleHit();
          }
        }
      }

      // Computer paddle
      const computerCollisionPlaneX = GAME_WIDTH - PADDLE_WIDTH * 3 - BALL_RADIUS;
      if (
        nextBallSpeed.vx > 0 && // Moving right
        nextBall.x >= computerCollisionPlaneX && // Has crossed or is on the plane
        ball.x < computerCollisionPlaneX // Was previously to the left of the plane
      ) {
        const dx = nextBall.x - ball.x;
        if (dx !== 0) {
          const dy = nextBall.y - ball.y;
          const t = (computerCollisionPlaneX - ball.x) / dx;
          const intersectionY = ball.y + dy * t;
          if (intersectionY >= computerPaddleTop && intersectionY <= computerPaddleBottom) {
            nextBall.x = computerCollisionPlaneX;

            let newVx = -nextBallSpeed.vx * BALL_SPEED_INCREASE_FACTOR;
            // Cap the speed to keep the game playable
            if (Math.abs(newVx) > maxBallSpeedX) {
                newVx = Math.sign(newVx) * maxBallSpeedX;
            }
            nextBallSpeed.vx = newVx;
            playPaddleHit();
          }
        }
      }

      // 4. Scoring
      if (nextBall.x < 0) {
        if (!pointScoredRef.current) {
          pointScoredRef.current = true;
          onPointScored('computer');
          setScore(prev => ({ ...prev, computer: prev.computer + 1 }));
          playScoreSound();
        }
      } else if (nextBall.x > GAME_WIDTH) {
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

    lastTimeRef.current = performance.now(); // Reset timer when loop starts
    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, ball, ballSpeed, playerY, computerY, draw, resetBall, paddleSpeedAI, onPointScored, maxBallSpeedX]);

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
      setComputerY(GAME_HEIGHT / 2);
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
      setTimeout(() => {
          setGameStatus('over');
      }, 500);
    }
  }, [score, status, setGameStatus, onGameOver, isReady]);
  
  // Draw initial state when not running
  useEffect(() => {
    if (status !== 'running') {
        const canvas = canvasRef.current;
        if (canvas) {
            const context = canvas.getContext('2d');
            if (context) {
                draw(context);
            }
        }
    }
  }, [status, draw, calibrationStep, calibrationPaddleY, calibrationHoldProgress, lockedBoundaries]);


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
