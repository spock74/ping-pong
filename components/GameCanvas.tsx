import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BALL_RADIUS,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_SPEED_AI,
  WINNING_SCORE,
  INITIAL_BALL_SPEED_X,
} from '../constants';
import type { GameStatus } from '../types';

interface GameCanvasProps {
  status: GameStatus;
  playerY: number;
  setGameStatus: (status: GameStatus) => void;
  onGameOver: (winner: 'player' | 'computer') => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ status, playerY, setGameStatus, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ball, setBall] = useState({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
  const [ballSpeed, setBallSpeed] = useState({ vx: INITIAL_BALL_SPEED_X, vy: 2 });
  const [computerY, setComputerY] = useState(GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2);
  const [score, setScore] = useState({ player: 0, computer: 0 });

  const resetBall = useCallback((direction: number) => {
    setBall({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
    const randomVy = Math.random() * 4 - 2; // -2 to 2
    setBallSpeed({ vx: INITIAL_BALL_SPEED_X * direction, vy: randomVy });
  }, []);

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
    
    ctx.fillStyle = '#33cc33'; // Computer paddle (dimmer green)
    ctx.shadowColor = '#33cc33';
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
    ctx.fillStyle = '#33cc33';
    ctx.fillText(score.computer.toString(), (GAME_WIDTH * 3) / 4, 70);

  }, [playerY, ball, computerY, score]);

  useEffect(() => {
    if (status !== 'running') return;

    let animationFrameId: number;

    const gameLoop = () => {
      // Update logic
      setBall(prevBall => ({ x: prevBall.x + ballSpeed.vx, y: prevBall.y + ballSpeed.vy }));
      
      // AI movement
      setComputerY(prevY => {
        const paddleCenter = prevY;
        const diff = ball.y - paddleCenter;
        if (Math.abs(diff) > 10) {
            return prevY + Math.sign(diff) * PADDLE_SPEED_AI;
        }
        return prevY;
      });

      // Collision detection
      // Top/Bottom walls
      if (ball.y + ballSpeed.vy > GAME_HEIGHT - BALL_RADIUS || ball.y + ballSpeed.vy < BALL_RADIUS) {
        setBallSpeed(prev => ({ ...prev, vy: -prev.vy }));
      }
      
      // Paddles
      const playerPaddleTop = playerY - PADDLE_HEIGHT / 2;
      const playerPaddleBottom = playerY + PADDLE_HEIGHT / 2;
      const computerPaddleTop = computerY - PADDLE_HEIGHT / 2;
      const computerPaddleBottom = computerY + PADDLE_HEIGHT / 2;

      // Player paddle collision
      if (
        ball.x - BALL_RADIUS < PADDLE_WIDTH * 3 &&
        ball.y > playerPaddleTop &&
        ball.y < playerPaddleBottom &&
        ballSpeed.vx < 0
      ) {
        const intersectY = (playerY - ball.y) / (PADDLE_HEIGHT / 2);
        const newVy = -intersectY * 5;
        setBallSpeed(prev => ({ vx: -prev.vx * 1.05, vy: newVy }));
      }

      // Computer paddle collision
      if (
        ball.x + BALL_RADIUS > GAME_WIDTH - PADDLE_WIDTH * 3 &&
        ball.y > computerPaddleTop &&
        ball.y < computerPaddleBottom &&
        ballSpeed.vx > 0
      ) {
         setBallSpeed(prev => ({ vx: -prev.vx, vy: prev.vy }));
      }

      // Scoring
      if (ball.x < 0) {
        setScore(prev => ({ ...prev, computer: prev.computer + 1 }));
        resetBall(1);
      } else if (ball.x > GAME_WIDTH) {
        setScore(prev => ({ ...prev, player: prev.player + 1 }));
        resetBall(-1);
      }

      // Draw
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          draw(context);
        }
      }
      
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, ball, ballSpeed, playerY, computerY, score, draw, resetBall]);

  // Reset game state when status changes
  useEffect(() => {
    if (status === 'running') {
      setScore({ player: 0, computer: 0 });
      resetBall(Math.random() > 0.5 ? 1 : -1);
    }
  }, [status, resetBall]);

  // Check for winner
  useEffect(() => {
    if (score.player >= WINNING_SCORE) {
      setGameStatus('over');
      onGameOver('player');
    } else if (score.computer >= WINNING_SCORE) {
      setGameStatus('over');
      onGameOver('computer');
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