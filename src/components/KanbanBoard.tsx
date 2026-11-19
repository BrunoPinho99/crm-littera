'use client';

import React, { useState } from 'react';
import { LeadEscolar } from '@/types/database';
import { 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  Clock, 
  Send, 
  Calendar, 
  MessageSquareCheck, 
  Sparkles,
  Edit2,
  Trash2,
  UserCheck,
  CheckCircle2,
  MessageCircle
} from 'lucide-react';
import { generateWhatsAppMessage, getWhatsAppUrl } from '@/lib/whatsapp';

interface KanbanBoardProps {
  leads: LeadEscolar[];
  onStatusChange: (leadId: string, newStatus: LeadEscolar['status']) => void;
  onSendEmail: (lead: LeadEscolar) => void;
  onSendWhatsApp?: (lead: LeadEscolar) => void;
  onEditLead: (lead: LeadEscolar) => void;
  onDeleteLead: (leadId: string) => void;
  onScheduleMeeting?: (lead: LeadEscolar) => void;
  updatingId: string | null;
}

const COLUMNS: {
  id: LeadEscolar['status'];
  title: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  headerBg: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'novo',
    title: 'Novas Empresas (Curadas)',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800/60',
    headerBg: 'bg-emerald-50/50 dark:bg-emerald-950/30',
    icon: <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
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

export default function KanbanBoard({
  leads,
  onStatusChange,
  onSendEmail,
  onSendWhatsApp,
  onEditLead,
  onDeleteLead,
  onScheduleMeeting,
  updatingId,
}: KanbanBoardProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadEscolar['status'] | null>(null);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, colId: LeadEscolar['status']) => {
    e.preventDefault();
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: LeadEscolar['status']) => {
    e.preventDefault();
    setDragOverColumn(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (leadId) {
      const lead = leads.find((l) => l.id === leadId);
      if (lead && lead.status !== targetStatus) {
        onStatusChange(leadId, targetStatus);
      }
    }
    setDraggedLeadId(null);
  };

  return (
    <div className="w-full overflow-x-auto pb-4 pt-1">
      <div className="flex gap-4 items-start min-w-max">
        {COLUMNS.map((col) => {
          const columnLeads = leads.filter((l) => l.status === col.id);
          const isHovered = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex flex-col w-[320px] sm:w-[340px] shrink-0 min-h-[580px] rounded-2xl border transition-all duration-200 bg-white dark:bg-[#121215] shadow-xs ${
                isHovered
                  ? `${col.borderClass} ring-2 ring-blue-500/30 scale-[1.01] bg-slate-50/50 dark:bg-neutral-900/50`
                  : 'border-slate-200/90 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700'
              }`}
            >
            {/* Cabeçalho da Coluna */}
            <div className={`p-4 border-b border-slate-100 dark:border-neutral-800/80 flex items-center justify-between rounded-t-2xl ${col.headerBg}`}>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-white dark:bg-neutral-900 shadow-xs border border-slate-200/60 dark:border-neutral-700">
                  {col.icon}
                </div>
                <h3 className="font-bold text-xs text-slate-800 dark:text-neutral-100 tracking-tight">
                  {col.title}
                </h3>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${col.badgeBg} ${col.badgeText}`}>
                {columnLeads.length}
              </span>
            </div>

            {/* Lista de Cards */}
            <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
              {columnLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 dark:border-neutral-800 rounded-xl text-center px-4">
                  <p className="text-xs text-slate-400 dark:text-neutral-500">Nenhum lead nesta etapa</p>
                  <p className="text-[10px] text-slate-400 dark:text-neutral-600 mt-0.5">Arraste um card aqui para mover</p>
                </div>
              ) : (
                columnLeads.map((lead) => {
                  const isUpdating = updatingId === lead.id;
                  const isBeingDragged = draggedLeadId === lead.id;

                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={() => setDraggedLeadId(null)}
                      className={`group relative p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#18181b] hover:border-blue-300 dark:hover:border-neutral-600 hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing ${
                        isBeingDragged ? 'opacity-40 scale-95 border-blue-400' : ''
                      } ${isUpdating ? 'animate-pulse pointer-events-none' : ''}`}
                    >
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                            {lead.nome_escola}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-400">
                            <MapPin className="w-3 h-3 text-slate-400 dark:text-neutral-500 shrink-0" />
                            <span>{lead.cidade}</span>
                          </div>
                        </div>

                        {/* Botões de Ação CRUD (Editar e Deletar) */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditLead(lead);
                            }}
                            className="p-1 rounded-md text-slate-400 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                            title="Editar empresa"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteLead(lead.id);
                            }}
                            className="p-1 rounded-md text-slate-400 dark:text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="Excluir empresa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Decisor & Contato */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-neutral-800 space-y-1.5 text-xs">
                        {lead.nome_decisor ? (
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-neutral-200">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="font-semibold truncate">{lead.nome_decisor}</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 dark:text-neutral-500 italic">Decisor a identificar</div>
                        )}

                        <div className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-neutral-400">
                          {(lead.email_decisor || lead.email_escola) && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Mail className="w-3 h-3 text-slate-400 dark:text-neutral-500 shrink-0" />
                              <span className="truncate">{lead.email_decisor || lead.email_escola}</span>
                            </div>
                          )}
                          {lead.telefone_escola && (
                            <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-neutral-300">
                              <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{lead.telefone_escola}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rodapé do Card */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1 text-slate-400 dark:text-neutral-500">
                          <Clock className="w-3 h-3" />
                          <span>
                            {lead.ultima_interacao
                              ? new Date(lead.ultima_interacao).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: 'short',
                                })
                              : 'Sem contato'}
                          </span>
                        </div>

                        {/* Ações rápidas de avanço */}
                        {lead.status === 'novo' ? (
                          <div className="flex items-center gap-1.5">
                            {lead.telefone_escola && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSendWhatsApp) {
                                    onSendWhatsApp(lead);
                                  } else {
                                    const msg = generateWhatsAppMessage(lead);
                                    window.open(getWhatsAppUrl(lead.telefone_escola!, msg), '_blank');
                                    onStatusChange(lead.id, 'contato_enviado');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] transition cursor-pointer shadow-xs"
                                title="Enviar mensagem personalizada no WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>Zap</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSendEmail(lead);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] transition cursor-pointer shadow-xs"
                              title="Disparar e-mail automático via Gmail"
                            >
                              <Send className="w-3 h-3" />
                              <span>E-mail</span>
                            </button>
                          </div>
                        ) : lead.status === 'contato_enviado' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStatusChange(lead.id, 'respondido');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold text-[11px] transition cursor-pointer"
                          >
                            <MessageSquareCheck className="w-3 h-3" />
                            <span>Respondeu</span>
                          </button>
                        ) : lead.status === 'respondido' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onScheduleMeeting) {
                                onScheduleMeeting(lead);
                              } else {
                                onStatusChange(lead.id, 'reuniao_agendada');
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold text-[11px] transition cursor-pointer"
                            title="Agendar no Google Agenda com Meet e convite"
                          >
                            <Calendar className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>Agendar Meet</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onScheduleMeeting) {
                                onScheduleMeeting(lead);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-bold text-[11px] cursor-pointer"
                            title="Ver ou Reagendar no Google Agenda"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Agendado</span>
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
