import React, { useState, useEffect } from 'react';
import type { GameStatus, Difficulty, GestureType } from '../types';
import { WINNING_SCORE } from '../constants';
import { startAudioContext } from '../utils/sounds';

interface InstructionOverlayProps {
  status: GameStatus;
  webcamReady: boolean;
  onStart: () => void;
  onRestart: () => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  gestureType: GestureType;
  onGestureTypeChange: (type: GestureType) => void;
  onCalibrate: () => void;
  onStartCalibration: () => void;
  showCalibrationSuccess: boolean;
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

  return (
    <button onClick={() => onClick(level)} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}>
      {children}
    </button>
  );
};

const CalibrationScreen: React.FC<{ onStartCalibration: () => void }> = ({ onStartCalibration }) => {
    const [countdown, setCountdown] = useState<number | null>(null);

    const handleStart = () => {
        onStartCalibration();
        setCountdown(5);
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    return (
        <div className="flex flex-col items-center justify-center text-center">
            <h2 className="text-6xl font-bold mb-4" style={{ textShadow: '0 0 10px #0f0' }}>
                Calibração
            </h2>
            {countdown === null ? (
                <>
                    <p className="text-lg mb-8 max-w-md">
                        Para definir a área de jogo, mova sua mão lentamente do ponto mais baixo ao mais alto que você usará para controlar a raquete.
                    </p>
                    <button onClick={handleStart} className="px-8 py-4 text-2xl font-bold rounded-lg transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-white shadow-[0_0_15px_#0f0] hover:shadow-[0_0_25px_#0f0]">
                        Iniciar Calibração
                    </button>
                </>
            ) : (
                <>
                    <p className="text-2xl mb-4">Continue movendo sua mão...</p>
                    <div className="text-9xl font-bold text-lime-400" style={{ textShadow: '0 0 20px #0f0' }}>
                        {countdown > 0 ? countdown : 'Feito!'}
                    </div>
                </>
            )}
        </div>
    );
};

const InstructionOverlay: React.FC<InstructionOverlayProps> = ({ status, webcamReady, onStart, onRestart, difficulty, onDifficultyChange, gestureType, onGestureTypeChange, onCalibrate, onStartCalibration, showCalibrationSuccess }) => {
  const isIdle = status === 'idle';
  const isOver = status === 'over';
  const isPaused = status === 'paused';

  const handleStartGame = () => {
    startAudioContext();
    onStart();
  };

  if (status === 'calibrating') {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center p-8 z-10">
        <CalibrationScreen onStartCalibration={onStartCalibration} />
      </div>
    );
  }

  if (isPaused) {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-center p-8 z-10">
        <h2 className="text-6xl font-bold mb-4 animate-pulse" style={{ textShadow: '0 0 10px #0f0' }}>
          Jogo Pausado
        </h2>
        <p className="text-xl mt-4">
          Faça o gesto de mão espalhada para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="relative absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-center p-8 z-10">
      <h2 className="text-6xl font-bold mb-4" style={{ textShadow: '0 0 10px #0f0' }}>
        {isIdle ? 'Prepare-se!' : 'Fim de Jogo!'}
      </h2>
      
      {isIdle && (
        <>
          <p className="text-lg mb-6 max-w-2xl">
            Controle a raquete <span className="text-lime-400 font-bold">verde</span> com o gesto selecionado.
            Pause com a <span className="text-yellow-400 font-bold">mão espalhada</span>.
            Resete com o sinal de <span className="text-red-500 font-bold">pare</span>.
            O primeiro a fazer {WINNING_SCORE} pontos vence!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-xl text-gray-400 uppercase tracking-wider mb-3">Dificuldade</h3>
              <div className="flex justify-center space-x-4">
                <DifficultyButton level="easy" current={difficulty} onClick={onDifficultyChange}>Fácil</DifficultyButton>
                <DifficultyButton level="medium" current={difficulty} onClick={onDifficultyChange}>Médio</DifficultyButton>
                <DifficultyButton level="hard" current={difficulty} onClick={onDifficultyChange}>Difícil</DifficultyButton>
              </div>
            </div>
            <div>
              <h3 className="text-xl text-gray-400 uppercase tracking-wider mb-3">Gesto de Controle</h3>
              <div className="flex justify-center space-x-2 bg-gray-800 p-1 rounded-lg">
                  <button 
                      onClick={() => onGestureTypeChange('fist')}
                      className={`px-4 py-2 text-sm font-bold rounded-md transition-colors duration-200 w-32 ${gestureType === 'fist' ? 'bg-lime-500 text-white shadow-sm shadow-lime-300' : 'bg-transparent text-gray-400 hover:bg-gray-700'}`}
                  >
                      Mão Fechada
                  </button>
                  <button 
                      onClick={() => onGestureTypeChange('pointer')}
                      className={`px-4 py-2 text-sm font-bold rounded-md transition-colors duration-200 w-32 ${gestureType === 'pointer' ? 'bg-lime-500 text-white shadow-sm shadow-lime-300' : 'bg-transparent text-gray-400 hover:bg-gray-700'}`}
                  >
                      Apontar
                  </button>
              </div>
            </div>
          </div>
        </>
      )}

      {isOver && (
         <button
            onClick={onRestart}
            className="px-8 py-4 mb-6 text-2xl font-bold rounded-lg transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-white shadow-[0_0_15px_#0f0] hover:shadow-[0_0_25px_#0f0]"
        >
            Jogar Novamente
        </button>
      )}

      {isIdle && (
        <div className="flex flex-col items-center space-y-4">
            <button
            onClick={handleStartGame}
            disabled={!webcamReady}
            className="w-64 px-8 py-4 text-2xl font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-white
                shadow-[0_0_15px_#0f0] hover:shadow-[0_0_25px_#0f0]"
            >
            Iniciar Jogo
            </button>
            <button
            onClick={onCalibrate}
            disabled={!webcamReady}
            className="w-64 px-6 py-2 text-lg font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white border-2 border-gray-600"
            >
            Calibrar Controles
            </button>
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