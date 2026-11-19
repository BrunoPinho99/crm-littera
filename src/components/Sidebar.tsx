'use client';

import React, { useState } from 'react';
import MascotAgent, { MascotMode } from './MascotAgent';
import WordSwap from './WordSwap';
import { 
  Users, 
  Bot, 
  Sparkles, 
  Layers, 
  Clock,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Award
} from 'lucide-react';

interface SidebarProps {
  currentTab: 'leads' | 'kanban';
  onTabChange: (tab: 'leads' | 'kanban') => void;
  agentMode: MascotMode;
  onToggleAgentMode: () => void;
  totalLeads: number;
  curatedCount: number;
  onRunCurator?: () => void;
  isCurating?: boolean;
}

export default function Sidebar({
  currentTab,
  onTabChange,
  agentMode,
  onToggleAgentMode,
  totalLeads,
  curatedCount,
  onRunCurator,
  isCurating = false,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredFlyout, setHoveredFlyout] = useState<string | null>(null);
  const isWorking = agentMode === 'working';

  return (
    <>
      {/* ESPAÇADOR FIXO PARA O CONTEÚDO NÃO FICAR EMBAIXO DO MENU (SEMPRE 64px / w-16) */}
      <div className="w-16 shrink-0 pointer-events-none" aria-hidden="true" />

      {/* ================= BARRA LATERAL FIXA ESTÁTICA (NAVEGAÇÃO INDEPENDENTE DE SCROLL) ================= */}
      <aside
        className={`fixed top-16 left-0 bottom-0 z-40 flex flex-col justify-between bg-white dark:bg-[#121215] border-r border-slate-200/90 dark:border-neutral-800/90 transition-all duration-300 ease-in-out shadow-xl ${
          isOpen ? 'w-72' : 'w-16'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-2.5 scrollbar-thin">
          {/* Header do Menu: Identificação + Botão de Toggle Abrir/Fechar */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-neutral-800/80">
            {isOpen ? (
              <div className="flex items-center gap-2.5 px-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  B
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-xs text-slate-800 dark:text-neutral-100 truncate">
                    Beyond CRM
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-neutral-500 truncate">
                    Littera Workspace
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  B
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-1.5 rounded-lg text-slate-400 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              title={isOpen ? 'Recolher menu lateral' : 'Expandir menu lateral'}
            >
              {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Navegação Principal */}
          <div className="space-y-1">
            {isOpen && (
              <span className="px-2 text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-500 block mb-1">
                Visualização
              </span>
            )}

            {/* Item 1: Todas as Empresas */}
            <div
              className="relative"
              onMouseEnter={() => !isOpen && setHoveredFlyout('leads')}
              onMouseLeave={() => setHoveredFlyout(null)}
            >
              <button
                type="button"
                onClick={() => onTabChange('leads')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  currentTab === 'leads'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/40'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800/60'
                } ${!isOpen ? 'justify-center px-0' : ''}`}
                title="Todas as Empresas"
              >
                <Users className={`w-4 h-4 shrink-0 ${currentTab === 'leads' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                {isOpen && (
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="truncate">Todas as Empresas</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                      {totalLeads}
                    </span>
                  </div>
                )}
              </button>

              {/* Flyout Menu quando colapsado */}
              {!isOpen && hoveredFlyout === 'leads' && (
                <div className="absolute left-16 top-0 ml-2 z-50 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-700 rounded-xl shadow-xl p-2 min-w-[160px] animate-in fade-in duration-150">
                  <div className="text-[11px] font-bold text-slate-800 dark:text-neutral-100 px-2 py-1">
                    Todas as Empresas ({totalLeads})
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-neutral-400 px-2 pb-1">
                    Visualizar lista completa em tabela
                  </div>
                </div>
              )}
            </div>

            {/* Item 2: Kanban */}
            <div
              className="relative"
              onMouseEnter={() => !isOpen && setHoveredFlyout('kanban')}
              onMouseLeave={() => setHoveredFlyout(null)}
            >
              <button
                type="button"
                onClick={() => onTabChange('kanban')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  currentTab === 'kanban'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/40'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800/60'
                } ${!isOpen ? 'justify-center px-0' : ''}`}
                title="Quadro Kanban"
              >
                <Layers className={`w-4 h-4 shrink-0 ${currentTab === 'kanban' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                {isOpen && (
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="truncate">Visualização Kanban</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
                      Pipeline
                    </span>
                  </div>
                )}
              </button>

              {/* Flyout Menu quando colapsado */}
              {!isOpen && hoveredFlyout === 'kanban' && (
                <div className="absolute left-16 top-0 ml-2 z-50 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-700 rounded-xl shadow-xl p-2 min-w-[160px] animate-in fade-in duration-150">
                  <div className="text-[11px] font-bold text-slate-800 dark:text-neutral-100 px-2 py-1">
                    Visualização Kanban
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-neutral-400 px-2 pb-1">
                    Arraste cards entre os estágios
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Seção SDR AGENTE INTELIGENTE */}
          <div className="pt-4 mt-2 border-t border-slate-100 dark:border-neutral-800/80">
            {isOpen ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-neutral-500 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Robô SDR Autônomo</span>
                  </span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isWorking ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-slate-300 dark:bg-neutral-600'
                    }`}
                  />
                </div>

                {/* Card do Bot Aberto */}
                <div
                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                    isWorking
                      ? 'bg-gradient-to-b from-emerald-50/70 dark:from-emerald-950/30 to-white dark:to-neutral-900/60 border-emerald-300 dark:border-emerald-500/30 shadow-xs'
                      : 'bg-slate-50 dark:bg-neutral-900/40 border-slate-200 dark:border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 flex items-center justify-center shrink-0 shadow-xs">
                      <MascotAgent mode={agentMode} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-800 dark:text-neutral-100 truncate">
                          Littera Scout
                        </span>
                        <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          SDR
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-neutral-400">
                        {isWorking ? 'Prospecção DF Ativa' : 'Em Standby'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-neutral-800 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-slate-500 dark:text-neutral-400">
                      Operação
                    </span>
                    <button
                      type="button"
                      onClick={onToggleAgentMode}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        isWorking
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-300 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {isWorking ? 'Pausar SDR' : 'Iniciar SDR'}
                    </button>
                  </div>

                  {/* Word Swap Animado */}
                  {isWorking && (
                    <div className="mt-2.5 p-2 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/20 text-xs">
                      <div className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 font-bold text-[9px] uppercase tracking-wide mb-0.5">
                        <Sparkles className="w-2.5 h-2.5 animate-spin text-emerald-600" />
                        <span>Curadoria em Andamento</span>
                      </div>
                      <WordSwap
                        className="text-slate-800 dark:text-neutral-200 text-[11px] font-medium leading-tight min-h-[30px] flex items-center"
                        intervalMs={2600}
                      />
                    </div>
                  )}
                </div>

                {/* Rotina das 19h */}
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400 font-bold text-[11px]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Rotina Diária 19h (DF)</span>
                  </div>
                  <p className="text-[10px] text-amber-900/90 dark:text-amber-300/80 mt-1 leading-tight">
                    Entrega de <strong>80 empresas</strong> com Decisor, WhatsApp e E-mail.
                  </p>
                </div>
              </div>
            ) : (
              /* Versão Ícone quando o Menu está fechado */
              <div
                className="relative flex flex-col items-center gap-2"
                onMouseEnter={() => setHoveredFlyout('bot')}
                onMouseLeave={() => setHoveredFlyout(null)}
              >
                <button
                  type="button"
                  onClick={onToggleAgentMode}
                  className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 flex items-center justify-center relative cursor-pointer hover:border-emerald-400 transition"
                  title="SDR Autônomo"
                >
                  <MascotAgent mode={agentMode} />
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-neutral-900 ${
                      isWorking ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                </button>

                {/* Flyout Menu quando colapsado no bot */}
                {hoveredFlyout === 'bot' && (
                  <div className="absolute left-16 top-0 ml-2 z-50 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-700 rounded-xl shadow-xl p-3 min-w-[200px] animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-neutral-100">
                        Littera Scout SDR
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-neutral-400 mt-1">
                      Status: {isWorking ? 'Curando 80 empresas/dia (DF)' : 'Pausado'}
                    </p>
                    <button
                      onClick={onToggleAgentMode}
                      className="mt-2 w-full py-1 text-center text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"
                    >
                      {isWorking ? 'Pausar SDR' : 'Ativar SDR'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé do Menu */}
        <div className="p-2.5 border-t border-slate-100 dark:border-neutral-800/80">
          {isOpen ? (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
                  Littera v2.6
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition cursor-pointer"
              >
                Recolher
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 transition cursor-pointer"
                title="Expandir menu"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
