'use client';

import React, { useState, useEffect } from 'react';

interface WordSwapProps {
  phrases?: string[];
  className?: string;
  intervalMs?: number;
}

const DEFAULT_PHRASES = [
  'Analisando porte da escola e alunos matriculados...',
  'Pesquisando e-mails pedagógicos e diretores...',
  'Filtrando escolas particulares com maior potencial...',
  'Curando dados de contato dos decisores no DF...',
  'Classificando leads de alta conversão (Tier 1)...',
  'Higienizando telefones e verificando WhatsApp...',
  'Enviando apenas os leads mais qualificados para o CRM...'
];

export default function WordSwap({
  phrases = DEFAULT_PHRASES,
  className = '',
  intervalMs = 2800,
}: WordSwapProps) {
  const [index, setIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');

  useEffect(() => {
    const timer = setInterval(() => {
      // Fade out
      setFadeState('out');
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % phrases.length);
        setFadeState('in');
      }, 300);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [phrases, intervalMs]);

  return (
    <div className={`overflow-hidden transition-all duration-300 ${className}`}>
      <span
        className={`inline-block transition-all duration-300 ease-out transform ${
          fadeState === 'in'
            ? 'opacity-100 translate-y-0 filter blur-0'
            : 'opacity-0 -translate-y-2 filter blur-[2px]'
        }`}
      >
        {phrases[index]}
      </span>
    </div>
  );
}
