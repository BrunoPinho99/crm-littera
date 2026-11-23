'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Bot, 
  Layers, 
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  Mail
} from 'lucide-react';
import Link from 'next/link';
import MascotAgent from './MascotAgent';
import { getLastAgentExecution } from '@/actions/leads';
import { AgenteExecucao } from '@/types/database';
import RodarAgenteModal from './RodarAgenteModal';
import { Play } from 'lucide-react';

interface SidebarProps {
  currentTab: 'leads' | 'kanban';
  onTabChange: (tab: 'leads' | 'kanban') => void;
  totalLeads: number;
}

function formatSaoPaulo(dateString: string): string {
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

export default function Sidebar({
  currentTab,
  onTabChange,
  totalLeads,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredFlyout, setHoveredFlyout] = useState<string | null>(null);
  const [execution, setExecution] = useState<AgenteExecucao | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = () => {
      getLastAgentExecution()
        .then((data) => {
          if (isMounted) {
            setExecution(data);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('Erro ao buscar status do agente na Sidebar:', err);
          if (isMounted) setLoading(false);
        });
    };

    fetchStatus();

    let interval: NodeJS.Timeout | null = null;
    if (execution?.status === 'rodando') {
      interval = setInterval(fetchStatus, 15000);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [execution?.status]);

  const agentMascotMode = execution?.status === 'rodando' ? 'working' : 'idle';

  return (
    <>
      {/* ESPAÇADOR FIXO PARA O CONTEÚDO NÃO FICAR EMBAIXO DO MENU (SEMPRE 64px / w-16) */}
      <div className="w-16 shrink-0 pointer-events-none" aria-hidden="true" />

      {/* ================= BARRA LATERAL FIXA ESTÁTICA ================= */}
      <aside
        className={`fixed top-16 left-0 bottom-0 z-40 flex flex-col justify-between bg-white dark:bg-[#121215] border-r border-slate-200/90 dark:border-neutral-800/90 transition-all duration-300 ease-in-out shadow-xl ${
          isOpen ? 'w-72' : 'w-16'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-2.5 scrollbar-thin">
          {/* Header do Menu */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-neutral-800/80">
            {isOpen ? (
              <div className="flex items-center gap-2.5 px-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  L
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-neutral-100 truncate">
                    Littera CRM
                  </h3>
                  <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono">
                    v2.6 • Produção
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center py-1">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  L
                </div>
              </div>
            )}

            {isOpen && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                title="Recolher Menu Lateral"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Navegação Principal */}
          <nav className="space-y-1 py-1">
            <button
              type="button"
              onClick={() => onTabChange('kanban')}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                currentTab === 'kanban'
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40 shadow-xs'
                  : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900/60 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
              title="Pipeline de Vendas (Kanban)"
            >
              <div className="w-6 flex justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              {isOpen && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">Pipeline Kanban</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                    4 fases
                  </span>
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange('leads')}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                currentTab === 'leads'
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40 shadow-xs'
                  : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900/60 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
              title="Tabela Completa de Leads"
            >
              <div className="w-6 flex justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              {isOpen && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">Lista de Empresas</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                    {totalLeads}
                  </span>
                </div>
              )}
            </button>

            <Link
              href="/configuracoes/score"
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900/60 hover:text-slate-900 dark:hover:text-neutral-200 transition cursor-pointer"
              title="Configurações de Score e Pesos de Qualificação"
            >
              <div className="w-6 flex justify-center shrink-0">
                <Sliders className="w-4 h-4" />
              </div>
              {isOpen && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">Pesos de Score</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                    Config
                  </span>
                </div>
              )}
            </Link>

            <Link
              href="/configuracoes/email"
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900/60 hover:text-slate-900 dark:hover:text-neutral-200 transition cursor-pointer"
              title="Configurações de Envio de E-mail e Aquecimento"
            >
              <div className="w-6 flex justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              {isOpen && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">Caixa de Envio</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400">
                    Brevo
                  </span>
                </div>
              )}
            </Link>

            <Link
              href="/agente"
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900/60 hover:text-slate-900 dark:hover:text-neutral-200 transition cursor-pointer"
              title="Histórico de Execuções do Agente SDR"
            >
              <div className="w-6 flex justify-center shrink-0">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              {isOpen && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">Agente SDR</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400">
                    Histórico
                  </span>
                </div>
              )}
            </Link>
          </nav>

          {/* Painel do Agente SDR Autônomo com Status Real */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800/80">
            {isOpen ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-slate-50/70 dark:bg-neutral-900/40">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 flex items-center justify-center shrink-0 shadow-xs">
                      <MascotAgent mode={agentMascotMode} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-800 dark:text-neutral-100 truncate">
                          Littera Scout
                        </span>
                        <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          SDR
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-neutral-400">
                        Prospecção B2B DF
                      </p>
                    </div>
                  </div>

                  {/* Status Real da Execução */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-neutral-800 text-xs">
                    {loading ? (
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400 text-[11px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verificando agente...</span>
                      </div>
                    ) : !execution ? (
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400 text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span>Nunca executado</span>
                      </div>
                    ) : execution.status === 'rodando' ? (
                      <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-[11px] font-semibold animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Rodando agora</span>
                      </div>
                    ) : execution.status === 'erro' ? (
                      <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400 text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Última execução falhou: {execution.mensagem || 'Erro na prospecção'}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>Última execução concluída</span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-neutral-400 pl-5">
                          {formatSaoPaulo(execution.finalizado_em || execution.iniciado_em)} — {execution.leads_inseridos} leads inseridos
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rotina Automática Diária e Botão de Disparo */}
                <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-neutral-900/60 border border-slate-200/80 dark:border-neutral-800/80 space-y-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-neutral-300 font-bold text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Rotina GitHub Actions</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-neutral-400 mt-1 leading-tight">
                      Disparo agendado às <strong>06:30 de Brasília</strong> (09:30 UTC) via leadbot.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer active:scale-95"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Rodar agente agora</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Versão Ícone quando o Menu está recolhido */
              <div
                className="relative flex flex-col items-center gap-2"
                onMouseEnter={() => setHoveredFlyout('bot')}
                onMouseLeave={() => setHoveredFlyout(null)}
              >
                <div
                  className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 flex items-center justify-center relative shadow-xs"
                  title="SDR Autônomo"
                >
                  <MascotAgent mode={agentMascotMode} />
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-neutral-900 ${
                      execution?.status === 'rodando'
                        ? 'bg-blue-500 animate-pulse'
                        : execution?.status === 'sucesso'
                        ? 'bg-emerald-500'
                        : execution?.status === 'erro'
                        ? 'bg-red-500'
                        : 'bg-slate-400'
                    }`}
                  />
                </div>

                {/* Flyout Menu quando colapsado */}
                {hoveredFlyout === 'bot' && (
                  <div className="absolute left-16 top-0 ml-2 z-50 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-700 rounded-xl shadow-xl p-3 min-w-[220px] animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-neutral-100">
                        Littera Scout SDR
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-neutral-300 mt-2">
                      {!execution ? (
                        <span>Nunca executado</span>
                      ) : execution.status === 'rodando' ? (
                        <span className="text-blue-600 font-semibold">Rodando agora</span>
                      ) : execution.status === 'erro' ? (
                        <span className="text-red-600">Falha: {execution.mensagem || 'Erro'}</span>
                      ) : (
                        <span>
                          Última execução: {formatSaoPaulo(execution.finalizado_em || execution.iniciado_em)} — {execution.leads_inseridos} leads inseridos
                        </span>
                      )}
                    </div>
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
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-neutral-900 hover:bg-slate-200 dark:hover:bg-neutral-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition cursor-pointer"
                title="Expandir Menu Lateral"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <RodarAgenteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => setIsModalOpen(false)}
      />
    </>
  );
}
