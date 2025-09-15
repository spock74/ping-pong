import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import GameCanvas from './components/GameCanvas';
import InstructionOverlay from './components/InstructionOverlay';
import { GAME_HEIGHT, PADDLE_HEIGHT, PADDLE_SMOOTHING_FACTOR } from './constants';
import type { GameStatus, Difficulty } from './types';
import { setSoundEnabled } from './utils/sounds';

// Declare MediaPipe and its utilities as global variables
declare const window: any;
//

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
type HandGesture = 'fist' | 'pointer' | 'thumbs_up' | 'victory' | 'open' | 'unknown';

const isLandmarkVisible = (landmark: any) =>
  landmark &&
  typeof landmark.x === 'number' && Number.isFinite(landmark.x) &&
  typeof landmark.y === 'number' && Number.isFinite(landmark.y) &&
  typeof landmark.z === 'number' && Number.isFinite(landmark.z);

const detectGesture = (landmarks: any[]): HandGesture => {
    if (!landmarks || landmarks.length < 21) {
        return 'unknown';
    }

    // --- STABILITY FIX: Check for all necessary landmarks before processing ---
    const requiredIndices = [0, 3, 4, 6, 8, 9, 10, 12, 14, 16, 18, 20];
    for (const index of requiredIndices) {
        if (!isLandmarkVisible(landmarks[index])) {
            return 'unknown'; // Exit early if a key landmark is missing
        }
    }
    
    // Landmark indices from MediaPipe Hands documentation
    const THUMB_TIP = 4;
    const INDEX_FINGER_TIP = 8;
    const MIDDLE_FINGER_TIP = 12;
    const RING_FINGER_TIP = 16;
    const PINKY_TIP = 20;

    const INDEX_FINGER_PIP = 6;
    const MIDDLE_FINGER_PIP = 10;
    const RING_FINGER_PIP = 14;
    const PINKY_PIP = 18;
    
    // --- Finger extension checks ---
    const isIndexExtended = landmarks[INDEX_FINGER_TIP].y < landmarks[INDEX_FINGER_PIP].y;
    const isMiddleExtended = landmarks[MIDDLE_FINGER_TIP].y < landmarks[MIDDLE_FINGER_PIP].y;

    // Stricter checks for thumb gestures to avoid confusion with fist
    const isThumbClearlyUp = landmarks[THUMB_TIP].y < landmarks[INDEX_FINGER_PIP].y;

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
    
    const isRingCurled = landmarks[RING_FINGER_TIP].y > landmarks[RING_FINGER_PIP].y;
    const isPinkyCurled = landmarks[PINKY_TIP].y > landmarks[PINKY_PIP].y;
    
    // --- Gesture recognition (ordered by specificity) ---

    // 1. Victory (✌️)
    if (isIndexExtended && isMiddleExtended && isRingCurled && isPinkyCurled) {
        return 'victory';
    }

    // 2. Thumbs up (Stricter)
    if (isThumbClearlyUp && areFingersCurled) {
        return 'thumbs_up';
    }

    // 3. Pointer
    if (isIndexExtended && areOthersCurledForPointer) {
        return 'pointer';
    }

    // 4. Fist - Refined to prevent conflict with thumbs_up
    if (areFingersCurled && !isThumbClearlyUp) {
        return 'fist';
    }
    
    return 'open'; // Default if no specific gesture is matched
};
// --- End Gesture Detection ---

type CalibrationStep = 'idle' | 'setting_top' | 'setting_bottom' | 'finished';

