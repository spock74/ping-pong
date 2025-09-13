import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import InstructionOverlay from './components/InstructionOverlay';
import { GAME_HEIGHT } from './constants';
import type { GameStatus } from './types';

// Declare MediaPipe and its utilities as global variables
declare const window: any;

const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [playerY, setPlayerY] = useState<number>(GAME_HEIGHT / 2);
  const [webcamReady, setWebcamReady] = useState<boolean>(false);
  const [persistentScore, setPersistentScore] = useState({ player: 0, computer: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<any>(null);

  // Load score from localStorage on initial render
  useEffect(() => {
    try {
      const savedScore = localStorage.getItem('pongPersistentScore');
      if (savedScore) {
        const parsedScore = JSON.parse(savedScore);
        // Basic validation to ensure the loaded data is in the expected format
        if (typeof parsedScore.player === 'number' && typeof parsedScore.computer === 'number') {
          setPersistentScore(parsedScore);
        }
      }
    } catch (error) {
      console.error("Failed to load or parse score from localStorage:", error);
    }
  }, []);

  // Save score to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('pongPersistentScore', JSON.stringify(persistentScore));
    } catch (error) {
      console.error("Failed to save score to localStorage:", error);
    }
  }, [persistentScore]);

  const onResults = useCallback((results: any) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const handLandmarks = results.multiHandLandmarks[0];
      // Use the wrist landmark (index 0) for stable tracking
      const wrist = handLandmarks[0];
      if (wrist) {
        // Map the wrist's y-coordinate directly to the game canvas height
        const newY = wrist.y * GAME_HEIGHT;
        setPlayerY(newY);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window.Hands === 'undefined') {
      console.error("MediaPipe Hands not loaded!");
      return;
    }

    const hands = new window.Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: true,
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    if (videoRef.current) {
        const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
                if (videoRef.current) {
                    await hands.send({ image: videoRef.current });
                }
            },
            width: 1280,
            height: 720,
        });
        camera.start();
        setWebcamReady(true);
    }
  }, [onResults]);
  
  const startGame = () => {
    setGameStatus('running');
  };

  const restartGame = () => {
    setGameStatus('idle');
  };

  const handleGameOver = useCallback((winner: 'player' | 'computer') => {
    setPersistentScore(prevScore => ({
      ...prevScore,
      [winner]: prevScore[winner] + 1,
    }));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono p-4">
      <h1 className="text-5xl font-bold text-lime-400 mb-2 tracking-widest" style={{ textShadow: '0 0 10px #0f0' }}>
        PONG por Gestos
      </h1>
      <p className="text-green-400 mb-4" style={{ textShadow: '0 0 5px #0f0' }}>
        Controle a raquete com a sua mão!
      </p>

      <div className="mb-4 text-center">
        <h2 className="text-xl text-gray-400 uppercase tracking-wider">Placar Geral</h2>
        <div className="flex justify-around w-full max-w-sm text-2xl mt-2 p-2 border-2 border-gray-700 rounded-lg bg-gray-900/50">
          <div className="text-center px-4">
            <span className="text-lime-400 font-bold">JOGADOR</span>
            <p className="text-4xl" style={{ textShadow: '0 0 5px #0f0' }}>{persistentScore.player}</p>
          </div>
          <div className="text-center px-4">
            <span className="text-emerald-500 font-bold">COMPUTADOR</span>
            <p className="text-4xl" style={{ textShadow: '0 0 5px #0c0' }}>{persistentScore.computer}</p>
          </div>
        </div>
      </div>

      <div className="relative w-full max-w-4xl aspect-[16/9] bg-gray-900 border-4 border-lime-400 shadow-[0_0_20px_#0f0] rounded-lg overflow-hidden">
        {gameStatus !== 'running' && (
          <InstructionOverlay
            status={gameStatus}
            onStart={startGame}
            onRestart={restartGame}
            webcamReady={webcamReady}
          />
        )}
        <GameCanvas 
            status={gameStatus} 
            playerY={playerY}
            setGameStatus={setGameStatus}
            onGameOver={handleGameOver}
        />
      </div>

      <p className="mt-4 text-sm text-gray-400">Desenvolvido com React, MediaPipe, Tailwind CSS e ❤️ por Zehn & Gemini 2.5-pro</p>
      
      {/* Video element for MediaPipe (can be hidden) */}
      <video ref={videoRef} className="absolute w-24 h-auto top-4 right-4 border-2 border-lime-500 rounded-md opacity-50 hover:opacity-100 transition-opacity" style={{ transform: 'scaleX(-1)' }} playsInline />
    </div>
  );
};

export default App;