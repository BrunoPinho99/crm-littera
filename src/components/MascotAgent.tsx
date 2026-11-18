'use client';

import React, { useState, useEffect } from 'react';

export type MascotMode = 'idle' | 'working';

interface MascotAgentProps {
  mode?: MascotMode;
  interactive?: boolean;
  className?: string;
  onModeChange?: (mode: MascotMode) => void;
}

export default function MascotAgent({
  mode = 'idle',
  interactive = false,
  className = '',
  onModeChange,
}: MascotAgentProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [activeMode, setActiveMode] = useState<MascotMode>(mode);

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  // Animação cíclica contínua dos 16 quadros
  useEffect(() => {
    // 16 quadros:
    // idle (dormindo): 150ms por quadro para flutuação suave e calma
    // working (digitando no laptop): 100ms por quadro para ritmo ágil de digitação
    const speed = activeMode === 'working' ? 100 : 150;
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % 16);
    }, speed);

    return () => clearInterval(interval);
  }, [activeMode]);

  const toggleMode = () => {
    if (!interactive) return;
    const next = activeMode === 'idle' ? 'working' : 'idle';
    setActiveMode(next);
    if (onModeChange) onModeChange(next);
  };

  const imageSrc =
    activeMode === 'working'
      ? `/mascot/working/frame_${currentFrame}.png`
      : `/mascot/frame_${currentFrame}.png`;

  return (
    <div
      onClick={toggleMode}
      className={`relative inline-flex items-center justify-center select-none ${
        interactive ? 'cursor-pointer hover:opacity-90' : ''
      } ${className}`}
      title={
        interactive
          ? activeMode === 'idle'
            ? 'Agente Inativo (Dormindo) - Clique para simular Trabalho'
            : 'Agente Trabalhando no Laptop - Clique para pausar'
          : undefined
      }
    >
      {/* Bot pequeno */}
      <div className="relative w-9 h-7 sm:w-10 sm:h-8 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={activeMode === 'working' ? 'Robô Verde Trabalhando' : 'Robô Azul Dormindo'}
          className={`w-full h-full object-contain pointer-events-none transition-all duration-200 ${
            activeMode === 'working'
              ? 'drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]'
              : 'drop-shadow-[0_0_8px_rgba(59,130,246,0.35)]'
          }`}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      </div>
    </div>
  );
}