const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playerY, setPlayerY] = useState<number>(GAME_HEIGHT / 2);
  const [webcamReady, setWebcamReady] = useState<boolean>(false);
  const [persistentScore, setPersistentScore] = useState({ player: 0, computer: 0 });
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true); // Default to landmark view
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [taunts, setTaunts] = useState<string[]>(FALLBACK_TAUNTS);
  const [praises, setPraises] = useState<string[]>(FALLBACK_PRAISES);
  const [apiError, setApiError] = useState<string | null>(null);
  const [currentGesture, setCurrentGesture] = useState<HandGesture>('unknown');
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pongSoundEnabled');
      return saved !== null ? JSON.parse(saved) : false; // Sound is OFF by default
    } catch {
      return false;
    }
  });
  const aiMessageTimeoutRef = useRef<number | null>(null);
  
  // --- NEW: Refactored Calibration State ---
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle');
  const [calibrationRange, setCalibrationRange] = useState({ min: 1, max: 0 });
  const [showCalibrationSuccess, setShowCalibrationSuccess] = useState(false);
  const [calibrationHoldProgress, setCalibrationHoldProgress] = useState(0);
  const [calibrationPaddleY, setCalibrationPaddleY] = useState<number>(GAME_HEIGHT / 2);
  const [lockedBoundaries, setLockedBoundaries] = useState<{top: number | null, bottom: number | null}>({ top: null, bottom: null });

  const [debugInfo, setDebugInfo] = useState<Record<string, string | number>>({});
  const calibrationDataRef = useRef({ min: 1, max: 0 });
  const calibrationHoldStartRef = useRef<number | null>(null);
  // ---

  const gestureActionLockRef = useRef(false); // Cooldown for pause/reset gestures
  const lastFrameTimeRef = useRef<number>(performance.now()); // For delta time calculation

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkCanvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const targetPlayerYRef = useRef<number>(GAME_HEIGHT / 2); // For paddle smoothing

  // --- Refs to mirror state for stable onResults callback ---
  const gameStatusRef = useRef(gameStatus);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

  const calibrationRangeRef = useRef(calibrationRange);
  useEffect(() => { calibrationRangeRef.current = calibrationRange; }, [calibrationRange]);
  
  const calibrationStepRef = useRef(calibrationStep);
  useEffect(() => { calibrationStepRef.current = calibrationStep; }, [calibrationStep]);

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

    // Load AI responses from cache. DO NOT fetch automatically.
    const loadAIResponses = () => {
      try {
        const cachedResponses = localStorage.getItem('pongAiResponses');
        if (cachedResponses) {
          const { taunts, praises } = JSON.parse(cachedResponses);
          if (Array.isArray(taunts) && taunts.length > 0 && Array.isArray(praises) && praises.length > 0) {
            setTaunts(taunts);
            setPraises(praises);
            console.log("Loaded AI responses from cache.");
          }
        }
      } catch (error) {
        console.error("Failed to load or parse AI responses from localStorage:", error);
      }
    };

    loadAIResponses();
  }, []);

  // Save score to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('pongPersistentScore', JSON.stringify(persistentScore));
    } catch (error) {
      console.error("Failed to save score to localStorage:", error);
    }
  }, [persistentScore]);

  // Save sound setting and update sound module whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('pongSoundEnabled', JSON.stringify(isSoundEnabled));
    } catch (error) {
      console.error("Failed to save sound setting to localStorage:", error);
    }
    setSoundEnabled(isSoundEnabled);
  }, [isSoundEnabled]);

  const startCalibrationSequence = useCallback(() => {
    setGameStatus('calibrating');
    calibrationDataRef.current = { min: 1, max: 0 };
    setCalibrationPaddleY(GAME_HEIGHT / 2);
    setCalibrationHoldProgress(0);
    setLockedBoundaries({ top: null, bottom: null });
    calibrationHoldStartRef.current = null;
    setCalibrationStep('setting_top');
  }, []);

  const startGame = useCallback(() => {
    setGameStatus('running');
  }, []);

  const onResults = useCallback((results: any) => {
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

    if (handIsCurrentlyVisible) {
      // --- THE DEFINITIVE CRASH FIX: TRY/CATCH BLOCK ---
      // This is the ultimate safeguard. Any unexpected error from MediaPipe's
      // data structure (e.g., incomplete landmarks array leading to an
      // `undefined` access) will be caught here, preventing the entire
      // React component from crashing.
      try {
        const handLandmarks = results.multiHandLandmarks[0];

        // Structural Integrity Check (First line of defense)
        if (!handLandmarks || handLandmarks.length < 21) {
          return;
        }

        const gesture = detectGesture(handLandmarks);
        setCurrentGesture(gesture);
        
        const controlPoint = handLandmarks[9]; // Middle finger MCP is our control point

        // Landmark Visibility Check (Second line of defense)
        if (!isLandmarkVisible(controlPoint)) {
            return;
        }
        
        if (gameStatusRef.current === 'calibrating') {
            const paddleY = controlPoint.y * GAME_HEIGHT;

            if (!Number.isFinite(paddleY)) {
                return;
            }
            setCalibrationPaddleY(paddleY);

            const CALIBRATION_HOLD_TIME = 1500; // 1.5 seconds

            if (calibrationStepRef.current === 'setting_top') {
                const paddleTopEdge = paddleY - PADDLE_HEIGHT / 2;
                if (paddleTopEdge <= 5) { // Check if paddle is at the top edge
                    if (!calibrationHoldStartRef.current) {
                        calibrationHoldStartRef.current = performance.now();
                    } else {
                        const elapsed = performance.now() - calibrationHoldStartRef.current;
                        const progress = Math.min(elapsed / CALIBRATION_HOLD_TIME, 1);
                        setCalibrationHoldProgress(progress);

                        if (elapsed >= CALIBRATION_HOLD_TIME) {
                            calibrationDataRef.current.min = controlPoint.y;
                            console.log(`Locked TOP at ${controlPoint.y}`);
                            setCalibrationStep('setting_bottom');
                            calibrationHoldStartRef.current = null;
                            setCalibrationHoldProgress(0);
                            setLockedBoundaries(prev => ({ ...prev, top: PADDLE_HEIGHT / 2 }));
                        }
                    }
                } else {
                    calibrationHoldStartRef.current = null;
                    setCalibrationHoldProgress(0);
                }
            } else if (calibrationStepRef.current === 'setting_bottom') {
                const paddleBottomEdge = paddleY + PADDLE_HEIGHT / 2;
                if (paddleBottomEdge >= GAME_HEIGHT - 5) { // Check if paddle is at bottom edge
                    if (!calibrationHoldStartRef.current) {
                        calibrationHoldStartRef.current = performance.now();
                    } else {
                        const elapsed = performance.now() - calibrationHoldStartRef.current;
                        const progress = Math.min(elapsed / CALIBRATION_HOLD_TIME, 1);
                        setCalibrationHoldProgress(progress);

                        if (elapsed >= CALIBRATION_HOLD_TIME) {
                            calibrationDataRef.current.max = controlPoint.y;
                            console.log(`Locked BOTTOM at ${controlPoint.y}`);
                            setCalibrationStep('finished');
                            calibrationHoldStartRef.current = null;
                            setCalibrationHoldProgress(0);
                            setLockedBoundaries(prev => ({ ...prev, bottom: GAME_HEIGHT - PADDLE_HEIGHT / 2 }));
                        }
                    }
                } else {
                    calibrationHoldStartRef.current = null;
                    setCalibrationHoldProgress(0);
                }
            }
        }

        if (!gestureActionLockRef.current) {
            if (gesture === 'victory' && gameStatusRef.current === 'idle') {
                startCalibrationSequence();
                gestureActionLockRef.current = true;
                setTimeout(() => { gestureActionLockRef.current = false; }, 2000);
            } else if (gesture === 'thumbs_up' && gameStatusRef.current === 'idle') {
                startGame();
                gestureActionLockRef.current = true;
                setTimeout(() => { gestureActionLockRef.current = false; }, 2000);
            }
        }
        
        if (gameStatusRef.current === 'running' && gesture === 'fist') {
          const calibrationSpan = calibrationRangeRef.current.max - calibrationRangeRef.current.min;
          const isCalibrationValid = calibrationSpan > 0.1;

          if (isCalibrationValid) {
              let normalizedY = (controlPoint.y - calibrationRangeRef.current.min) / calibrationSpan;
              if (!Number.isFinite(normalizedY)) {
                  setDebugInfo({ error: `Invalid normY: ${String(normalizedY)}`, rawY: controlPoint.y.toFixed(4) });
                  return;
              }
              const clampedNormalizedY = Math.max(0, Math.min(1, normalizedY));
              const paddleTravelRange = GAME_HEIGHT - PADDLE_HEIGHT;
              const minPaddleY = PADDLE_HEIGHT / 2;
              const newY = (clampedNormalizedY * paddleTravelRange) + minPaddleY;
              targetPlayerYRef.current = newY;
              setDebugInfo({ status: 'Calibrated', rawY: controlPoint.y.toFixed(3), normY: normalizedY.toFixed(3), finalY: newY.toFixed(3) });
          } else {
              const paddleTravelRange = GAME_HEIGHT - PADDLE_HEIGHT;
              const unmappedY = controlPoint.y * paddleTravelRange;
              if (!Number.isFinite(unmappedY)) return;
              const newY = unmappedY + (PADDLE_HEIGHT / 2);
              const minPaddleY = PADDLE_HEIGHT / 2;
              const maxPaddleY = GAME_HEIGHT - PADDLE_HEIGHT / 2;
              const clampedY = Math.max(minPaddleY, Math.min(newY, maxPaddleY));
              if (!Number.isFinite(clampedY)) return;
              targetPlayerYRef.current = clampedY;
              setDebugInfo({ status: 'No calibration', rawY: controlPoint.y.toFixed(3), finalY: clampedY.toFixed(3) });
          }
        }
      } catch (error) {
        console.error("A critical error occurred during hand processing:", error);
        // This catch block prevents the entire application from crashing.
        // The game will simply miss one frame of input.
      }
    } else {
      setCurrentGesture('unknown');
    }
  }, [startGame, startCalibrationSequence]);

  useEffect(() => {
    if (typeof window.Hands === 'undefined') {
      console.error("MediaPipe Hands not loaded!");
      return;
    }
    const hands = new window.Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5, selfieMode: true });
    hands.onResults(onResults);
    handsRef.current = hands;

    if (videoRef.current) {
        const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
                if (videoRef.current && handsRef.current) {
                    try { await handsRef.current.send({ image: videoRef.current }); }
                    catch (error) { console.error("Error sending image to MediaPipe Hands:", error); }
                }
            },
            width: 1280,
            height: 720,
        });
        try {
            camera.start();
            setWebcamReady(true);
        } catch (error) {
            console.error("Failed to start camera.", error);
            setWebcamReady(false);
        }
    }
    return () => { if (handsRef.current) { handsRef.current.close(); handsRef.current = null; } }
  }, [onResults]);
  
  useEffect(() => {
    let animationFrameId: number;
    const smoothPaddleMovement = (timestamp: number) => {
      const dt = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;
      const targetY = targetPlayerYRef.current;
      setDebugInfo(prev => ({ ...prev, anim_target: typeof targetY === 'number' ? targetY.toFixed(3) : String(targetY) }));
      setPlayerY(prevY => {
        if (!Number.isFinite(targetY)) return prevY;
        const diff = targetY - prevY;
        if (Math.abs(diff) < 0.5) return targetY;
        const adjustedSmoothing = PADDLE_SMOOTHING_FACTOR * dt * 60;
        const newY = prevY + diff * Math.min(adjustedSmoothing, 1);
        if (Number.isFinite(newY)) return newY;
        return prevY;
      });
      animationFrameId = requestAnimationFrame(smoothPaddleMovement);
    };
    if (gameStatus === 'running') {
        lastFrameTimeRef.current = performance.now();
        animationFrameId = requestAnimationFrame(smoothPaddleMovement);
    } else {
      targetPlayerYRef.current = GAME_HEIGHT / 2;
      setPlayerY(GAME_HEIGHT / 2);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameStatus]);

  const restartGame = () => setGameStatus('idle');

  const handleGameOver = useCallback((winner: 'player' | 'computer') => {
    setPersistentScore(prevScore => ({ ...prevScore, [winner]: prevScore[winner] + 1 }));
  }, []);

  const handlePointScored = useCallback((scorer: 'player' | 'computer') => {
    if (aiMessageTimeoutRef.current) clearTimeout(aiMessageTimeoutRef.current);
    setAiMessage(null);
    setTimeout(() => {
        const messageList = scorer === 'computer' ? taunts : praises;
        const message = messageList[Math.floor(Math.random() * messageList.length)];
        setAiMessage(message);
        aiMessageTimeoutRef.current = window.setTimeout(() => setAiMessage(null), 4000);
    }, 50);
  }, [praises, taunts]);

  useEffect(() => {
    return () => { if (aiMessageTimeoutRef.current) clearTimeout(aiMessageTimeoutRef.current); };
  }, []);

  useEffect(() => {
    if (calibrationStep === 'finished') {
        setCalibrationStep('idle');
        const capturedRange = calibrationDataRef.current;
        const newMin = Math.min(capturedRange.min, capturedRange.max);
        const newMax = Math.max(capturedRange.min, capturedRange.max);
        const finalRange = { min: newMin, max: newMax };
        if (finalRange.max > 0 && (finalRange.max - finalRange.min > 0.1)) {
            setCalibrationRange(finalRange);
            setShowCalibrationSuccess(true);
            setTimeout(() => setShowCalibrationSuccess(false), 4000);
            console.log("Calibration successful. New range:", finalRange);
        } else {
            console.warn("Calibration failed: insufficient movement.", capturedRange);
        }
        setTimeout(() => setGameStatus('idle'), 500); // Transition back to idle after a short delay
    }
  }, [calibrationStep]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono p-4 relative">
      {apiError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 border-2 border-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center space-x-3 animate-simpleFadeIn max-w-lg text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span className="text-sm">{apiError}</span>
            <button onClick={() => setApiError(null)} className="text-red-300 hover:text-white text-2xl leading-none flex-shrink-0">&times;</button>
        </div>
      )}
      <h1 className="text-5xl font-bold text-lime-400 mb-2 tracking-widest" style={{ textShadow: '0 0 10px #0f0' }}>PONG por Gestos</h1>
      <p className="text-green-400 mb-4" style={{ textShadow: '0 0 5px #0f0' }}>Controle a raquete com a sua mão!</p>
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
        {gameStatus !== 'running' && gameStatus !== 'calibrating' && (
          <InstructionOverlay
            status={gameStatus}
            onStart={startGame}
            onRestart={restartGame}
            webcamReady={webcamReady}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            showCalibrationSuccess={showCalibrationSuccess}
            isSoundEnabled={isSoundEnabled}
            onSoundToggle={setIsSoundEnabled}
          />
        )}
        <GameCanvas 
            status={gameStatus} 
            playerY={playerY}
            setGameStatus={setGameStatus}
            onGameOver={handleGameOver}
            difficulty={difficulty}
            onPointScored={handlePointScored}
            calibrationStep={gameStatus === 'calibrating' ? calibrationStep : null}
            calibrationPaddleY={calibrationPaddleY}
            calibrationHoldProgress={calibrationHoldProgress}
            lockedBoundaries={lockedBoundaries}
        />
         {aiMessage && (
          <div key={aiMessage} className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-fadeInOut">
            <p className="text-4xl font-bold text-yellow-300 text-center px-4" style={{ textShadow: '0 0 10px #ff0, 0 0 20px #f90' }}>
              {aiMessage}
            </p>
          </div>
        )}
      </div>
      <p className="mt-4 text-sm text-gray-400">Desenvolvido com React, MediaPipe, Tailwind CSS e ❤️ por Zehn & Gemini 2.5-flash</p>
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
                <video ref={videoRef} className="block w-full" style={{ transform: 'scaleX(-1)', display: showLandmarks ? 'none' : 'block' }} playsInline />
                <canvas ref={landmarkCanvasRef} className="block w-full bg-black" style={{ transform: 'scaleX(-1)', display: showLandmarks ? 'block' : 'none' }} />
            </div>
        </div>
      </div>
       <div className="absolute bottom-4 left-4 bg-black/70 text-white p-2 rounded-md font-mono text-xs z-50 border border-gray-700">
        <h4 className="font-bold text-lime-400 border-b border-gray-600 mb-1 pb-1">Debug Info</h4>
        {Object.entries(debugInfo).map(([key, value]) => (
          <p key={key} className={key === 'error' ? 'text-red-500' : ''}>
            <span className="text-gray-400">{key}:</span> {String(value)}
          </p>
        ))}
      </div>
    </div>
  );
};

export default App;