'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Video,
  ExternalLink,
  CheckCircle2,
  Building2,
  User,
  Mail,
  Phone,
  FileCheck,
  RotateCcw,
} from 'lucide-react';
import { Reuniao, EscolaComContatos, StatusReuniao, ResultadoReuniao } from '@/types/database';
import { getReunioesAction, vincularReuniaoEscolaAction } from '@/actions/reunioes';
import ModalPosReuniao from '@/components/ModalPosReuniao';

interface ReunioesClientProps {
  initialReunioes: Reuniao[];
  escolas: EscolaComContatos[];
}

function formatarDataHoraSP(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export default function ReunioesClient({
  initialReunioes,
  escolas,
}: ReunioesClientProps) {
  const [reunioes, setReunioes] = useState<Reuniao[]>(initialReunioes);
  const [periodoAba, setPeriodoAba] = useState<'proximas' | 'passadas' | 'todas'>('proximas');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroResultado, setFiltroResultado] = useState<string>('todos');
  const [apenasPendentes, setApenasPendentes] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  // Estados para Modal de Pós-Reunião
  const [selectedReuniaoPos, setSelectedReuniaoPos] = useState<Reuniao | null>(null);
  const [isPosModalOpen, setIsPosModalOpen] = useState(false);

  // Estados para Vincular Reunião Desconhecida
  const [reuniaoParaVincular, setReuniaoParaVincular] = useState<Reuniao | null>(null);
  const [escolaVinculoId, setEscolaVinculoId] = useState<string>('');
  const [isVinculando, setIsVinculando] = useState(false);

  const agoraTime = new Date().getTime();

  const carregarReunioes = async () => {
    setLoading(true);
    try {
      const data = await getReunioesAction();
      setReunioes(data);
    } catch (err) {
      console.error('Erro ao atualizar reuniões:', err);
    } finally {
      setLoading(false);
    }
  };

  // Estatísticas do Topo
  const stats = useMemo(() => {
    const total = reunioes.length;
    const agendadas = reunioes.filter(
      (r) => r.status === 'agendada' || r.status === 'remarcada'
    ).length;
    const pendentes = reunioes.filter((r) => r.pendente_registro).length;
    const realizadas = reunioes.filter((r) => r.status === 'realizada').length;
    return { total, agendadas, pendentes, realizadas };
  }, [reunioes]);

  // Lista Filtrada
  const reunioesFiltradas = useMemo(() => {
    return reunioes.filter((r) => {
      const fimTime = new Date(r.fim).getTime();

      // Filtro de aba temporal
      if (periodoAba === 'proximas' && fimTime < agoraTime) {
        return false;
      }
      if (periodoAba === 'passadas' && fimTime >= agoraTime) {
        return false;
      }

      // Filtro apenas pendentes
      if (apenasPendentes && !r.pendente_registro) {
        return false;
      }

      // Filtro por status
      if (filtroStatus !== 'todos' && r.status !== filtroStatus) {
        return false;
      }

      // Filtro por resultado
      if (filtroResultado !== 'todos' && r.resultado !== filtroResultado) {
        return false;
      }

      return true;
    });
  }, [reunioes, periodoAba, apenasPendentes, filtroStatus, filtroResultado, agoraTime]);

  // Ação de vincular reunião a uma escola
  const handleVincularEscola = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reuniaoParaVincular || !escolaVinculoId) return;

    setIsVinculando(true);
    try {
      const res = await vincularReuniaoEscolaAction({
        reuniaoId: reuniaoParaVincular.id,
        escolaId: escolaVinculoId,
      });

      if (res.sucesso) {
        alert('Reunião vinculada com sucesso à escola selecionada!');
        setReuniaoParaVincular(null);
        setEscolaVinculoId('');
        await carregarReunioes();
      } else {
        alert(`Erro ao vincular: ${res.erro}`);
      }
    } finally {
      setIsVinculando(false);
    }
  };

  const getStatusBadge = (status: StatusReuniao) => {
    switch (status) {
      case 'agendada':
        return {
          label: 'Agendada',
          bg: 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800',
        };
      case 'remarcada':
        return {
          label: 'Remarcada',
          bg: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        };
      case 'realizada':
        return {
          label: 'Realizada',
          bg: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        };
      case 'nao_compareceu':
        return {
          label: 'Não Compareceu',
          bg: 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
        };
      case 'cancelada':
      default:
        return {
          label: 'Cancelada',
          bg: 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 border-slate-300 dark:border-neutral-700',
        };
    }
  };

  const getResultadoBadge = (resultado: ResultadoReuniao | null) => {
    switch (resultado) {
      case 'proposta_enviada':
        return 'Proposta Enviada';
      case 'teste_gratuito':
        return 'Teste Gratuito';
      case 'fechado':
        return 'Fechado (Ganho)';
      case 'sem_fit':
        return 'Sem Fit';
      case 'followup':
        return 'Follow-up';
      default:
        return null;
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition shadow-2xs"
              title="Voltar ao CRM"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-100">
                  Reuniões e Agendamentos
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Cal.com / Google Agenda
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Reuniões agendadas automaticamente pelos leads através dos links dos e-mails ou combinadas manualmente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={carregarReunioes}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-neutral-800/80 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Cards de Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">Total de Reuniões</span>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-2xl font-bold text-slate-900 dark:text-neutral-100">{stats.total}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">Agendadas / Ativas</span>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.agendadas}</span>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border shadow-2xs ${
            stats.pendentes > 0
              ? 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 ring-2 ring-purple-500/10'
              : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800'
          }`}>
            <span className="text-xs font-bold text-purple-700 dark:text-purple-300">Pós-Reunião Pendente</span>
            <div className="flex items-center gap-2 mt-1">
              <FileCheck className="w-4 h-4 text-purple-600" />
              <span className="text-2xl font-extrabold text-purple-700 dark:text-purple-300">{stats.pendentes}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs">
            <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">Realizadas</span>
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.realizadas}</span>
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Abas */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xs">
          {/* Abas Temporais */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-neutral-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setPeriodoAba('proximas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                periodoAba === 'proximas'
                  ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-neutral-200'
              }`}
            >
              Próximas
            </button>
            <button
              type="button"
              onClick={() => setPeriodoAba('passadas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                periodoAba === 'passadas'
                  ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-neutral-200'
              }`}
            >
              Passadas
            </button>
            <button
              type="button"
              onClick={() => setPeriodoAba('todas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                periodoAba === 'todas'
                  ? 'bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-neutral-200'
              }`}
            >
              Todas
            </button>
          </div>

          {/* Filtros Dropdown */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setApenasPendentes(!apenasPendentes)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                apenasPendentes
                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                  : 'bg-slate-50 dark:bg-neutral-900 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-800'
              }`}
            >
              ⚠️ Apenas Pendentes
            </button>

            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-700 dark:text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="todos">Status: Todos</option>
              <option value="agendada">Agendada</option>
              <option value="remarcada">Remarcada</option>
              <option value="realizada">Realizada</option>
              <option value="nao_compareceu">Não Compareceu</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-700 dark:text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="todos">Resultado: Todos</option>
              <option value="proposta_enviada">Proposta Enviada</option>
              <option value="teste_gratuito">Teste Gratuito</option>
              <option value="fechado">Negócio Fechado</option>
              <option value="followup">Follow-up</option>
              <option value="sem_fit">Sem Fit</option>
            </select>
          </div>
        </div>

        {/* Lista de Reuniões */}
        <div className="space-y-3.5">
          {reunioesFiltradas.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl">
              <Calendar className="w-8 h-8 text-slate-300 dark:text-neutral-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-neutral-300">Nenhuma reunião encontrada</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
                Tente ajustar os filtros ou aguarde os agendamentos automáticos dos leads.
              </p>
            </div>
          ) : (
            reunioesFiltradas.map((reuniao) => {
              const statusBadge = getStatusBadge(reuniao.status);
              const resultadoBadge = getResultadoBadge(reuniao.resultado);
              const escola = reuniao.escolas;
              const contato = reuniao.contatos;

              return (
                <div
                  key={reuniao.id}
                  className={`p-5 rounded-2xl border bg-white dark:bg-[#121215] transition shadow-2xs space-y-3 ${
                    reuniao.pendente_registro
                      ? 'border-purple-300 dark:border-purple-900/80 ring-2 ring-purple-500/10'
                      : 'border-slate-200 dark:border-neutral-800'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Informações da Escola e Participante */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {escola ? (
                          <Link
                            href={`/?escola=${escola.id}`}
                            className="font-bold text-sm text-slate-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 transition"
                          >
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span>{escola.nome}</span>
                            <span className="text-xs text-slate-400 font-normal">({escola.cidade}/{escola.uf})</span>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              ⚠️ Origem Desconhecida
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setReuniaoParaVincular(reuniao);
                                setEscolaVinculoId('');
                              }}
                              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              Vincular a uma Escola →
                            </button>
                          </div>
                        )}

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadge.bg}`}>
                          {statusBadge.label}
                        </span>

                        {resultadoBadge && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            {resultadoBadge}
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 uppercase">
                          via {reuniao.provedor}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-neutral-400 flex-wrap">
                        {contato ? (
                          <>
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <strong className="text-slate-700 dark:text-neutral-300">{contato.nome || 'Decisor'}</strong>
                              {contato.cargo && <span>({contato.cargo})</span>}
                            </span>
                            {contato.email && (
                              <span className="flex items-center gap-1 font-mono text-[11px]">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <span>{contato.email}</span>
                              </span>
                            )}
                            {contato.telefone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                <span>{contato.telefone}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="italic text-slate-400">Participante cadastrado no evento da agenda</span>
                        )}
                      </div>
                    </div>

                    {/* Data/Hora e Ações de Entrada / Registro */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-right">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-neutral-200">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          <span>{formatarDataHoraSP(reuniao.inicio)}</span>
                        </div>
                      </div>

                      {reuniao.link_reuniao && (
                        <a
                          href={reuniao.link_reuniao}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-2xs cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Entrar</span>
                          <ExternalLink className="w-3 h-3 opacity-80" />
                        </a>
                      )}

                      {/* Botão para registrar pós-reunião se pendente */}
                      {reuniao.pendente_registro && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReuniaoPos(reuniao);
                            setIsPosModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition shadow-2xs cursor-pointer animate-pulse"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>Registrar Pós-Reunião</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notas ou Resumo do Dossiê */}
                  {reuniao.notas && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-900/50 border border-slate-100 dark:border-neutral-800 text-xs text-slate-600 dark:text-neutral-400">
                      <strong>Notas:</strong> {reuniao.notas}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal de Registro Pós-Reunião */}
      <ModalPosReuniao
        isOpen={isPosModalOpen}
        onClose={() => setIsPosModalOpen(false)}
        reuniao={selectedReuniaoPos}
        onSuccess={carregarReunioes}
      />

      {/* Modal de Vinculação de Reunião Desconhecida */}
      {reuniaoParaVincular && (
        <div
          onClick={() => setReuniaoParaVincular(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-neutral-100">
              Vincular Reunião a uma Escola
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Selecione qual escola cadastrada no CRM participou deste agendamento para avançar a etapa e registrar o histórico:
            </p>

            <form onSubmit={handleVincularEscola} className="space-y-4">
              <select
                value={escolaVinculoId}
                onChange={(e) => setEscolaVinculoId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none"
              >
                <option value="">Selecione uma escola...</option>
                {escolas.map((esc) => (
                  <option key={esc.id} value={esc.id}>
                    {esc.nome} ({esc.cidade}/{esc.uf})
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReuniaoParaVincular(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isVinculando || !escolaVinculoId}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 cursor-pointer"
                >
                  {isVinculando ? 'Vinculando...' : 'Confirmar Vínculo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
