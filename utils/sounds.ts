// This file uses the global Tone object loaded from the CDN
declare const Tone: any;

let synths: {
  paddle: any;
  wall: any;
  score: any;
  gameOver: any;
} | null = null;

let isAudioInitialized = false;
let isGameOverSoundPlayed = false;
let isGloballySoundEnabled = true; // Master sound control

// Throttling for hit sounds to prevent Tone.js errors on rapid calls
let lastPaddleHitTime = 0;
let lastWallHitTime = 0;
const HIT_COOLDOWN = 50; // 50ms cooldown for hit sounds

/**
 * Sets the global sound state for the application.
 * @param enabled - Whether sound should be enabled or not.
 */
export const setSoundEnabled = (enabled: boolean) => {
  isGloballySoundEnabled = enabled;
};

// Function to initialize the synths after Tone.start()
const initializeSynths = () => {
  if (synths || typeof Tone === 'undefined') return;

  // Create score synth
  const scoreSynth = new Tone.PolySynth().toDestination();
  scoreSynth.set({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.2 },
  });

  // Create game over synth
  const gameOverSynth = new Tone.PolySynth().toDestination();
  gameOverSynth.set({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.4 },
  });

  synths = {
    paddle: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 } }).toDestination(),
    wall: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 } }).toDestination(),
    score: scoreSynth,
    gameOver: gameOverSynth,
  };
};

/**
 * This must be called from a user interaction (e.g., button click) to initialize the audio context.
 */
export const startAudioContext = async () => {
  if (isAudioInitialized || typeof Tone === 'undefined' || !isGloballySoundEnabled) return;
  try {
    await Tone.start();
    initializeSynths();
    isAudioInitialized = true;
    console.log('Audio context started successfully.');
  } catch (e) {
    console.error('Could not start audio context: ', e);
  }
};

/**
 * Resets the lock for the game over sound, allowing it to be played again in a new game.
 */
export const resetGameOverSoundLock = () => {
  isGameOverSoundPlayed = false;
};

export const playPaddleHit = () => {
  if (!synths || !isGloballySoundEnabled) return;
  const now = performance.now();
  if (now - lastPaddleHitTime > HIT_COOLDOWN) {
    synths.paddle.triggerAttackRelease('C4', '8n');
    lastPaddleHitTime = now;
  }
};

export const playWallHit = () => {
  if (!synths || !isGloballySoundEnabled) return;
  const now = performance.now();
  if (now - lastWallHitTime > HIT_COOLDOWN) {
    synths.wall.triggerAttackRelease('G3', '8n');
    lastWallHitTime = now;
  }
};

export const playScoreSound = () => {
  if (!synths || !isGloballySoundEnabled) return;
  synths.score.triggerAttackRelease(['C5', 'G5'], '16n');
};

export const playGameOverSound = () => {
  if (!synths || isGameOverSoundPlayed || !isGloballySoundEnabled) return;
  isGameOverSoundPlayed = true;
  synths.gameOver.triggerAttackRelease(['G4', 'C4'], '4n');
};
