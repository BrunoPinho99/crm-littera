'use client';

import React, { useState, useRef, useEffect } from 'react';
import { EscolaComContatos, StatusFunil, EmailStatus, ClassificacaoResposta, Reuniao } from '@/types/database';
import { 
  MapPin, 
  Mail, 
  Phone, 
  Send, 
  Calendar, 
  MessageSquareCheck, 
  Sparkles,
  Edit2,
  Trash2,
  UserCheck,
  MessageCircle,
  AlertTriangle,
  Users,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  ListOrdered,
  Award,
  ExternalLink,
  Video,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Ban,
  RotateCcw
} from 'lucide-react';
import { generateWhatsAppMessage, getWhatsAppUrl } from '@/lib/whatsapp';

function getScoreBadgeClass(score: number | null | undefined): string {
  const val = score ?? 0;
  if (val >= 60) {
    return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
  }
  if (val >= 30) {
    return 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
  }
  return 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-700';
}

function getScoreBarClass(score: number | null | undefined): string {
  const val = score ?? 0;
  if (val >= 60) return 'bg-emerald-500';
  if (val >= 30) return 'bg-amber-500';
  return 'bg-slate-400 dark:bg-neutral-600';
}

function getBadgeClassificacao(classificacao: ClassificacaoResposta) {
  switch (classificacao) {
    case 'interessado':
      return {
        label: 'Interessado',
        bg: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      };
    case 'mais_informacoes':
      return {
        label: 'Mais informações',
        bg: 'bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800',
      };
    case 'agora_nao':
      return {
        label: 'Agora não',
        bg: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      };
    case 'indicou_outra_pessoa':
      return {
        label: 'Indicou contato',
        bg: 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800',
      };
    case 'sem_interesse':
      return {
        label: 'Sem interesse',
        bg: 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 border-slate-300 dark:border-neutral-700',
      };
    case 'descadastro':
      return {
        label: 'Descadastro',
        bg: 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      };
    case 'resposta_automatica':
      return {
        label: 'Automática',
        bg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900',
      };
    case 'bounce':
      return {
        label: 'Bounce',
        bg: 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800',
      };
    case 'outro':
    default:
      return {
        label: 'Outro',
        bg: 'bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800',
      };
  }
}

interface KanbanBoardProps {
  leads: EscolaComContatos[];
  onStatusChange: (leadId: string, newStatus: StatusFunil, oldStatus?: StatusFunil, motivo?: string) => void;
  onSendEmail: (lead: EscolaComContatos) => void;
  onSendWhatsApp?: (lead: EscolaComContatos) => void;
  onEditLead: (lead: EscolaComContatos) => void;
  onDeleteLead: (leadId: string) => void;
  onScheduleMeeting?: (lead: EscolaComContatos) => void;
  onOpenPosReuniao?: (reuniao: Reuniao) => void;
  updatingId: string | null;
  sortMode?: 'score_desc' | 'criado_em_desc';
}

function formatarDataHoraSP(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

const COLUMNS: {
  id: StatusFunil;
  title: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  headerBg: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'novo',
    title: 'Novo',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800/60',
    headerBg: 'bg-emerald-50/50 dark:bg-emerald-950/30',
    icon: <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
  },
  {
    id: 'em_sequencia',
    title: 'Em sequência',
    badgeBg: 'bg-sky-100 dark:bg-sky-950/80',
    badgeText: 'text-sky-800 dark:text-sky-300',
    borderClass: 'border-sky-200 dark:border-sky-800/60',
    headerBg: 'bg-sky-50/50 dark:bg-sky-950/30',
    icon: <ListOrdered className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />,
  },
  {
    id: 'contato_enviado',
    title: 'Contato Enviado',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/80',
    badgeText: 'text-blue-800 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800/60',
    headerBg: 'bg-blue-50/50 dark:bg-blue-950/30',
    icon: <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
  },
  {
    id: 'respondido',
    title: 'Respondido',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/80',
    badgeText: 'text-purple-800 dark:text-purple-300',
    borderClass: 'border-purple-200 dark:border-purple-800/60',
    headerBg: 'bg-purple-50/50 dark:bg-purple-950/30',
    icon: <MessageSquareCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />,
  },
  {
    id: 'reuniao_agendada',
    title: 'Reunião Agendada',
    badgeBg: 'bg-amber-100 dark:bg-amber-950/80',
    badgeText: 'text-amber-800 dark:text-amber-300',
    borderClass: 'border-amber-200 dark:border-amber-800/60',
    headerBg: 'bg-amber-50/50 dark:bg-amber-950/30',
    icon: <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
  },
  {
    id: 'sem_interesse',
    title: 'Disseram Não / Recusado',
    badgeBg: 'bg-rose-100 dark:bg-rose-950/80',
    badgeText: 'text-rose-800 dark:text-rose-300',
    borderClass: 'border-rose-200 dark:border-rose-900/60',
    headerBg: 'bg-rose-50/50 dark:bg-rose-950/30',
    icon: <Ban className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
  },
];

