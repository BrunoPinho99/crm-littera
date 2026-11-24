'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  AlertOctagon,
  Clock,
  RefreshCw,
  Mail,
  DollarSign,
  Layers,
  XCircle,
  ShieldAlert,
  Send,
  MessageSquare,
  Users,
  Video,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  DadosPainelSaude,
  resolverAlertaAction,
  getDadosPainelSaudeAction,
  CustoDiarioServico,
} from '@/actions/saude';
import { TipoRotina, SeveridadeAlerta } from '@/types/database';

interface SaudeClientProps {
  initialDados: DadosPainelSaude;
}

const NOMES_ROTINAS: Record<TipoRotina, { titulo: string; desc: string }> = {
  agente_diario: {
    titulo: 'Agente SDR Diário',
    desc: 'Funil autônomo de busca, enriquecimento, qualificação e lote',
  },
  cron_sequencias: {
    titulo: 'Motor de Sequências',
    desc: 'Disparo de toques de e-mail programados da cadência',
  },
  leitor_respostas: {
    titulo: 'Leitor de Respostas',
    desc: 'Varredura de caixas IMAP/Gmail para respostas e bounces',
  },
  agenda: {
    titulo: 'Agenda & Pós-Reunião',
    desc: 'Sincronização de calendários e registro de conclusões',
  },
  verificacao_email: {
    titulo: 'Verificação de E-mails',
    desc: 'Limpeza e validação de entregabilidade em segundo plano',
  },
};

function formatarDataSP(isoString?: string | null): string {
  if (!isoString) return 'Nunca executado';
  try {
    const data = new Date(isoString);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(data);
  } catch {
    return isoString;
  }
}

function calcularDuracao(inicio?: string | null, fim?: string | null): string {
  if (!inicio || !fim) return '—';
  try {
    const ms = new Date(fim).getTime() - new Date(inicio).getTime();
    if (ms < 1000) return `${ms}ms`;
    const seg = Math.round(ms / 1000);
    if (seg < 60) return `${seg}s`;
    const min = Math.floor(seg / 60);
    const segRest = seg % 60;
    return `${min}m ${segRest}s`;
  } catch {
    return '—';
  }
}

