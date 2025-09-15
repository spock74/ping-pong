import React from 'react';
import type { GameStatus, Difficulty } from '../types';
import { startAudioContext } from '../utils/sounds';

interface InstructionOverlayProps {
  status: GameStatus;
  webcamReady: boolean;
  onStart: () => void;
  onRestart: () => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  showCalibrationSuccess: boolean;
  isSoundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
}

const LoadingSpinner: React.FC = () => (
  <div className="w-12 h-12 border-4 border-t-transparent border-lime-500 rounded-full animate-spin"></div>
);

const DifficultyButton: React.FC<{
  level: Difficulty;
  current: Difficulty;
  onClick: (level: Difficulty) => void;
  children: React.ReactNode;
}> = ({ level, current, onClick, children }) => {
  const isActive = level === current;
  const baseClasses = 'px-6 py-2 text-lg font-bold rounded-md transition-all duration-200 transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black';
  const activeClasses = 'bg-lime-500 text-white shadow-[0_0_10px_#0f0] scale-105';
  const inactiveClasses = 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white';

  const handleClick = () => {
    startAudioContext();
    onClick(level);
  };

  return (
    <button onClick={handleClick} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}>
      {children}
    </button>
  );
};

const InstructionOverlay: React.FC<InstructionOverlayProps> = ({ status, webcamReady, onStart, onRestart, difficulty, onDifficultyChange, showCalibrationSuccess, isSoundEnabled, onSoundToggle }) => {
  const isIdle = status === 'idle';
  const isOver = status === 'over';
  const isPaused = status === 'paused';

  const handleStartGame = () => {
    startAudioContext();
    onStart();
  };
  
  const handleRestart = () => {
    startAudioContext();
    onRestart();
  };
  
  const handleSoundToggle = () => {
    // Attempt to start audio context if user is enabling sound for the first time
    if (!isSoundEnabled) {
      startAudioContext();
    }
    onSoundToggle(!isSoundEnabled);
  };

  if (isPaused) {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-center p-8 z-10">
        <h2 className="text-6xl font-bold mb-4 animate-pulse" style={{ textShadow: '0 0 10px #0f0' }}>
          Jogo Pausado
        </h2>
        <p className="text-xl mt-4">
          Faça o gesto de mão espalhada (🖐️) para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="relative absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-center p-4 z-10">
      <h2 className="text-5xl font-bold mb-4" style={{ textShadow: '0 0 10px #0f0' }}>
        {isIdle ? 'Prepare-se!' : 'Fim de Jogo!'}
      </h2>
      
      {isIdle && (
        <>
          <p className="text-lg mb-4 max-w-2xl leading-relaxed">
            Controle a raquete <span className="text-lime-400 font-bold">verde</span> com a mão fechada (✊). <br />
            Faça <span className="text-blue-400 font-bold">joinha (👍)</span> para iniciar.
            Use <span className="text-orange-400 font-bold">vitória (✌️)</span> para calibrar. <br />
            Pause com <span className="text-yellow-400 font-bold">mão espalhada (🖐️)</span>.
            Resete com <span className="text-red-500 font-bold">polegar para baixo (👎)</span>.
          </p>

          <div className="flex flex-col items-center gap-y-4 mb-6">
            <div>
              <h3 className="text-xl text-gray-400 uppercase tracking-wider mb-3">Dificuldade</h3>
              <div className="flex justify-center space-x-4">
                <DifficultyButton level="easy" current={difficulty} onClick={onDifficultyChange}>Fácil</DifficultyButton>
                <DifficultyButton level="medium" current={difficulty} onClick={onDifficultyChange}>Médio</DifficultyButton>
                <DifficultyButton level="hard" current={difficulty} onClick={onDifficultyChange}>Difícil</DifficultyButton>
              </div>
            </div>
          </div>
        </>
      )}

      {isOver && (
         <button
            onClick={handleRestart}
            className="px-8 py-4 mb-4 text-2xl font-bold rounded-lg transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-white shadow-[0_0_15px_#0f0] hover:shadow-[0_0_25px_#0f0]"
        >
            Jogar Novamente
        </button>
      )}

      {isIdle && (
        <div className="flex flex-col items-center space-y-3">
            <button
              onClick={handleStartGame}
              disabled={!webcamReady}
              className="w-72 px-8 py-4 text-2xl font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                  bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-white
                  shadow-[0_0_15px_#0f0] hover:shadow-[0_0_25px_#0f0]"
            >
              Iniciar Jogo
            </button>
            
            {/* Sound Toggle Switch */}
            <div
              onClick={!webcamReady ? undefined : handleSoundToggle}
              className={`
                w-72 px-6 py-2 text-lg font-bold rounded-lg transition-all duration-300
                bg-gray-700 text-gray-300 border-2 border-gray-600
                flex items-center justify-between
                ${!webcamReady ? 'opacity-50 cursor-not-allowed' : 'transform hover:scale-105 hover:bg-gray-600 hover:text-white cursor-pointer'}
              `}
              aria-label={isSoundEnabled ? "Desativar som" : "Ativar som"}
              role="button"
              tabIndex={!webcamReady ? -1 : 0}
              onKeyDown={(e) => {
                  if (!webcamReady) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSoundToggle();
                  }
              }}
            >
              <span className="flex items-center space-x-3 pointer-events-none">
                {isSoundEnabled ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
                <span>Som</span>
              </span>
              <div
                role="switch"
                aria-checked={isSoundEnabled}
                className={`
                  pointer-events-none relative inline-flex flex-shrink-0 items-center h-8 w-14 rounded-full transition-colors duration-300 ease-in-out
                  ${isSoundEnabled ? 'bg-lime-500' : 'bg-gray-800 border-2 border-gray-600'}
                `}
              >
                <span className={`
                  inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ease-in-out
                  shadow-lg
                  ${isSoundEnabled ? 'translate-x-7' : 'translate-x-1'}
                `} />
              </div>
            </div>
            {!webcamReady && (
                <div className="flex items-center justify-center pt-4">
                <LoadingSpinner />
                <p className="ml-3 text-yellow-400">Iniciando webcam...</p>
                </div>
            )}
        </div>
      )}

      {/* Calibration Success Dialog */}
      {isIdle && showCalibrationSuccess && (
          <div className="absolute inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-20 transition-opacity duration-300 animate-fadeIn">
              <svg className="w-16 h-16 text-lime-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <h2 className="text-4xl font-bold text-lime-400" style={{ textShadow: '0 0 10px #0f0' }}>
                  Calibração bem-sucedida!
              </h2>
              <p className="text-lg mt-2">Os controles foram ajustados.</p>
          </div>
      )}
    </div>
  );
};

export default InstructionOverlay;
