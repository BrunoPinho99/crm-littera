'use client';

import React from 'react';

export type MascotMode = 'idle' | 'working';

interface MascotAgentProps {
  mode?: MascotMode;
  className?: string;
}

export default function MascotAgent({
  mode = 'idle',
  className = '',
}: MascotAgentProps) {
  const isWorking = mode === 'working';

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* ================= CÍRCULO VERDE PISCANDO / PULSANDO AO REDOR QUANDO ESTÁ TRABALHANDO ================= */}
      {isWorking && (
        <>
          {/* Onda circular de pulso em expansão (radar/pulse suave) */}
          <span className="absolute w-9 h-9 rounded-full border-2 border-emerald-400 pointer-events-none animate-[greenCirclePulse_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
          
          {/* Segunda onda defasada para efeito ultra smooth */}
          <span className="absolute w-9 h-9 rounded-full border border-emerald-500/60 pointer-events-none animate-[greenCirclePulse_2s_cubic-bezier(0,0,0.2,1)_infinite_1s]" />

          {/* Anel de luz suave permanente envolta com glow verde */}
          <span className="absolute w-8 h-8 rounded-full border border-emerald-500/40 pointer-events-none animate-[greenGlowPulse_2s_ease-in-out_infinite]" />
        </>
      )}

      {/* ================= PERSONAGEM MASCOTE (SUAVE / SMOOTH) ================= */}
      <div
        className={`relative z-10 w-8 h-8 flex items-center justify-center transition-all duration-500 ease-out ${
          isWorking
            ? 'animate-[smoothType_1.8s_ease-in-out_infinite]'
            : 'animate-[smoothFloat_3.2s_ease-in-out_infinite]'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isWorking ? '/mascot/working_bot.png' : '/mascot/idle_bot.png'}
          alt={isWorking ? 'Robô Verde Trabalhando' : 'Robô Azul Dormindo'}
          className={`w-full h-full object-contain pointer-events-none transition-all duration-500 ${
            isWorking
              ? 'drop-shadow-[0_0_10px_rgba(16,185,129,0.7)] brightness-105'
              : 'drop-shadow-[0_0_8px_rgba(59,130,246,0.4)] opacity-95'
          }`}
          style={{
            imageRendering: 'pixelated',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
