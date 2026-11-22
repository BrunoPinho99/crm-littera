'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Play } from 'lucide-react';
import { getLastAgentExecution } from '@/actions/leads';
import { AgenteExecucao } from '@/types/database';
import RodarAgenteModal from './RodarAgenteModal';

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

export default function HeaderAgentStatus() {
  const [execution, setExecution] = useState<AgenteExecucao | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchStatus = useCallback(() => {
    getLastAgentExecution()
      .then((data) => {
        setExecution(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao buscar status do agente:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchStatus();

    // Se estiver 'rodando', atualiza a cada 15 segundos
    let interval: NodeJS.Timeout | null = null;
    if (execution?.status === 'rodando') {
      interval = setInterval(() => {
        fetchStatus();
      }, 15000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [execution?.status, fetchStatus]);

  return (
    <>
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-100/60 dark:bg-neutral-900/60 text-slate-500 dark:text-neutral-400 text-xs shadow-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
            <span className="text-[11px] font-medium">Verificando agente...</span>
          </div>
        ) : !execution ? (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-100/60 dark:bg-neutral-900/60 text-slate-600 dark:text-neutral-400 text-xs shadow-xs select-none"
            title="Nenhuma rotina do Agente SDR foi registrada até o momento"
          >
            <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500" />
            <span className="text-[11px] font-semibold">Nunca executado</span>
          </div>
        ) : execution.status === 'rodando' ? (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs shadow-xs animate-pulse select-none"
            title="O robô SDR está executando a rotina de prospecção agora"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-[11px] font-bold">
              {execution.etapa_atual || 'Rodando agora'} ({execution.leads_inseridos || 0} entregues)
            </span>
          </div>
        ) : execution.status === 'erro' ? (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs shadow-xs select-none"
            title={execution.mensagem || 'Falha na execução'}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-[11px] font-medium truncate max-w-[260px]">
              Falha: {execution.mensagem || 'Erro na prospecção'}
            </span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs shadow-xs select-none"
            title={`Última execução finalizada com sucesso em ${formatSaoPaulo(execution.finalizado_em || execution.iniciado_em)}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-medium">
              Última execução: <strong className="font-semibold">{formatSaoPaulo(execution.finalizado_em || execution.iniciado_em)}</strong> — {execution.leads_inseridos} leads entregues
            </span>
          </div>
        )}

        {/* Botão Rodar Agente Agora */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer active:scale-95"
          title="Disparar workflow do Agente SDR no GitHub Actions"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="hidden sm:inline">Rodar agente agora</span>
        </button>
      </div>

      <RodarAgenteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          fetchStatus();
        }}
      />
    </>
  );
}
