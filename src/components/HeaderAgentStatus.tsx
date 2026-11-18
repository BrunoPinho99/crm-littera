'use client';

import React, { useState } from 'react';
import MascotAgent, { MascotMode } from './MascotAgent';

export default function HeaderAgentStatus() {
  const [mode, setMode] = useState<MascotMode>('idle');

  return (
    <div
      onClick={() => setMode((prev) => (prev === 'idle' ? 'working' : 'idle'))}
      className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 cursor-pointer transition-all duration-200 select-none shadow-sm"
      title="Clique para alternar o status do agente (Inativo / Trabalhando)"
    >
      {/* Mascote compacto animado */}
      <MascotAgent mode={mode} />

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              mode === 'working' ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'
            }`}
          />
          <span className="text-xs font-medium text-neutral-200">
            {mode === 'working' ? 'Agente em Execução' : 'Agente Inativo'}
          </span>
        </div>
        <span className="text-[10px] text-neutral-400">
          {mode === 'working' ? 'Prospecção Ativa (DF)' : 'Pausa (08:00 UTC)'}
        </span>
      </div>
    </div>
  );
}
