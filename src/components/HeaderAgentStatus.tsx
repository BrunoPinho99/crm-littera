'use client';

import React, { useState } from 'react';
import MascotAgent, { MascotMode } from './MascotAgent';

export default function HeaderAgentStatus() {
  const [mode, setMode] = useState<MascotMode>('working');

  return (
    <button
      type="button"
      onClick={() => setMode((prev) => (prev === 'idle' ? 'working' : 'idle'))}
      className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all duration-300 select-none shadow-sm cursor-pointer ${
        mode === 'working'
          ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-950/30'
          : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
      }`}
      title="Clique para alternar o status do robô (Trabalhando / Inativo)"
    >
      {/* Mascote com círculo pulsante suave quando verde */}
      <div className="relative flex items-center justify-center w-8 h-8">
        <MascotAgent mode={mode} />
      </div>

      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              mode === 'working' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-blue-400'
            }`}
          />
          <span
            className={`text-xs font-medium transition-colors duration-300 ${
              mode === 'working' ? 'text-emerald-300' : 'text-neutral-200'
            }`}
          >
            {mode === 'working' ? 'Agente Trabalhando' : 'Agente Inativo'}
          </span>
        </div>
        <span className="text-[10px] text-neutral-400">
          {mode === 'working' ? 'Prospecção Ativa (DF)' : 'Modo de Espera'}
        </span>
      </div>
    </button>
  );
}
