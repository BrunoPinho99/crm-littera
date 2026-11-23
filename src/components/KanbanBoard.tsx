'use client';

import React, { useState } from 'react';
import { EscolaComContatos, StatusFunil, EmailStatus, ClassificacaoResposta } from '@/types/database';
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
  ExternalLink
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
  onStatusChange: (leadId: string, newStatus: StatusFunil, oldStatus?: StatusFunil) => void;
  onSendEmail: (lead: EscolaComContatos) => void;
  onSendWhatsApp?: (lead: EscolaComContatos) => void;
  onEditLead: (lead: EscolaComContatos) => void;
  onDeleteLead: (leadId: string) => void;
  onScheduleMeeting?: (lead: EscolaComContatos) => void;
  updatingId: string | null;
  sortMode?: 'score_desc' | 'criado_em_desc';
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
  updatingId,
  sortMode = 'score_desc',
}: KanbanBoardProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<StatusFunil | null>(null);

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
        onStatusChange(leadId, targetStatus, currentLead.status_funil);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 h-full min-h-[650px] pb-6">
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
            className={`flex flex-col rounded-2xl bg-slate-50/70 dark:bg-neutral-900/40 border transition-all duration-200 overflow-hidden ${
              isTarget
                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
                : 'border-slate-200/80 dark:border-neutral-800'
            }`}
          >
            {/* Header da Coluna */}
            <div className={`p-3.5 border-b border-slate-200/60 dark:border-neutral-800 flex items-center justify-between ${column.headerBg}`}>
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-white dark:bg-neutral-900 shadow-2xs">
                  {column.icon}
                </div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-neutral-200">
                  {column.title}
                </h3>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${column.badgeBg} ${column.badgeText}`}>
                {columnLeads.length}
              </span>
            </div>

            {/* Lista de Cards com Scroll Interno */}
            <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 min-h-[150px]">
              {columnLeads.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-neutral-800/80 rounded-xl text-center p-3 text-slate-400 dark:text-neutral-500">
                  <p className="text-xs font-medium">Nenhuma empresa</p>
                  <p className="text-[10px] mt-0.5">Arraste para cá</p>
                </div>
              ) : (
                columnLeads.map((lead) => {
                  const isUpdating = updatingId === lead.id;
                  const isBeingDragged = draggedLeadId === lead.id;
                  const contatos = lead.contatos || [];
                  const contatoPrincipal = contatos.find((c) => c.principal) || contatos[0];
                  const outrosContatosCount = contatos.length > 1 ? contatos.length - 1 : 0;

                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      className={`group relative bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 p-3.5 rounded-xl shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
                        isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100'
                      } ${isUpdating ? 'animate-pulse pointer-events-none' : ''}`}
                    >
                      {/* Topo do Card: Nome e Selos */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 
                              onClick={() => onEditLead(lead)}
                              className="text-xs font-bold text-slate-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer truncate transition-colors"
                              title={lead.nome}
                            >
                              {lead.nome}
                            </h4>
                            {lead.precisa_revisao && (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0"
                                title={lead.observacao_revisao || 'Lead precisa de revisão nos dados'}
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Revisar
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                            <MapPin className="w-3 h-3 text-slate-400 dark:text-neutral-500 shrink-0" />
                            <span className="truncate">{lead.cidade}/{lead.uf}</span>
                            {lead.bairro && <span className="truncate">• {lead.bairro}</span>}
                          </div>

                          {/* Badge de Score e Barra de Progresso sutil */}
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold border ${getScoreBadgeClass(lead.score)}`}>
                                <Award className="w-2.5 h-2.5" />
                                {lead.score ?? 0} pts
                              </span>
                              {lead.status_qualificacao === 'qualificado' ? (
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  Qualificado
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-neutral-500 text-[9px] capitalize">
                                  {lead.status_qualificacao || 'bruto'}
                                </span>
                              )}
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-neutral-800 h-1 rounded-full overflow-hidden">
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
                            className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                            title="Editar empresa e contatos"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja excluir "${lead.nome}"?`)) {
                                onDeleteLead(lead.id);
                              }
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Bloco de Decisor / Contato Principal */}
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-neutral-800/60 space-y-1.5 text-[11px]">
                        {contatoPrincipal ? (
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-slate-800 dark:text-neutral-200 truncate flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-blue-500 shrink-0" />
                                {contatoPrincipal.nome || 'Decisor sem nome'}
                              </span>
                              {contatoPrincipal.cargo && (
                                <span className="text-[10px] text-slate-400 dark:text-neutral-500 truncate">
                                  {contatoPrincipal.cargo}
                                </span>
                              )}
                            </div>
                            {contatoPrincipal.email && (
                              <div className="flex items-center justify-between gap-1 mt-1 text-[10px]">
                                <span className="text-slate-500 dark:text-neutral-400 truncate font-mono">
                                  {contatoPrincipal.email}
                                </span>
                                <EmailStatusBadge status={contatoPrincipal.email_status} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 dark:text-neutral-500 italic flex items-center gap-1">
                            <span>Nenhum decisor cadastrado</span>
                          </div>
                        )}

                        {/* Contador de outros contatos */}
                        {outrosContatosCount > 0 && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 pt-0.5">
                            <Users className="w-2.5 h-2.5" />
                            <span>+{outrosContatosCount} outro{outrosContatosCount > 1 ? 's' : ''} contato{outrosContatosCount > 1 ? 's' : ''}</span>
                          </div>
                        )}

                        {/* Telefone */}
                        {lead.telefone && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400 pt-0.5">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{lead.telefone}</span>
                          </div>
                        )}

                        {/* Gancho de Personalização SDR */}
                        {lead.gancho_personalizacao && (
                          <div className="mt-2 p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-[11px] text-indigo-900 dark:text-indigo-200">
                            <div className="flex items-center justify-between gap-1 mb-1 font-semibold text-[10px] text-indigo-700 dark:text-indigo-300">
                              <span className="flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                Gancho SDR
                              </span>
                              {lead.fontes_pesquisa && lead.fontes_pesquisa.length > 0 && lead.fontes_pesquisa[0] && (
                                <a
                                  href={lead.fontes_pesquisa[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 text-[9px]"
                                  title={lead.fontes_pesquisa[0]}
                                >
                                  Fonte
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                            <p className="line-clamp-2 italic leading-relaxed text-[10.5px]">
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
                              className="mt-2 p-2 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 text-[11px] cursor-pointer hover:bg-purple-100/70 dark:hover:bg-purple-900/40 transition"
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`inline-flex items-center px-1.5 py-0.2 rounded font-bold border text-[9px] ${badge.bg}`}>
                                    {badge.label}
                                  </span>
                                  {ultimaResposta && !ultimaResposta.tratada && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-600 text-white animate-pulse">
                                      Nova
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] text-purple-600 dark:text-purple-400 font-semibold">
                                  Ver resposta →
                                </span>
                              </div>
                              {ultimaResposta?.corpo_texto && (
                                <p className="line-clamp-2 text-slate-700 dark:text-neutral-300 italic text-[10.5px]">
                                  &ldquo;{ultimaResposta.corpo_texto}&rdquo;
                                </p>
                              )}
                              {ultimaResposta?.justificativa && (
                                <p className="text-[9.5px] text-purple-800 dark:text-purple-300 font-medium mt-1 line-clamp-1">
                                  IA: {ultimaResposta.justificativa}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Rodapé do Card: Ações de Contato e Avanço de Status */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-neutral-800/60 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          {/* Botão de Iniciar Sequência de E-mails */}
                          <button
                            type="button"
                            onClick={() => onSendEmail(lead)}
                            disabled={lead.status_funil === 'em_sequencia' || updatingId === lead.id}
                            className={`p-1.5 rounded-lg border transition ${
                              lead.status_funil === 'em_sequencia'
                                ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 opacity-80 cursor-default'
                                : 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer'
                            }`}
                            title={
                              lead.status_funil === 'em_sequencia'
                                ? 'Sequência já em andamento'
                                : 'Iniciar Sequência de E-mails (5 toques)'
                            }
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>

                          {/* Botão de WhatsApp Web (Ativo) */}
                          {lead.telefone && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onSendWhatsApp) {
                                  onSendWhatsApp(lead);
                                } else {
                                  const message = generateWhatsAppMessage(lead);
                                  const url = getWhatsAppUrl(lead.telefone!, message);
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              className="p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer"
                              title="Abrir WhatsApp Web"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Botão de Agendar Reunião */}
                          {onScheduleMeeting && (
                            <button
                              type="button"
                              onClick={() => onScheduleMeeting(lead)}
                              className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition cursor-pointer"
                              title="Agendar Reunião no Google Agenda"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Botão Rápido de Avançar Etapa */}
                        {column.id === 'novo' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(lead.id, 'em_sequencia', 'novo')}
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white transition cursor-pointer"
                          >
                            Sequência →
                          </button>
                        )}
                        {column.id === 'em_sequencia' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(lead.id, 'contato_enviado', 'em_sequencia')}
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer"
                          >
                            Enviado →
                          </button>
                        )}
                        {column.id === 'contato_enviado' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(lead.id, 'respondido', 'contato_enviado')}
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white transition cursor-pointer"
                          >
                            Respondeu →
                          </button>
                        )}
                        {column.id === 'respondido' && onScheduleMeeting && (
                          <button
                            type="button"
                            onClick={() => onScheduleMeeting(lead)}
                            className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer"
                          >
                            Agendar
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
  );
}
