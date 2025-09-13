import React from 'react';
import type { GameStatus } from '../types';
import { WINNING_SCORE } from '../constants';

interface InstructionOverlayProps {
  status: GameStatus;
  webcamReady: boolean;
  onStart: () => void;
  onRestart: () => void;
}

const LoadingSpinner: React.FC = () => (
  <div className="w-12 h-12 border-4 border-t-transparent border-lime-500 rounded-full animate-spin"></div>
);

const InstructionOverlay: React.FC<InstructionOverlayProps> = ({ status, webcamReady, onStart, onRestart }) => {
  const isIdle = status === 'idle';
  const isOver = status === 'over';

  const title = isIdle ? 'Prepare-se!' : 'Fim de Jogo!';
  const buttonText = isIdle ? 'Iniciar Jogo' : 'Jogar Novamente';
  const buttonAction = isIdle ? onStart : onRestart;

  return (
    <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-center p-8 z-10">
      <h2 className="text-6xl font-bold mb-4" style={{ textShadow: '0 0 10px #0f0' }}>
        {title}
      </h2>
      
      {isIdle && (
        <>
          <p className="text-lg mb-6 max-w-md">
            Permita o acesso à webcam e levante sua mão na frente da câmera. Mova sua mão para cima e para baixo para controlar a raquete <span className="text-lime-400 font-bold">verde</span>. O primeiro a fazer {WINNING_SCORE} pontos vence!
          </p>
          {!webcamReady && (
            <div className="flex flex-col items-center justify-center mb-6">
              <LoadingSpinner />
              <p className="mt-3 text-yellow-400">Iniciando webcam...</p>
            </div>
          )}
        </>
      )}

      {(isIdle || isOver) && (
        <button
          onClick={buttonAction}
          disabled={isIdle && !webcamReady}
          className="px-8 py-4 text-2xl font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
            bg-gradient-to-r from-lime-500 to-green-500 hover:from-lime-400 hover:to-green-400 text-white
            shadow-[0_0_15px_#0f0] hover:shadow-[0_0_25px_#0f0]"
        >
          {buttonText}
        </button>
      )}
    </div>
  );
};

export default InstructionOverlay;