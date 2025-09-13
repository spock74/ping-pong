import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import InstructionOverlay from './components/InstructionOverlay';
import { GAME_HEIGHT, PADDLE_HEIGHT } from './constants';
import type { GameStatus, Difficulty, GestureType } from './types';

// Declare MediaPipe and its utilities as global variables
declare const window: any;

// --- Gesture Detection Logic ---
type HandGesture = 'fist' | 'pointer' | 'spread' | 'stop' | 'open' | 'unknown';

const detectGesture = (landmarks: any[]): HandGesture => {
    if (!landmarks || landmarks.length < 21) {
        return 'unknown';
    }

    // Landmark indices from MediaPipe Hands documentation
    const WRIST = 0;
    const THUMB_TIP = 4;
    const INDEX_FINGER_TIP = 8;
    const MIDDLE_FINGER_TIP = 12;
    const RING_FINGER_TIP = 16;
    const PINKY_TIP = 20;

    const THUMB_IP = 3;
    const INDEX_FINGER_PIP = 6;
    const MIDDLE_FINGER_PIP = 10;
    const RING_FINGER_PIP = 14;
    const PINKY_PIP = 18;
    
    const MIDDLE_FINGER_MCP = 9;

    // --- Finger extension checks ---
    const isIndexExtended = landmarks[INDEX_FINGER_TIP].y < landmarks[INDEX_FINGER_PIP].y;
    const isMiddleExtended = landmarks[MIDDLE_FINGER_TIP].y < landmarks[MIDDLE_FINGER_PIP].y;
    const isRingExtended = landmarks[RING_FINGER_TIP].y < landmarks[RING_FINGER_PIP].y;
    const isPinkyExtended = landmarks[PINKY_TIP].y < landmarks[PINKY_PIP].y;
    // For selfie mode, a lower X value means the thumb is extended away from the palm
    const isThumbExtended = landmarks[THUMB_TIP].x < landmarks[THUMB_IP].x;

    const allFingersExtended = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;

    // --- Finger curled checks ---
    const areOthersCurledForPointer =
        landmarks[MIDDLE_FINGER_TIP].y > landmarks[MIDDLE_FINGER_PIP].y &&
        landmarks[RING_FINGER_TIP].y > landmarks[RING_FINGER_PIP].y &&
        landmarks[PINKY_TIP].y > landmarks[PINKY_PIP].y;

    const isFist =
        landmarks[INDEX_FINGER_TIP].y > landmarks[INDEX_FINGER_PIP].y &&
        areOthersCurledForPointer;
    
    // --- Gesture recognition (ordered by specificity) ---

    // 1. Pointer
    if (isIndexExtended && areOthersCurledForPointer) {
        return 'pointer';
    }

    // 2. Fist
    if (isFist) {
        return 'fist';
    }

    // 3. Open hand gestures (Stop / Spread)
    if (allFingersExtended && isThumbExtended) {
        // Calculate a reference distance for spread, e.g., palm height
        const palmHeight = Math.hypot(
            landmarks[WRIST].x - landmarks[MIDDLE_FINGER_MCP].x,
            landmarks[WRIST].y - landmarks[MIDDLE_FINGER_MCP].y,
        );
        
        // Distance between index and pinky fingertips
        const spreadDistance = Math.hypot(
             landmarks[INDEX_FINGER_TIP].x - landmarks[PINKY_TIP].x,
             landmarks[INDEX_FINGER_TIP].y - landmarks[PINKY_TIP].y,
        );

        // Heuristic thresholds based on palm height
        const SPREAD_THRESHOLD = palmHeight * 1.1;
        const STOP_THRESHOLD = palmHeight * 0.7;
        
        if (spreadDistance > SPREAD_THRESHOLD) {
            return 'spread';
        }
        
        if (spreadDistance < STOP_THRESHOLD) {
            return 'stop';
        }
    }
    
    return 'open'; // Default if no specific gesture is matched
};
// --- End Gesture Detection ---


