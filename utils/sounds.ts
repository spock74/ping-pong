// This file uses the global Tone object loaded from the CDN
declare const Tone: any;

let synths: {
  paddle: any;
  wall: any;
  score: any;
  gameOver: any;
} | null = null;

let isAudioInitialized = false;

// Function to initialize the synths after Tone.start()
const initializeSynths = () => {
  if (synths || typeof Tone === 'undefined') return;

  synths = {
    paddle: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 } }).toDestination(),
    wall: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 } }).toDestination(),
    score: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.2 } }).toDestination(),
    gameOver: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.4 } }).toDestination(),
  };
};

/**
 * This must be called from a user interaction (e.g., button click) to initialize the audio context.
 */
export const startAudioContext = async () => {
  if (isAudioInitialized || typeof Tone === 'undefined') return;
  try {
    await Tone.start();
    initializeSynths();
    isAudioInitialized = true;
    console.log('Audio context started successfully.');
  } catch (e) {
    console.error('Could not start audio context: ', e);
  }
};

export const playPaddleHit = () => {
  if (!synths) return;
  synths.paddle.triggerAttackRelease('C4', '8n');
};

export const playWallHit = () => {
  if (!synths) return;
  synths.wall.triggerAttackRelease('G3', '8n');
};

export const playScoreSound = () => {
  if (!synths) return;
  synths.score.triggerAttackRelease(['C5', 'G5'], '16n');
};

export const playGameOverSound = () => {
  if (!synths) return;
  synths.gameOver.triggerAttackRelease(['G4', 'C4'], '4n');
};
