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
} from '../utils/sounds';


interface GameCanvasProps {
  status: GameStatus;
  playerY: number;
  setGameStatus: (status: GameStatus) => void;
  onGameOver: (winner: 'player' | 'computer') => void;
  difficulty: Difficulty;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ status, playerY, setGameStatus, onGameOver, difficulty }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameOverInitiated = useRef(false);

  const { paddleSpeedAI, initialBallSpeedX } = DIFFICULTY_SETTINGS[difficulty];

  const [ball, setBall] = useState({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
  const [ballSpeed, setBallSpeed] = useState({ vx: initialBallSpeedX, vy: 2 });
  const [computerY, setComputerY] = useState(GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2);
  const [score, setScore] = useState({ player: 0, computer: 0 });

  const resetBall = useCallback((direction: number) => {
    setBall({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
    const randomVy = Math.random() * 4 - 2; // -2 to 2
    setBallSpeed({ vx: initialBallSpeedX * direction, vy: randomVy });
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
        const newComputerScore = score.computer + 1;
        setScore(prev => ({ ...prev, computer: newComputerScore }));
        resetBall(1);
        if (newComputerScore < WINNING_SCORE) {
          playScoreSound();
        }
      } else if (nextBall.x > GAME_WIDTH) {
        const newPlayerScore = score.player + 1;
        setScore(prev => ({ ...prev, player: newPlayerScore }));
        resetBall(-1);
        if (newPlayerScore < WINNING_SCORE) {
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
  }, [status, ball, ballSpeed, playerY, computerY, score, draw, resetBall, paddleSpeedAI]);

  // Reset game state when status changes
  useEffect(() => {
    if (status === 'running') {
      gameOverInitiated.current = false;
      setScore({ player: 0, computer: 0 });
      resetBall(Math.random() > 0.5 ? 1 : -1);
    }
  }, [status, resetBall]);

  // Check for winner
  useEffect(() => {
    if (gameOverInitiated.current) {
        return;
    }

    if (score.player >= WINNING_SCORE) {
      gameOverInitiated.current = true;
      setGameStatus('over');
      onGameOver('player');
      playGameOverSound();
    } else if (score.computer >= WINNING_SCORE) {
      gameOverInitiated.current = true;
      setGameStatus('over');
      onGameOver('computer');
      playGameOverSound();
    }
  }, [score, setGameStatus, onGameOver]);

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