const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [gestureType, setGestureType] = useState<GestureType>('fist');
  const [playerY, setPlayerY] = useState<number>(GAME_HEIGHT / 2);
  const [webcamReady, setWebcamReady] = useState<boolean>(false);
  const [persistentScore, setPersistentScore] = useState({ player: 0, computer: 0 });
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true); // Default to landmark view
  
  // Calibration State
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationRange, setCalibrationRange] = useState({ min: 1, max: 0 });
  const [calibrationHistory, setCalibrationHistory] = useState<{min: number, max: number}[]>([]);
  const [showCalibrationSuccess, setShowCalibrationSuccess] = useState(false);
  const calibrationDataRef = useRef({ min: 1, max: 0 });
  const gestureActionLockRef = useRef(false); // Cooldown for pause/reset gestures

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);

  // Load score from localStorage on initial render
  useEffect(() => {
    try {
      const savedScore = localStorage.getItem('pongPersistentScore');
      if (savedScore) {
        const parsedScore = JSON.parse(savedScore);
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

  const handleFullReset = useCallback(() => {
    console.log("Performing full reset.");
    setPersistentScore({ player: 0, computer: 0 });
    setCalibrationHistory([]);
    setCalibrationRange({ min: 1, max: 0 });
    setGameStatus('idle');
  }, []);

  const onResults = useCallback((results: any) => {
    // Draw hand landmarks on the canvas first, regardless of hand detection
    const canvasElement = landmarkCanvasRef.current;
    const canvasCtx = canvasElement?.getContext('2d');
    if (canvasCtx && canvasElement && results.image) {
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.fillStyle = 'black';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
                window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                window.drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 5 });
            }
        }
        canvasCtx.restore();
    }

    // Update game state and player paddle position based on gesture
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const handLandmarks = results.multiHandLandmarks[0];
      const currentGesture = detectGesture(handLandmarks);

      // --- Handle Game State Gestures (Pause/Reset) with cooldown ---
      if (!gestureActionLockRef.current) {
          if (currentGesture === 'spread') {
              if (gameStatus === 'running') {
                  setGameStatus('paused');
                  gestureActionLockRef.current = true;
                  setTimeout(() => { gestureActionLockRef.current = false; }, 1000); // 1s cooldown
              } else if (gameStatus === 'paused') {
                  setGameStatus('running');
                  gestureActionLockRef.current = true;
                  setTimeout(() => { gestureActionLockRef.current = false; }, 1000);
              }
          } else if (currentGesture === 'stop') {
              handleFullReset();
              gestureActionLockRef.current = true;
              setTimeout(() => { gestureActionLockRef.current = false; }, 2000); // 2s cooldown after reset
          }
      }
      
      // --- Handle Paddle Movement Gesture ---
      if (currentGesture === gestureType) {
        const wrist = handLandmarks[0];

        if (wrist) {
          if (isCalibrating) {
            // Record the min/max vertical position during calibration
            calibrationDataRef.current.min = Math.min(calibrationDataRef.current.min, wrist.y);
            calibrationDataRef.current.max = Math.max(calibrationDataRef.current.max, wrist.y);
          }
          
          const paddleTravelRange = GAME_HEIGHT - PADDLE_HEIGHT;
          const calibrationSpan = calibrationRange.max - calibrationRange.min;
          let newY: number;

          // Use calibrated range if it's valid (e.g., covers at least 10% of the screen)
          if (calibrationSpan > 0.1) {
            const normalizedY = (wrist.y - calibrationRange.min) / calibrationSpan;
            const clampedNormalizedY = Math.max(0, Math.min(1, normalizedY));
            newY = (clampedNormalizedY * paddleTravelRange) + (PADDLE_HEIGHT / 2);
          } else {
            // Fallback to default full-range mapping
            newY = (wrist.y * paddleTravelRange) + (PADDLE_HEIGHT / 2);
          }

          // Final clamp to ensure the paddle never goes off-screen
          const minPaddleY = PADDLE_HEIGHT / 2;
          const maxPaddleY = GAME_HEIGHT - PADDLE_HEIGHT / 2;
          const clampedY = Math.max(minPaddleY, Math.min(newY, maxPaddleY));

          // Apply smoothing to prevent jitter and improve responsiveness
          setPlayerY(prevY => {
              const smoothingFactor = 0.4; // Balanced value for responsiveness and smoothness
              return prevY + (clampedY - prevY) * smoothingFactor;
          });
        }
      }
    }
  }, [isCalibrating, calibrationRange, gestureType, gameStatus, handleFullReset]);

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

  const handleStartCalibration = () => {
    calibrationDataRef.current = { min: 1, max: 0 }; // Reset for new capture
    setIsCalibrating(true);
    setGameStatus('calibrating');

    setTimeout(() => {
        setIsCalibrating(false);
        setGameStatus('idle');

        const newRange = calibrationDataRef.current;
        // Check if a valid range was captured
        if (newRange.max - newRange.min > 0.1) {
            const newHistory = [...calibrationHistory, newRange];
            setCalibrationHistory(newHistory);
            
            // Calculate the average of all calibrations
            const avgMin = newHistory.reduce((sum, r) => sum + r.min, 0) / newHistory.length;
            const avgMax = newHistory.reduce((sum, r) => sum + r.max, 0) / newHistory.length;
            
            setCalibrationRange({ min: avgMin, max: avgMax });

            // Show success message
            setShowCalibrationSuccess(true);
            setTimeout(() => setShowCalibrationSuccess(false), 4000);
        } else {
            console.warn("Calibration failed: insufficient movement detected.");
        }
    }, 5000); // 5 seconds calibration time
  };

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
            <span className="text-red-500 font-bold">COMPUTADOR</span>
            <p className="text-4xl" style={{ textShadow: '0 0 5px #f00' }}>{persistentScore.computer}</p>
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
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            gestureType={gestureType}
            onGestureTypeChange={setGestureType}
            onCalibrate={() => setGameStatus('calibrating')}
            onStartCalibration={handleStartCalibration}
            showCalibrationSuccess={showCalibrationSuccess}
          />
        )}
        <GameCanvas 
            status={gameStatus} 
            playerY={playerY}
            setGameStatus={setGameStatus}
            onGameOver={handleGameOver}
            difficulty={difficulty}
        />
      </div>

      <p className="mt-4 text-sm text-gray-400">Desenvolvido com React, MediaPipe, Tailwind CSS e ❤️ por Zehn & Gemini 2.5-pro</p>
      
      {/* Webcam and Landmark visualization container */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <button
            onClick={() => setShowLandmarks(prev => !prev)}
            className="self-center px-2 py-1 text-xs font-semibold text-white bg-lime-600 rounded shadow-md hover:bg-lime-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-lime-400"
            aria-label={showLandmarks ? "Mostrar câmera" : "Mostrar detecção"}
            title={showLandmarks ? 'Mostrar câmera' : 'Mostrar detecção'}
        >
            {showLandmarks ? "Ver Cam" : "Ver Detecção"}
        </button>
        <div className="w-24 h-auto border-2 border-lime-500 rounded-md overflow-hidden opacity-50 hover:opacity-100 transition-opacity">
            <video 
                ref={videoRef} 
                className="block w-full"
                style={{ transform: 'scaleX(-1)', display: showLandmarks ? 'none' : 'block' }} 
                playsInline 
            />
            <canvas 
                ref={landmarkCanvasRef} 
                className="block w-full bg-black" 
                style={{ transform: 'scaleX(-1)', display: showLandmarks ? 'block' : 'none' }}
            />
        </div>
      </div>
    </div>
  );
};

export default App;