function EmailStatusBadge({ status }: { status: EmailStatus }) {
  switch (status) {
    case 'valido':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" title="E-mail verificado e válido">
          <ShieldCheck className="w-2.5 h-2.5" />
          Válido
        </span>
      );
    case 'arriscado':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="E-mail arriscado">
          <ShieldAlert className="w-2.5 h-2.5" />
          Arriscado
        </span>
      );
    case 'invalido':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="E-mail inválido / bounce">
          <AlertTriangle className="w-2.5 h-2.5" />
          Inválido
        </span>
      );
    case 'catch_all':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800" title="Domínio aceita catch-all">
          Catch-all
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700" title="E-mail não verificado">
          <HelpCircle className="w-2.5 h-2.5" />
          Não verificado
        </span>
      );
  }
}

export default function KanbanBoard({
  leads,
  onStatusChange,
  onSendEmail,
  onSendWhatsApp,
  onEditLead,
  onDeleteLead,
  onScheduleMeeting,
  onOpenPosReuniao,
  updatingId,
  sortMode = 'score_desc',
}: KanbanBoardProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<StatusFunil | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = scrollContainerRef.current.clientWidth * 0.75;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: StatusFunil) => {
    e.preventDefault();
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: StatusFunil) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    setDragOverColumn(null);
    setDraggedLeadId(null);

    if (leadId) {
      const currentLead = leads.find((l) => l.id === leadId);
      if (currentLead && currentLead.status_funil !== targetStatus) {
        // Se estiver movendo à mão para "Reunião Agendada", exige agendamento com data
        if (targetStatus === 'reuniao_agendada') {
          const temReuniaoAgendada = (currentLead.reunioes || []).some(
            (r) => r.status === 'agendada' || r.status === 'remarcada'
          );
          if (!temReuniaoAgendada) {
            if (onScheduleMeeting) {
              onScheduleMeeting(currentLead);
            }
            return;
          }
        }
        if (targetStatus === 'sem_interesse') {
          const motivo = prompt(
            `Mover "${currentLead.nome}" para "Disseram Não / Sem Interesse"?\n\nIsso cancelará campanhas ativas e removerá da lista principal.\n\nMotivo da recusa (opcional):`,
            'Sem interesse no momento'
          );
          if (motivo === null) return;
          onStatusChange(leadId, targetStatus, currentLead.status_funil, motivo);
          return;
        }
        onStatusChange(leadId, targetStatus, currentLead.status_funil);
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Barra de Navegação Horizontal do Kanban */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700 dark:text-neutral-300 text-xs">
            Etapas do Funil
          </span>
          <span className="text-[11px] bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 px-2.5 py-0.5 rounded-full border border-slate-200/80 dark:border-neutral-700 font-medium">
            3 colunas principais na tela • Arraste para o lado para ver o restante
          </span>
        </div>

        {/* Botões de avançar/voltar colunas */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
            title="Rolar etapas para a esquerda"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
            title="Rolar etapas para a direita"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Container com Scroll Horizontal */}
      <div 
        ref={scrollContainerRef}
        className="flex gap-5 overflow-x-auto pb-6 pt-1 items-start min-h-[680px] scroll-smooth scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-neutral-700 scrollbar-track-transparent"
      >
        {COLUMNS.map((column) => {
          const columnLeads = leads
            .filter((l) => l.status_funil === column.id)
            .sort((a, b) => {
              if (sortMode === 'criado_em_desc') {
                return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
              }
              const scoreA = a.score ?? -1;
              const scoreB = b.score ?? -1;
              if (scoreB !== scoreA) return scoreB - scoreA;
              return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
            });
          const isTarget = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
              className={`w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[calc((100%-2.5rem)/3)] lg:min-w-[360px] max-w-[460px] shrink-0 flex flex-col rounded-2xl bg-slate-50/70 dark:bg-neutral-900/40 border transition-all duration-200 overflow-hidden ${
                isTarget
                  ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
                  : 'border-slate-200/80 dark:border-neutral-800'
              }`}
            >
              {/* Header da Coluna */}
              <div className={`p-4 border-b border-slate-200/60 dark:border-neutral-800 flex items-center justify-between ${column.headerBg}`}>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-neutral-900 shadow-2xs">
                    {column.icon}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">
                    {column.title}
                  </h3>
                </div>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${column.badgeBg} ${column.badgeText}`}>
                  {columnLeads.length}
                </span>
              </div>

              {/* Lista de Cards com Scroll Interno */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 min-h-[160px] max-h-[calc(100vh-270px)]">
                {columnLeads.length === 0 ? (
                  <div className="h-36 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-neutral-800/80 rounded-xl text-center p-4 text-slate-400 dark:text-neutral-500">
                    <p className="text-sm font-medium">Nenhuma empresa</p>
                    <p className="text-xs mt-1">Arraste para cá</p>
                  </div>
                ) : (
                  columnLeads.map((lead) => {
                    const isUpdating = updatingId === lead.id;
                    const isBeingDragged = draggedLeadId === lead.id;
                    const contatos = lead.contatos || [];
                    const contatoPrincipal = contatos.find((c) => c.principal) || contatos[0];
                    const outrosContatosCount = contatos.length > 1 ? contatos.length - 1 : 0;
                    const emailDisponivel = contatoPrincipal?.email || lead.email_geral || contatos.find((c) => Boolean(c.email))?.email;
                    const hasEmail = Boolean(emailDisponivel);
                    const telefoneDisponivel = lead.telefone || contatoPrincipal?.telefone || contatos.find((c) => Boolean(c.telefone))?.telefone;
                    const hasPhone = Boolean(telefoneDisponivel);

                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        className={`group relative bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 p-4 rounded-xl shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
                          isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100'
                        } ${isUpdating ? 'animate-pulse pointer-events-none' : ''}`}
                      >
                        {/* Topo do Card: Nome e Selos */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 
                                onClick={() => onEditLead(lead)}
                                className="text-sm font-bold text-slate-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors leading-snug line-clamp-2"
                                title={lead.nome}
                              >
                                {lead.nome}
                              </h4>
                              {lead.precisa_revisao && (
                                <span 
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0"
                                  title={lead.observacao_revisao || 'Lead precisa de revisão nos dados'}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Revisar
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-neutral-400 mt-1.5 truncate" title={`${lead.cidade}/${lead.uf}${lead.bairro ? ` • ${lead.bairro}` : ''}`}>
                              <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500 shrink-0" />
                              <span className="font-medium shrink-0">{lead.cidade}/{lead.uf}</span>
                              {lead.bairro && <span className="font-normal text-slate-400 dark:text-neutral-500 truncate">• {lead.bairro}</span>}
                            </div>

                            {/* Badge de Score e Barra de Progresso */}
                            <div className="mt-2.5 space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold border ${getScoreBadgeClass(lead.score)}`}>
                                  <Award className="w-3 h-3" />
                                  {lead.score ?? 0} pts
                                </span>
                                {lead.status_qualificacao === 'qualificado' ? (
                                  <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                                    Qualificado
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-neutral-500 text-[11px] capitalize font-medium">
                                    {lead.status_qualificacao || 'bruto'}
                                  </span>
                                )}
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${getScoreBarClass(lead.score)}`}
                                  style={{ width: `${Math.min(100, Math.max(0, lead.score ?? 0))}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Ações Rápidas no Hover */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => onEditLead(lead)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                              title="Editar empresa e contatos"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Tem certeza que deseja excluir "${lead.nome}"?`)) {
                                  onDeleteLead(lead.id);
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Bloco de Decisor / Contato Principal */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-neutral-800/60 space-y-2 text-xs">
                          {contatoPrincipal ? (
                            <div>
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="font-semibold text-slate-800 dark:text-neutral-200 truncate flex items-center gap-1.5 text-xs">
                                  <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  {contatoPrincipal.nome || 'Decisor sem nome'}
                                </span>
                                {contatoPrincipal.cargo && (
                                  <span className="text-[11px] text-slate-400 dark:text-neutral-500 truncate max-w-[150px]">
                                    {contatoPrincipal.cargo}
                                  </span>
                                )}
                              </div>
                              {contatoPrincipal.email && (
                                <div className="flex items-center justify-between gap-1.5 mt-1 text-xs">
                                  <span className="text-slate-500 dark:text-neutral-400 truncate font-mono text-[11px]">
                                    {contatoPrincipal.email}
                                  </span>
                                  <EmailStatusBadge status={contatoPrincipal.email_status} />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 dark:text-neutral-500 italic flex items-center gap-1.5">
                              <span>Nenhum decisor cadastrado</span>
                            </div>
                          )}

                          {/* Contador de outros contatos */}
                          {outrosContatosCount > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 pt-0.5">
                              <Users className="w-3 h-3" />
                              <span>+{outrosContatosCount} outro{outrosContatosCount > 1 ? 's' : ''} contato{outrosContatosCount > 1 ? 's' : ''}</span>
                            </div>
                          )}

                          {/* Telefone */}
                          {lead.telefone && (
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-neutral-300 pt-0.5 text-xs font-medium">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{lead.telefone}</span>
                            </div>
                          )}

                          {/* Motivo de Recusa / Disse Não */}
                          {lead.status_funil === 'sem_interesse' && (
                            <div className="mt-2.5 p-2 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-300 space-y-1">
                              <div className="flex items-center gap-1.5 font-bold text-[11px] text-rose-700 dark:text-rose-300">
                                <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                <span>Disse Não / Sem Interesse</span>
                              </div>
                              {lead.motivo_descarte && (
                                <p className="italic text-[11px] text-rose-900 dark:text-rose-200 line-clamp-2">
                                  &ldquo;{lead.motivo_descarte}&rdquo;
                                </p>
                              )}
                            </div>
                          )}

                          {/* Gancho de Personalização SDR */}
                          {lead.gancho_personalizacao && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs text-indigo-900 dark:text-indigo-200">
                              <div className="flex items-center justify-between gap-1 mb-1 font-semibold text-[11px] text-indigo-700 dark:text-indigo-300">
                                <span className="flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                                  Gancho SDR
                                </span>
                                {lead.fontes_pesquisa && lead.fontes_pesquisa.length > 0 && lead.fontes_pesquisa[0] && (
                                  <a
                                    href={lead.fontes_pesquisa[0]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 text-[10px] font-medium"
                                    title={lead.fontes_pesquisa[0]}
                                  >
                                    Fonte
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                              <p className="line-clamp-2 italic leading-relaxed text-xs">
                                &ldquo;{lead.gancho_personalizacao}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* Bloco de Resposta Recebida / Classificação */}
                          {(() => {
                            const ultimaResposta = lead.respostas && lead.respostas.length > 0 ? lead.respostas[0] : null;
                            if (!ultimaResposta && lead.status_funil !== 'respondido') return null;

                            const badge = ultimaResposta
                              ? getBadgeClassificacao(ultimaResposta.classificacao)
                              : { label: 'Respondido', bg: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/80 dark:text-purple-300' };

                            return (
                              <div 
                                onClick={() => onEditLead(lead)}
                                className="mt-2.5 p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 text-xs cursor-pointer hover:bg-purple-100/70 dark:hover:bg-purple-900/40 transition"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold border text-[10px] ${badge.bg}`}>
                                      {badge.label}
                                    </span>
                                    {ultimaResposta && !ultimaResposta.tratada && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-rose-600 text-white animate-pulse">
                                        Nova
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                                    Ver resposta →
                                  </span>
                                </div>
                                {ultimaResposta?.corpo_texto && (
                                  <p className="line-clamp-2 text-slate-700 dark:text-neutral-300 italic text-xs">
                                    &ldquo;{ultimaResposta.corpo_texto}&rdquo;
                                  </p>
                                )}
                                {ultimaResposta?.justificativa && (
                                  <p className="text-[10px] text-purple-800 dark:text-purple-300 font-medium mt-1 line-clamp-1">
                                    IA: {ultimaResposta.justificativa}
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                          {/* Bloco de Reunião Agendada / Pós-Reunião */}
                          {(() => {
                            const reunioesList = lead.reunioes || [];
                            if (reunioesList.length === 0 && lead.status_funil !== 'reuniao_agendada') return null;

                            const reuniaoAtiva =
                              reunioesList
                                .filter((r) => r.status === 'agendada' || r.status === 'remarcada' || r.pendente_registro)
                                .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())[0] ||
                              reunioesList[0];

                            if (!reuniaoAtiva && lead.status_funil !== 'reuniao_agendada') return null;

                            return (
                              <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs">
                                    <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                    {reuniaoAtiva
                                      ? formatarDataHoraSP(reuniaoAtiva.inicio)
                                      : 'Aguardando data'}
                                  </span>
                                  {reuniaoAtiva?.status && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
                                      {reuniaoAtiva.status}
                                    </span>
                                  )}
                                </div>

                                {/* Botão Entrar com o Link da Reunião */}
                                {reuniaoAtiva?.link_reuniao && (
                                  <div className="pt-0.5">
                                    <a
                                      href={reuniaoAtiva.link_reuniao}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shadow-2xs"
                                      title={reuniaoAtiva.link_reuniao}
                                    >
                                      <Video className="w-3.5 h-3.5" />
                                      <span>Entrar na Reunião</span>
                                      <ExternalLink className="w-3 h-3 opacity-80" />
                                    </a>
                                  </div>
                                )}

                                {/* Aviso e Ação de Pós-Reunião Pendente */}
                                {reuniaoAtiva?.pendente_registro && (
                                  <div className="pt-1.5 border-t border-amber-200/60 dark:border-amber-800/60">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                       e.stopPropagation();
                                       onOpenPosReuniao?.(reuniaoAtiva);
                                      }}
                                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition cursor-pointer shadow-2xs"
                                    >
                                      <FileCheck className="w-3.5 h-3.5" />
                                      <span>Pós-Reunião Pendente • Registrar</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Rodapé do Card: Ações de Contato e Avanço de Status */}
                        <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-neutral-800/60 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {/* Botão de E-mail: Ativo se houver e-mail, cinza desabilitado se não houver */}
                            {hasEmail ? (
                              <button
                                type="button"
                                onClick={() => onSendEmail(lead)}
                                disabled={lead.status_funil === 'em_sequencia' || updatingId === lead.id}
                                className={`p-2 rounded-lg border transition ${
                                  lead.status_funil === 'em_sequencia'
                                    ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 opacity-80 cursor-default'
                                    : 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer shadow-2xs'
                                }`}
                                title={
                                  lead.status_funil === 'em_sequencia'
                                    ? 'Sequência já em andamento'
                                    : `Iniciar Sequência de E-mails (${emailDisponivel})`
                                }
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="p-2 rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-100/70 dark:bg-neutral-900/40 text-slate-300 dark:text-neutral-600 cursor-not-allowed opacity-60"
                                title="Nenhum e-mail cadastrado"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            )}

                            {/* Botão de WhatsApp: Ativo se houver telefone, cinza desabilitado se não houver */}
                            {hasPhone ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSendWhatsApp) {
                                    onSendWhatsApp(lead);
                                  } else {
                                    const message = generateWhatsAppMessage(lead);
                                    const url = getWhatsAppUrl(telefoneDisponivel!, message);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className="p-2 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer shadow-2xs"
                                title={`Abrir WhatsApp Web (${telefoneDisponivel})`}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="p-2 rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-100/70 dark:bg-neutral-900/40 text-slate-300 dark:text-neutral-600 cursor-not-allowed opacity-60"
                                title="Nenhum telefone ou WhatsApp cadastrado"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}
                            {/* Botão Disse Não: disponível para remover imediatamente da lista ativa */}
                            {column.id !== 'sem_interesse' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const motivo = prompt(
                                    `Marcar "${lead.nome}" como Sem Interesse / Disse Não?\n\nIsso cancelará sequências de e-mail e removerá o lead da lista ativa.\n\nInforme o motivo da recusa (opcional):`,
                                    'Sem interesse no momento'
                                  );
                                  if (motivo !== null) {
                                    onStatusChange(lead.id, 'sem_interesse', lead.status_funil, motivo);
                                  }
                                }}
                                className="p-2 rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer shadow-2xs"
                                title="Marcar que disse NÃO / Sem Interesse (remove do funil ativo)"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Botão Rápido de Avançar Etapa ou Reativar */}
                          {column.id === 'sem_interesse' && (
                            <button
                              type="button"
                              onClick={() => onStatusChange(lead.id, 'novo', 'sem_interesse')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                              title="Reativar lead e mover de volta para Novo no funil"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reativar</span>
                            </button>
                          )}
                          {column.id === 'novo' && (
                            <button
                              type="button"
                              onClick={() => onStatusChange(lead.id, 'em_sequencia', 'novo')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <span>Sequência</span>
                              <span>→</span>
                            </button>
                          )}
                          {column.id === 'em_sequencia' && (
                            <button
                              type="button"
                              onClick={() => onStatusChange(lead.id, 'contato_enviado', 'em_sequencia')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <span>Enviado</span>
                              <span>→</span>
                            </button>
                          )}
                          {column.id === 'contato_enviado' && (
                            <button
                              type="button"
                              onClick={() => onStatusChange(lead.id, 'respondido', 'contato_enviado')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <span>Respondeu</span>
                              <span>→</span>
                            </button>
                          )}
                          {column.id === 'respondido' && onScheduleMeeting && (
                            <button
                              type="button"
                              onClick={() => onScheduleMeeting(lead)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <span>Agendar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