export default function SaudeClient({ initialDados }: SaudeClientProps) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosPainelSaude>(initialDados);
  const [isPending, startTransition] = useTransition();
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<CustoDiarioServico | null>(null);

  const recarregarDados = () => {
    startTransition(async () => {
      try {
        const novosDados = await getDadosPainelSaudeAction();
        setDados(novosDados);
        router.refresh();
      } catch (err) {
        console.error('Erro ao atualizar dados de saúde:', err);
      }
    });
  };

  const handleResolverAlerta = async (id: string) => {
    setResolvendoId(id);
    try {
      const ok = await resolverAlertaAction(id);
      if (ok) {
        setDados((prev) => ({
          ...prev,
          alertasAtivos: prev.alertasAtivos.filter((a) => a.id !== id),
        }));
      }
    } catch (err) {
      console.error('Erro ao resolver alerta:', err);
    } finally {
      setResolvendoId(null);
    }
  };

  // Cores por severidade
  const badgeSeveridade = (sev: SeveridadeAlerta) => {
    switch (sev) {
      case 'critico':
        return 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border-red-300 dark:border-red-800';
      case 'erro':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      case 'aviso':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800';
    }
  };

  // Cálculos para o gráfico de custos (últimos 30 dias)
  const maxCustoDia = Math.max(...dados.custos30Dias.map((c) => c.total), 0.5);
  const chartHeight = 160;
  const chartWidth = 720;
  const barWidth = 16;
  const spacing = (chartWidth - barWidth) / Math.max(dados.custos30Dias.length - 1, 1);

  return (
    <div className="space-y-8 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-neutral-100">
              Painel de Saúde & Monitoramento
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ao Vivo
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">
            Status das rotinas automatizadas, integridade de entregabilidade de caixas e funil semanal.
          </p>
        </div>

        <button
          onClick={recarregarDados}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-800 transition shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Atualizar Métricas
        </button>
      </div>

      {/* 4 Cards de Destaque Superior */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Dias Restantes de Base */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
              Dias de Base Restantes
            </span>
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
              {dados.diasRestantesBase} dias
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                dados.diasRestantesBase >= 5
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800 animate-pulse'
              }`}
            >
              {dados.diasRestantesBase >= 5 ? 'Estoque Seguro' : 'Abaixo de 5 dias'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">
            {dados.leadsDisponiveis} leads qualificados disponíveis para meta de {dados.metaDiaria}/dia
          </p>
        </div>

        {/* Card 2: Entregabilidade Global */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
              Caixas de Envio Ativas
            </span>
            <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
              {dados.entregabilidadeCaixas.filter((c) => c.ativo).length} / {dados.entregabilidadeCaixas.length}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-900 text-slate-600 dark:text-neutral-400">
              7 dias
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">
            {dados.entregabilidadeCaixas.some((c) => !c.ativo)
              ? 'Atenção: existem caixas pausadas por reputação'
              : 'Todas as caixas com reputação saudável (< 3% bounce)'}
          </p>
        </div>

        {/* Card 3: Custo 30 Dias */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
              Custo Agente (30 dias)
            </span>
            <DollarSign className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
              ${dados.totalCusto30Dias.toFixed(2)} USD
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              ~${(dados.totalCusto30Dias / 30).toFixed(2)}/dia
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">
            Places, Claude Anthropic, Verificador e Apify
          </p>
        </div>

        {/* Card 4: Alertas Ativos */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
              Alertas Ativos
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
              {dados.alertasAtivos.length}
            </span>
            {dados.alertasAtivos.length > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
                Ação requerida
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                Tudo limpo
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">
            Disparos automáticos por e-mail com limite de 1/dia por regra
          </p>
        </div>
      </div>

      {/* Alertas Ativos do Sistema */}
      {dados.alertasAtivos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              Alertas Ativos do Sistema ({dados.alertasAtivos.length})
            </h2>
          </div>

          <div className="space-y-3">
            {dados.alertasAtivos.map((alerta) => (
              <div
                key={alerta.id}
                className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeSeveridade(
                        alerta.severidade
                      )}`}
                    >
                      {alerta.severidade}
                    </span>
                    <span className="text-xs font-mono text-slate-500 dark:text-neutral-400">
                      tipo: {alerta.tipo}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-neutral-500">
                      • {formatarDataSP(alerta.criado_em)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-neutral-100">
                    {alerta.titulo}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-neutral-300">
                    {alerta.mensagem}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleResolverAlerta(alerta.id)}
                    disabled={resolvendoId === alerta.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {resolvendoId === alerta.id ? 'Resolvendo...' : 'Marcar como Resolvido'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status e Última Execução das 5 Rotinas */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
            Status das Rotinas Automatizadas (rotinas_execucoes)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(NOMES_ROTINAS) as TipoRotina[]).map((chave) => {
            const rotinaInfo = NOMES_ROTINAS[chave];
            const exec = dados.rotinas[chave];
            const isRodando = exec?.status === 'rodando';
            const isSucesso = exec?.status === 'sucesso';
            const isErro = exec?.status === 'erro';

            return (
              <div
                key={chave}
                className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-neutral-100">
                        {rotinaInfo.titulo}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
                        {rotinaInfo.desc}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isSucesso
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : isRodando
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 animate-pulse'
                          : isErro
                          ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-800'
                          : 'bg-slate-100 text-slate-600 dark:bg-neutral-900 dark:text-neutral-400 border-slate-200 dark:border-neutral-800'
                      }`}
                    >
                      {isSucesso && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                      {isRodando && <Activity className="w-3 h-3 text-blue-600 animate-spin" />}
                      {isErro && <XCircle className="w-3 h-3 text-red-600" />}
                      {exec ? exec.status.toUpperCase() : 'SEM HISTÓRICO'}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-900 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Último início:
                      </span>
                      <span className="font-mono text-slate-800 dark:text-neutral-200">
                        {formatarDataSP(exec?.iniciado_em)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-500 dark:text-neutral-400">
                      <span>Duração:</span>
                      <span className="font-mono text-slate-800 dark:text-neutral-200">
                        {calcularDuracao(exec?.iniciado_em, exec?.finalizado_em)}
                      </span>
                    </div>

                    {exec?.erro && (
                      <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-[11px] font-mono break-words">
                        {exec.erro}
                      </div>
                    )}

                    {exec?.resumo && Object.keys(exec.resumo).length > 0 && !exec.erro && (
                      <div className="mt-2 p-2 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-[11px] font-mono text-slate-600 dark:text-neutral-400">
                        {Object.entries(exec.resumo)
                          .slice(0, 3)
                          .map(([k, v]) => (
                            <div key={k} className="truncate">
                              <span className="font-semibold">{k}:</span> {String(v)}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funil da Semana (7 dias) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              Funil de Conversão da Semana (Últimos 7 dias)
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-neutral-400">
            Atualizado a partir dos lotes e interações reais
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Etapa 1: Leads Entregues */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs relative">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-blue-500" /> 1. Entregues no Lote
            </span>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-neutral-100">
              {dados.funilSemanal.entregues}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Total de leads qualificados</p>
          </div>

          {/* Etapa 2: Inscritos */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs relative">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-indigo-500" /> 2. Inscritos
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
                {dados.funilSemanal.inscritos}
              </span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {dados.funilSemanal.taxaInscricao}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Taxa sobre entregues</p>
          </div>

          {/* Etapa 3: Enviados */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs relative">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 flex items-center gap-1">
              <Send className="w-3.5 h-3.5 text-cyan-500" /> 3. E-mails Enviados
            </span>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-neutral-100">
              {dados.funilSemanal.enviados}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Toques disparados via Brevo</p>
          </div>

          {/* Etapa 4: Respostas */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs relative">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> 4. Respostas
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
                {dados.funilSemanal.respostas}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {dados.funilSemanal.taxaResposta}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Taxa sobre enviados</p>
          </div>

          {/* Etapa 5: Reuniões */}
          <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 shadow-xs relative">
            <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> 5. Reuniões
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {dados.funilSemanal.reunioes}
              </span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                {dados.funilSemanal.taxaReuniao}%
              </span>
            </div>
            <p className="text-[11px] text-purple-600/70 dark:text-purple-400/70 mt-1">
              Taxa sobre respostas
            </p>
          </div>
        </div>
      </div>

      {/* Entregabilidade por Caixa de Envio */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              Entregabilidade por Caixa de Envio (Últimos 7 dias)
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-neutral-400">
            Pausa automática se Bounce &gt; 3.0% (mín. 30 envios)
          </span>
        </div>

        <div className="border border-slate-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-950 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-900/80 border-b border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Caixa de Envio</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Enviados (7d)</th>
                  <th className="py-3 px-4 text-right">Bounces</th>
                  <th className="py-3 px-4 text-right">Taxa Bounce</th>
                  <th className="py-3 px-4 text-right">Descadastros</th>
                  <th className="py-3 px-4 text-right">Respostas</th>
                  <th className="py-3 px-4">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-900 text-slate-700 dark:text-neutral-300">
                {dados.entregabilidadeCaixas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-neutral-500">
                      Nenhuma caixa de envio cadastrada.
                    </td>
                  </tr>
                ) : (
                  dados.entregabilidadeCaixas.map((cx) => {
                    const bounceCritico = cx.taxaBounce > 3.0;
                    const bounceAlerta = cx.taxaBounce > 2.0 && !bounceCritico;

                    return (
                      <tr key={cx.caixaId} className="hover:bg-slate-50/50 dark:hover:bg-neutral-900/40">
                        <td className="py-3.5 px-4 font-medium">
                          <div className="font-semibold text-slate-900 dark:text-neutral-100">
                            {cx.nome}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{cx.email}</div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              cx.ativo
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-800'
                            }`}
                          >
                            {cx.ativo ? 'ATIVA' : 'PAUSADA'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-semibold">
                          {cx.enviados}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-neutral-400">
                          {cx.bounces}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              bounceCritico
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : bounceAlerta
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {cx.taxaBounce.toFixed(1)}%
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-neutral-400">
                          {cx.descadastros} ({cx.taxaDescadastro.toFixed(1)}%)
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {cx.respostas} ({cx.taxaResposta.toFixed(1)}%)
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 dark:text-neutral-400 text-[11px]">
                          {cx.motivoDesativacao || 'Reputação normal'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Gráfico de Custos do Agente nos Últimos 30 Dias */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              Custo Diário do Agente nos Últimos 30 Dias (USD)
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" /> Google Places
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-purple-500" /> Claude Anthropic
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Verificador
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> Hunter.io
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> Apify
            </span>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xs">
          {/* SVG Bar Chart */}
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`}
              className="w-full h-48 select-none"
            >
              {/* Linhas de grade horizontais */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                const y = chartHeight - p * chartHeight;
                const valor = (p * maxCustoDia).toFixed(2);
                return (
                  <g key={i}>
                    <line
                      x1={0}
                      y1={y}
                      x2={chartWidth}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-neutral-800"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={chartWidth - 5}
                      y={y - 4}
                      textAnchor="end"
                      className="text-[9px] fill-slate-400 dark:fill-neutral-500 font-mono"
                    >
                      ${valor}
                    </text>
                  </g>
                );
              })}

              {/* Barras por dia */}
              {dados.custos30Dias.map((c, idx) => {
                const x = idx * spacing;

                // Segmentos empilhados
                const hPlaces = (c.places / maxCustoDia) * chartHeight;
                const hClaude = (c.claude / maxCustoDia) * chartHeight;
                const hVerif = (c.verificador / maxCustoDia) * chartHeight;
                const hHunter = (c.hunter / maxCustoDia) * chartHeight;
                const hApify = (c.apify / maxCustoDia) * chartHeight;

                let currY = chartHeight;

                return (
                  <g
                    key={c.data}
                    className="cursor-pointer group"
                    onClick={() => setDiaSelecionado(c)}
                  >
                    {/* Fundo de hover */}
                    <rect
                      x={x - 2}
                      y={0}
                      width={barWidth + 4}
                      height={chartHeight}
                      className="fill-transparent group-hover:fill-slate-100 dark:group-hover:fill-neutral-900 transition-colors"
                      rx={4}
                    />

                    {/* Places */}
                    {hPlaces > 0 && (
                      <rect
                        x={x}
                        y={(currY -= hPlaces)}
                        width={barWidth}
                        height={hPlaces}
                        className="fill-blue-500"
                      />
                    )}
                    {/* Claude */}
                    {hClaude > 0 && (
                      <rect
                        x={x}
                        y={(currY -= hClaude)}
                        width={barWidth}
                        height={hClaude}
                        className="fill-purple-500"
                      />
                    )}
                    {/* Verificador */}
                    {hVerif > 0 && (
                      <rect
                        x={x}
                        y={(currY -= hVerif)}
                        width={barWidth}
                        height={hVerif}
                        className="fill-emerald-500"
                      />
                    )}
                    {/* Hunter */}
                    {hHunter > 0 && (
                      <rect
                        x={x}
                        y={(currY -= hHunter)}
                        width={barWidth}
                        height={hHunter}
                        className="fill-amber-500"
                      />
                    )}
                    {/* Apify */}
                    {hApify > 0 && (
                      <rect
                        x={x}
                        y={(currY -= hApify)}
                        width={barWidth}
                        height={hApify}
                        className="fill-rose-500"
                        rx={c.total > 0 ? 2 : 0}
                      />
                    )}

                    {/* Barra vazia se custo for 0 para visualização */}
                    {c.total === 0 && (
                      <rect
                        x={x}
                        y={chartHeight - 2}
                        width={barWidth}
                        height={2}
                        className="fill-slate-300 dark:fill-neutral-700"
                      />
                    )}

                    {/* Label a cada 5 dias */}
                    {idx % 5 === 0 && (
                      <text
                        x={x + barWidth / 2}
                        y={chartHeight + 16}
                        textAnchor="middle"
                        className="text-[9px] fill-slate-400 dark:fill-neutral-500 font-mono"
                      >
                        {c.data.slice(5)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Detalhes do dia selecionado */}
          {diaSelecionado && (
            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-neutral-200">
                Data: {diaSelecionado.data} • Total: ${diaSelecionado.total.toFixed(4)} USD
              </span>
              <div className="flex items-center gap-3 font-mono text-slate-600 dark:text-neutral-400">
                <span>Places: ${diaSelecionado.places.toFixed(4)}</span>
                <span>Claude: ${diaSelecionado.claude.toFixed(4)}</span>
                <span>Verif: ${diaSelecionado.verificador.toFixed(4)}</span>
                <span>Hunter: ${diaSelecionado.hunter.toFixed(4)}</span>
                <span>Apify: ${diaSelecionado.apify.toFixed(4)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
