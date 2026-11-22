'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Bot, 
  Play, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Clock, 
  DollarSign, 
  Calendar, 
  Database,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { AgenteExecucao, LoteDiario } from '@/types/database';
import { getHistoricoExecucoesAction, getLoteHojeAction, getLastAgentExecution } from '@/actions/leads';
import RodarAgenteModal from '@/components/RodarAgenteModal';

interface AgenteClientProps {
  initialHistorico: AgenteExecucao[];
  initialLoteHoje: LoteDiario | null;
  initialUltimaExecucao: AgenteExecucao | null;
}

function formatSaoPaulo(dateString?: string | null): string {
  if (!dateString) return '-';
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

export default function AgenteClient({
  initialHistorico,
  initialLoteHoje,
  initialUltimaExecucao,
}: AgenteClientProps) {
  const [historico, setHistorico] = useState<AgenteExecucao[]>(initialHistorico);
  const [loteHoje, setLoteHoje] = useState<LoteDiario | null>(initialLoteHoje);
  const [ultimaExecucao, setUltimaExecucao] = useState<AgenteExecucao | null>(initialUltimaExecucao);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const atualizarDados = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [novoHist, novoLote, novaExec] = await Promise.all([
        getHistoricoExecucoesAction(50),
        getLoteHojeAction(),
        getLastAgentExecution(),
      ]);
      setHistorico(novoHist);
      setLoteHoje(novoLote);
      setUltimaExecucao(novaExec);
    } catch (err) {
      console.error('Erro ao atualizar dados do agente:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Polling automático a cada 15 segundos enquanto houver execução 'rodando'
  useEffect(() => {
    const isRodando = historico.some((h) => h.status === 'rodando') || ultimaExecucao?.status === 'rodando';
    let interval: NodeJS.Timeout | null = null;

    if (isRodando) {
      interval = setInterval(() => {
        atualizarDados();
      }, 15000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [historico, ultimaExecucao, atualizarDados]);

  const diasRestantes = ultimaExecucao?.detalhes?.dias_restantes;
  const isBaseAcabando = typeof diasRestantes === 'number' && diasRestantes < 5;

  return (
    <div className="space-y-6">
      {/* Botão Voltar e Título */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-neutral-200 mb-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao CRM</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-100">
                Agente SDR Diário
              </h1>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Rotina automatizada de qualificação, personalização e entrega de 20 leads por dia
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => atualizarDados()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-800 transition cursor-pointer"
            title="Atualizar lista agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Rodar agente agora</span>
          </button>
        </div>
      </div>

      {/* Alerta de Base Esgotando (< 5 dias) */}
      {isBaseAcabando && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-xs animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold">Atenção: Base de prospecção acabando</h4>
            <p>
              A base atual rende cerca de <strong>{diasRestantes} dias</strong>. Amplie as regiões em <code>scripts/config/regioes.json</code> e rode o importador do Censo para garantir novos leads qualificados.
            </p>
          </div>
        </div>
      )}

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lote de Hoje */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400 font-semibold">
            <span>Lote de Hoje</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-neutral-100">
            {loteHoje ? `${loteHoje.quantidade} de 20` : '0 de 20'}
          </div>
          <div className="text-[11px] text-slate-500">
            {loteHoje?.motivo_incompleto ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Incompleto: {loteHoje.motivo_incompleto}
              </span>
            ) : loteHoje?.quantidade === 20 ? (
              <span className="text-emerald-600 font-bold">Meta completa entregue!</span>
            ) : (
              <span>Nenhum lote entregue hoje</span>
            )}
          </div>
        </div>

        {/* Status Atual do Agente */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400 font-semibold">
            <span>Status da Operação</span>
            <Bot className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-center gap-2">
            {ultimaExecucao?.status === 'rodando' ? (
              <>
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">Rodando</span>
              </>
            ) : ultimaExecucao?.status === 'sucesso' ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Pronto</span>
              </>
            ) : ultimaExecucao?.status === 'erro' ? (
              <>
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span className="text-lg font-bold text-rose-600 dark:text-rose-400">Falha</span>
              </>
            ) : (
              <span className="text-lg font-bold text-slate-400">Inativo</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate" title={ultimaExecucao?.etapa_atual || ''}>
            {ultimaExecucao?.status === 'rodando'
              ? `Fase: ${ultimaExecucao?.etapa_atual || 'Processando'}`
              : `Último: ${formatSaoPaulo(ultimaExecucao?.finalizado_em || ultimaExecucao?.iniciado_em)}`}
          </p>
        </div>

        {/* Custo Total USD */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400 font-semibold">
            <span>Custo da Última Execução</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-neutral-100">
            ${Number(ultimaExecucao?.custo_total_usd || 0).toFixed(4)} <span className="text-xs text-slate-400 font-normal">USD</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Teto diário configurado: <strong>$5.00 USD</strong>
          </p>
        </div>

        {/* Dias Restantes na Base */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-neutral-400 font-semibold">
            <span>Autonomia da Base</span>
            <Database className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-neutral-100">
            {typeof diasRestantes === 'number' ? `~${diasRestantes} dias` : 'Calculando...'}
          </div>
          <p className="text-[11px] text-slate-500">
            {isBaseAcabando ? (
              <span className="text-amber-600 font-bold">Abaixo de 5 dias</span>
            ) : (
              <span>Capacidade para atender a meta diária</span>
            )}
          </p>
        </div>
      </div>

      {/* Histórico de Execuções */}
      <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-neutral-200">
              Histórico de Execuções do Robô
            </h2>
          </div>
          <span className="text-xs text-slate-400 dark:text-neutral-500">
            {historico.length} execuções registradas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-neutral-800 text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-[10px] bg-slate-50/50 dark:bg-neutral-900/50">
                <th className="py-3.5 px-6 font-semibold">Início & Fim</th>
                <th className="py-3.5 px-6 font-semibold">Gatilho</th>
                <th className="py-3.5 px-6 font-semibold">Status & Etapa</th>
                <th className="py-3.5 px-6 font-semibold text-center">Leads Entregues</th>
                <th className="py-3.5 px-6 font-semibold text-right">Custo Estimado</th>
                <th className="py-3.5 px-6 font-semibold">Mensagem / Diagnóstico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80 text-slate-700 dark:text-neutral-300">
              {historico.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-neutral-500">
                    Nenhuma execução do robô registrada ainda.
                  </td>
                </tr>
              ) : (
                historico.map((exec) => {
                  const isRodando = exec.status === 'rodando';
                  const isSucesso = exec.status === 'sucesso';
                  const isErro = exec.status === 'erro';

                  return (
                    <tr key={exec.id} className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/40 transition">
                      {/* Datas */}
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-neutral-100">
                          {formatSaoPaulo(exec.iniciado_em)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {exec.finalizado_em ? `Fim: ${formatSaoPaulo(exec.finalizado_em)}` : 'Em andamento'}
                        </div>
                      </td>

                      {/* Gatilho */}
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          exec.gatilho === 'agendado'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                        }`}>
                          {exec.gatilho || 'manual'}
                        </span>
                      </td>

                      {/* Status & Etapa */}
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isRodando && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 animate-pulse">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Rodando
                            </span>
                          )}
                          {isSucesso && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Sucesso
                            </span>
                          )}
                          {isErro && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                              <AlertCircle className="w-2.5 h-2.5" />
                              Erro
                            </span>
                          )}
                        </div>
                        {exec.etapa_atual && (
                          <div className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1 font-mono">
                            {exec.etapa_atual}
                          </div>
                        )}
                      </td>

                      {/* Leads Entregues */}
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-neutral-100">
                          {exec.leads_inseridos}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">leads</span>
                      </td>

                      {/* Custo USD */}
                      <td className="py-3.5 px-6 text-right whitespace-nowrap font-mono text-xs">
                        ${Number(exec.custo_total_usd || 0).toFixed(4)}
                      </td>

                      {/* Mensagem */}
                      <td className="py-3.5 px-6 max-w-md">
                        <p className="text-xs text-slate-600 dark:text-neutral-300 truncate" title={exec.mensagem || ''}>
                          {exec.mensagem || '-'}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RodarAgenteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          atualizarDados();
        }}
      />
    </div>
  );
}
