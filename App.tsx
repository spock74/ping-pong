import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import GameCanvas from './components/GameCanvas';
import InstructionOverlay from './components/InstructionOverlay';
import { GAME_HEIGHT, PADDLE_HEIGHT } from './constants';
import type { GameStatus, Difficulty, GestureType } from './types';

// Declare MediaPipe and its utilities as global variables
declare const window: any;

// --- Gemini API Logic ---
let ai: GoogleGenAI | null = null;
const getAI = () => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }
  return ai;
};

// Hardcoded fallbacks in case the API fails or is rate-limited
const FALLBACK_TAUNTS = ["HAHAHA!", "LENTO DEMAIS!", "SÓ ISSO?", "TENTE MAIS!", "ROBÔS DOMINAM!"];
const FALLBACK_PRAISES = ["SORTE DE PRINCIPIANTE...", "HMPH.", "NÃO SE ACOSTUME.", "NADA MAL... PARA UM HUMANO."];

const generateAIResponses = async (): Promise<{ taunts: string[], praises: string[], success: boolean, error?: string }> => {
  const fallback = { taunts: FALLBACK_TAUNTS, praises: FALLBACK_PRAISES, success: false };
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Generate two lists of short, witty, retro-arcade style messages for a Pong game. First, a list of 10 taunts for a human player who just lost a point. Second, a list of 10 messages of grudging praise for a human who just scored a point against an AI. Each message should be max 10 words.',
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            taunts: {
              type: Type.ARRAY,
              description: 'A list of 10 short, witty, retro-arcade style taunts.',
              items: { type: Type.STRING }
            },
            praises: {
              type: Type.ARRAY,
              description: 'A list of 10 short, retro-arcade style messages of grudging praise.',
              items: { type: Type.STRING }
            }
          }
        }
      }
    });
    const json = JSON.parse(response.text);
    const taunts = Array.isArray(json.taunts) && json.taunts.length > 0 ? json.taunts : FALLBACK_TAUNTS;
    const praises = Array.isArray(json.praises) && json.praises.length > 0 ? json.praises : FALLBACK_PRAISES;
    return { taunts, praises, success: true };
  } catch (error) {
    console.error("Error generating AI responses:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    
    let userMessage = "Não foi possível buscar as mensagens da IA. Usando mensagens padrão.";
    if (errorMessage.toLowerCase().includes("quota")) {
        userMessage = "Cota da API de IA atingida por hoje. Usando mensagens padrão até amanhã.";
    }
    return { ...fallback, error: userMessage };
  }
};
// --- End Gemini API Logic ---

// --- Gesture Detection Logic ---
type HandGesture = 'fist' | 'pointer' | 'spread' | 'thumbs_up' | 'thumbs_down' | 'open' | 'unknown';

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
    const isThumbExtended = landmarks[THUMB_TIP].x < landmarks[THUMB_IP].x; // For selfie mode, lower X is away from palm
    const isThumbDown = landmarks[THUMB_TIP].y > landmarks[THUMB_IP].y;

    // Stricter checks for thumb gestures to avoid confusion with fist
    const isThumbClearlyUp = landmarks[THUMB_TIP].y < landmarks[INDEX_FINGER_PIP].y;
    const isThumbClearlyDown = landmarks[THUMB_TIP].y > landmarks[MIDDLE_FINGER_MCP].y;

    const allFingersExtended = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;

    // --- Finger curled checks ---
    const areFingersCurled = 
        landmarks[INDEX_FINGER_TIP].y > landmarks[INDEX_FINGER_PIP].y &&
        landmarks[MIDDLE_FINGER_TIP].y > landmarks[MIDDLE_FINGER_PIP].y &&
        landmarks[RING_FINGER_TIP].y > landmarks[RING_FINGER_PIP].y &&
        landmarks[PINKY_TIP].y > landmarks[PINKY_PIP].y;

    const areOthersCurledForPointer =
        landmarks[MIDDLE_FINGER_TIP].y > landmarks[MIDDLE_FINGER_PIP].y &&
        landmarks[RING_FINGER_TIP].y > landmarks[RING_FINGER_PIP].y &&
        landmarks[PINKY_TIP].y > landmarks[PINKY_PIP].y;
    
    // --- Gesture recognition (ordered by specificity) ---

    // 1. Thumbs up (Stricter)
    if (isThumbClearlyUp && areFingersCurled) {
        return 'thumbs_up';
    }

    // 2. Thumbs down (Stricter)
    if (isThumbDown && isThumbClearlyDown && areFingersCurled) {
        return 'thumbs_down';
    }

    // 3. Pointer
    if (isIndexExtended && areOthersCurledForPointer) {
        return 'pointer';
    }

    // 4. Fist - Refined to prevent conflict with thumbs_up
    if (areFingersCurled && !isThumbClearlyUp) {
        return 'fist';
    }

    // 5. Open hand gestures (Spread)
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
        
        if (spreadDistance > SPREAD_THRESHOLD) {
            return 'spread';
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
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [taunts, setTaunts] = useState<string[]>(FALLBACK_TAUNTS);
  const [praises, setPraises] = useState<string[]>(FALLBACK_PRAISES);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isFetchingBanter, setIsFetchingBanter] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<HandGesture>('unknown');
  const aiMessageTimeoutRef = useRef<number | null>(null);
  
  // Calibration State
  const [calibrationStep, setCalibrationStep] = useState<'start' | 'up' | 'down' | 'finished'>('start');
  const [calibrationRange, setCalibrationRange] = useState({ min: 1, max: 0 });
  const [calibrationHistory, setCalibrationHistory] = useState<{min: number, max: number}[]>([]);
  const [showCalibrationSuccess, setShowCalibrationSuccess] = useState(false);
  const calibrationDataRef = useRef({ min: 1, max: 0 });
  const gestureActionLockRef = useRef(false); // Cooldown for pause/reset gestures
  const lastHandPositionRef = useRef<number | null>(null);
  const lastValidCalibPositionRef = useRef<number | null>(null); // For gesture-gated calibration
  const handVisibleRef = useRef<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const targetPlayerYRef = useRef<number>(GAME_HEIGHT / 2); // For paddle smoothing

  // --- Refs to mirror state for stable onResults callback ---
  const gameStatusRef = useRef(gameStatus);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

  const gestureTypeRef = useRef(gestureType);
  useEffect(() => { gestureTypeRef.current = gestureType; }, [gestureType]);

  const calibrationRangeRef = useRef(calibrationRange);
  useEffect(() => { calibrationRangeRef.current = calibrationRange; }, [calibrationRange]);
  
  const calibrationStepRef = useRef(calibrationStep);
  useEffect(() => { calibrationStepRef.current = calibrationStep; }, [calibrationStep]);

  const handleFetchBanter = useCallback(async () => {
      setIsFetchingBanter(true);
      setApiError(null);
      console.log("Fetching new AI responses...");
      const { taunts, praises, success, error } = await generateAIResponses();
      setTaunts(taunts);
      setPraises(praises);
      
      if (error) {
          setApiError(error);
          setTimeout(() => setApiError(null), 10000); // Auto-hide after 10 seconds
      }

      if (success) {
        try {
          localStorage.setItem('pongAiResponses', JSON.stringify({ taunts, praises }));
          console.log("Successfully fetched and cached new AI responses.");
        } catch (error) {
          console.error("Failed to save AI responses to localStorage:", error);
        }
      }
      setIsFetchingBanter(false);
  }, []);

  // Load score and AI responses from localStorage on initial render
  useEffect(() => {
    // Load score
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

    // Load AI responses from cache, or fetch if cache is empty
    const loadAIResponses = async () => {
      try {
        const cachedResponses = localStorage.getItem('pongAiResponses');
        if (cachedResponses) {
          const { taunts, praises } = JSON.parse(cachedResponses);
          if (Array.isArray(taunts) && taunts.length > 0 && Array.isArray(praises) && praises.length > 0) {
            setTaunts(taunts);
            setPraises(praises);
            console.log("Loaded AI responses from cache.");
            return;
          }
        }
      } catch (error) {
        console.error("Failed to load or parse AI responses from localStorage:", error);
      }
      
      // If cache is empty or invalid, fetch new ones.
      await handleFetchBanter();
    };

    loadAIResponses();
  }, [handleFetchBanter]);

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
  
  const startGame = useCallback(() => {
    setGameStatus('running');
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

    const handIsCurrentlyVisible = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    const handWasPreviouslyVisible = handVisibleRef.current;
    handVisibleRef.current = handIsCurrentlyVisible;

    // Handle game logic that requires a visible hand
    if (handIsCurrentlyVisible) {
      const handLandmarks = results.multiHandLandmarks[0];
      const gesture = detectGesture(handLandmarks);
      setCurrentGesture(gesture);
      
      // During calibration, only track hand position if the gesture is a fist
      if (gameStatusRef.current === 'calibrating' && gesture === 'fist') {
          lastValidCalibPositionRef.current = handLandmarks[0].y;
      }
      
      lastHandPositionRef.current = handLandmarks[0].y; // Update last known position for general use

      // --- Handle Game State Gestures (Pause/Reset/Start) with cooldown ---
      if (!gestureActionLockRef.current) {
          if (gesture === 'spread') {
              if (gameStatusRef.current === 'running') {
                  setGameStatus('paused');
                  gestureActionLockRef.current = true;
                  setTimeout(() => { gestureActionLockRef.current = false; }, 1000); // 1s cooldown
              } else if (gameStatusRef.current === 'paused') {
                  setGameStatus('running');
                  gestureActionLockRef.current = true;
                  setTimeout(() => { gestureActionLockRef.current = false; }, 1000);
              }
          } else if (gesture === 'thumbs_down') {
              handleFullReset();
              gestureActionLockRef.current = true;
              setTimeout(() => { gestureActionLockRef.current = false; }, 2000); // 2s cooldown after reset
          } else if (gesture === 'thumbs_up' && gameStatusRef.current === 'idle') {
              startGame();
              gestureActionLockRef.current = true;
              setTimeout(() => { gestureActionLockRef.current = false; }, 2000); // 2s cooldown
          }
      }
      
      // --- Handle Paddle Movement Gesture ---
      if (gesture === gestureTypeRef.current) {
        const wrist = handLandmarks[0];
        if (wrist) {
          const paddleTravelRange = GAME_HEIGHT - PADDLE_HEIGHT;
          const calibrationSpan = calibrationRangeRef.current.max - calibrationRangeRef.current.min;
          let newY: number;

          // Use calibrated range if it's valid (e.g., covers at least 10% of the screen)
          if (calibrationSpan > 0.1) {
            const normalizedY = (wrist.y - calibrationRangeRef.current.min) / calibrationSpan;
            newY = (normalizedY * paddleTravelRange) + (PADDLE_HEIGHT / 2);
          } else {
            // Fallback to default full-range mapping
            newY = (wrist.y * paddleTravelRange) + (PADDLE_HEIGHT / 2);
          }

          // Final clamp to ensure the paddle never goes off-screen
          const minPaddleY = PADDLE_HEIGHT / 2;
          const maxPaddleY = GAME_HEIGHT - PADDLE_HEIGHT / 2;
          const clampedY = Math.max(minPaddleY, Math.min(newY, maxPaddleY));

          // Update target position for smoothing instead of setting state directly
          targetPlayerYRef.current = clampedY;
        }
      }
    } else {
      setCurrentGesture('unknown');
    }

    // --- New Calibration State Machine ---
    if (gameStatusRef.current === 'calibrating') {
      // Step 1: Hand was visible and is now not visible (moved off screen)
      if (handWasPreviouslyVisible && !handIsCurrentlyVisible) {
        const lastValidY = lastValidCalibPositionRef.current; // Use the gesture-gated position
        
        // Check for finishing the 'up' step
        if (calibrationStepRef.current === 'up' && lastValidY !== null && lastValidY < 0.5) {
          calibrationDataRef.current.min = lastValidY;
          console.log(`Calibrated TOP boundary at: ${lastValidY}`);
          setCalibrationStep('down');
        }
        
        // Check for finishing the 'down' step
        else if (calibrationStepRef.current === 'down' && lastValidY !== null && lastValidY > 0.5) {
          calibrationDataRef.current.max = lastValidY;
          console.log(`Calibrated BOTTOM boundary at: ${lastValidY}`);
          setCalibrationStep('finished');
        }

        // Reset the valid position ref after each capture attempt
        lastValidCalibPositionRef.current = null;
      }
    }
  }, [handleFullReset, startGame]);

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
                if (videoRef.current && handsRef.current) {
                    try {
                        await handsRef.current.send({ image: videoRef.current });
                    } catch (error) {
                        console.error("Error sending image to MediaPipe Hands:", error);
                    }
                }
            },
            width: 1280,
            height: 720,
        });
        try {
            camera.start();
            setWebcamReady(true);
        } catch (error) {
            console.error("Failed to start camera. Please ensure permissions are granted and no other application is using the camera.", error);
            setWebcamReady(false);
        }
    }

    return () => {
        if(handsRef.current) {
            handsRef.current.close();
            handsRef.current = null;
        }
    }
  }, [onResults]);
  
  // Paddle Smoothing Effect
  useEffect(() => {
    let animationFrameId: number;

    const smoothPaddleMovement = () => {
      setPlayerY(prevY => {
        const targetY = targetPlayerYRef.current;
        // If the difference is negligible, snap to target and stop updates to prevent re-renders
        if (Math.abs(targetY - prevY) < 0.5) {
          return targetY;
        }
        // Lerp function for smoothing. A value around 0.2 provides a good balance.
        const smoothingFactor = 0.2; 
        return prevY + (targetY - prevY) * smoothingFactor;
      });
      animationFrameId = requestAnimationFrame(smoothPaddleMovement);
    };

    // Run smoothing loop when paddle control is expected (game is active, paused, or during calibration)
    if (gameStatus === 'running' || gameStatus === 'paused' || gameStatus === 'calibrating') {
        animationFrameId = requestAnimationFrame(smoothPaddleMovement);
    } else {
      // When game is idle or over, snap paddle to center.
      targetPlayerYRef.current = GAME_HEIGHT / 2;
      setPlayerY(GAME_HEIGHT / 2);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStatus]);

  const restartGame = () => {
    setGameStatus('idle');
  };

  const handleGameOver = useCallback((winner: 'player' | 'computer') => {
    setPersistentScore(prevScore => ({
      ...prevScore,
      [winner]: prevScore[winner] + 1,
    }));
  }, []);

  const handlePointScored = useCallback((scorer: 'player' | 'computer') => {
    if (aiMessageTimeoutRef.current) {
        clearTimeout(aiMessageTimeoutRef.current);
    }
    setAiMessage(null); // Clear previous message immediately
    
    // Tiny delay to allow React to clear state before setting a new one, ensuring animations restart.
    setTimeout(() => {
        let message = '';
        if (scorer === 'computer') {
            const randomIndex = Math.floor(Math.random() * taunts.length);
            message = taunts[randomIndex];
        } else {
            const randomIndex = Math.floor(Math.random() * praises.length);
            message = praises[randomIndex];
        }
        setAiMessage(message);

        aiMessageTimeoutRef.current = window.setTimeout(() => {
            setAiMessage(null);
            aiMessageTimeoutRef.current = null;
        }, 4000);
    }, 50);
  }, [praises, taunts]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (aiMessageTimeoutRef.current) {
        clearTimeout(aiMessageTimeoutRef.current);
      }
    };
  }, []);

  const startCalibrationSequence = useCallback(() => {
    calibrationDataRef.current = { min: 1, max: 0 }; // Reset for new capture
    lastHandPositionRef.current = null;
    lastValidCalibPositionRef.current = null;
    handVisibleRef.current = false;
    setCalibrationStep('up');
  }, []);

  useEffect(() => {
    if (calibrationStep === 'finished') {
        setGameStatus('idle');
        setCalibrationStep('start'); // Reset for next time

        const newRange = calibrationDataRef.current;
        // Check if a valid range was captured
        if (newRange.min < newRange.max && (newRange.max - newRange.min > 0.1)) {
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
            console.warn("Calibration failed: insufficient or invalid movement detected.", newRange);
        }
    }
}, [calibrationStep, calibrationHistory]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono p-4 relative">
      {apiError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 border-2 border-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center space-x-3 animate-simpleFadeIn max-w-lg text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm">{apiError}</span>
            <button onClick={() => setApiError(null)} className="text-red-300 hover:text-white text-2xl leading-none flex-shrink-0">&times;</button>
        </div>
      )}
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
            onStartCalibrationSequence={startCalibrationSequence}
            calibrationStep={calibrationStep}
            showCalibrationSuccess={showCalibrationSuccess}
            onFetchBanter={handleFetchBanter}
            isFetchingBanter={isFetchingBanter}
          />
        )}
        <GameCanvas 
            status={gameStatus} 
            playerY={playerY}
            setGameStatus={setGameStatus}
            onGameOver={handleGameOver}
            difficulty={difficulty}
            onPointScored={handlePointScored}
        />
         {aiMessage && (
          <div 
            key={aiMessage} // Use key to force re-render and restart animation
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-fadeInOut"
          >
            <p 
              className="text-4xl font-bold text-yellow-300 text-center px-4" 
              style={{ textShadow: '0 0 10px #ff0, 0 0 20px #f90' }}
            >
              {aiMessage}
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm text-gray-400">Desenvolvido com React, MediaPipe, Tailwind CSS e ❤️ por Zehn & Gemini 2.5-flash</p>
      
      {/* Webcam and Landmark visualization container */}
      <div className="absolute top-4 right-4 flex flex-col items-end space-y-2">
         <div className="bg-black/50 text-lime-400 text-sm font-semibold px-3 py-1.5 rounded-md border border-lime-800 shadow-lg text-center">
            Gesto: <span className="text-white font-bold tracking-wider w-20 inline-block">{currentGesture === 'unknown' ? 'N/D' : currentGesture.toUpperCase()}</span>
         </div>
        <div className="flex items-center space-x-2">
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
    </div>
  );
};

export default App;