'use client';

import React, { useState } from 'react';
import { EscolaComContatos } from '@/types/database';
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar';
import { agendarReuniaoManualAction } from '@/actions/reunioes';
import { X, Calendar, Video, Mail, User, Building2, ExternalLink, Link2 } from 'lucide-react';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lead: EscolaComContatos | any | null;
  onConfirmScheduled: (leadId: string) => Promise<void>;
}

export default function ScheduleMeetingModal({
  isOpen,
  onClose,
  lead,
  onConfirmScheduled,
}: ScheduleMeetingModalProps) {
  // Define default date: amanhã às 14:00
  const getDefaultDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [meetingDate, setMeetingDate] = useState(getDefaultDateTime());
  const [duration, setDuration] = useState(30);
  const [linkReuniao, setLinkReuniao] = useState('');
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [prevLeadId, setPrevLeadId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const schoolName = lead?.nome || lead?.nome_escola || '';
  const contatos = lead?.contatos || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const principal = contatos.find((c: any) => c.principal) || contatos[0];
  const decisorName = principal?.nome || lead?.nome_decisor || 'Equipe Diretiva';
  const attendeeEmail = principal?.email || lead?.email_decisor || lead?.email_geral || lead?.email_escola || '';
  const phone = lead?.telefone || lead?.telefone_escola || 'Não informado';

  if (lead && lead.id !== prevLeadId) {
    setPrevLeadId(lead.id);
    setCustomTitle(`Demonstração Littera Platform • ${schoolName}`);
  }

  const title = customTitle ?? (lead ? `Demonstração Littera Platform • ${schoolName}` : '');
  const setTitle = setCustomTitle;

  if (!isOpen || !lead) return null;

  const handleOpenGoogleCalendar = async () => {
    setIsSubmitting(true);
    try {
      const description = 
        `Reunião de Demonstração e Alinhamento Pedagógico com ${schoolName}.\n\n` +
        `Decisor: ${decisorName}\n` +
        `E-mail: ${attendeeEmail}\n` +
        `Telefone/WhatsApp: ${phone}\n` +
        `Cidade: ${lead.cidade}\n\n` +
        `Pauta:\n` +
        `1. Apresentação das soluções tecnológicas Littera\n` +
        `2. Diagnóstico das demandas pedagógicas da instituição\n` +
        `3. Proposta de implementação piloto e condições comerciais.`;

      const gcalUrl = buildGoogleCalendarUrl({
        title: title || `Reunião Littera • ${schoolName}`,
        description,
        location: linkReuniao.trim() || 'Google Meet (videoconferência)',
        startDateTime: meetingDate,
        durationMinutes: duration,
        attendeesEmails: attendeeEmail ? [attendeeEmail] : [],
      });

      // 1. Grava no CRM via registrarReuniao (provedor 'manual')
      const dInicio = new Date(meetingDate);
      const dFim = new Date(dInicio.getTime() + duration * 60 * 1000);

      const resManual = await agendarReuniaoManualAction({
        escolaId: lead.id,
        contatoId: principal?.id || null,
        inicio: dInicio.toISOString(),
        fim: dFim.toISOString(),
        linkReuniao: linkReuniao.trim() || null,
        notas: description,
        titulo: title,
      });

      if (!resManual.sucesso) {
        alert(`Erro ao registrar reunião: ${resManual.erro}`);
        return;
      }

      const win = window.open(gcalUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        alert('O navegador bloqueou a abertura do Google Agenda. Permita pop-ups para este site.');
      }

      await onConfirmScheduled(lead.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                Agendar Reunião no Google Agenda
              </h2>
              <p className="text-xs text-slate-400 dark:text-neutral-500">
                Gera o convite com Google Meet e avança o status no CRM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informações da Empresa & Participante */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-neutral-300">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold text-slate-900 dark:text-neutral-100">{schoolName}</span>
              <span className="text-[10px] text-slate-400">({lead.cidade})</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{decisorName}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-400">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              {attendeeEmail ? (
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">{attendeeEmail}</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 italic text-[11px]">
                  Sem e-mail cadastrado (será necessário preencher no Google Agenda)
                </span>
              )}
            </div>
          </div>

          {/* Campos de Data, Hora e Duração */}
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                Título do Evento
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Data e Hora de Início</span>
                </label>
                <input
                  type="datetime-local"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                  Duração da Reunião
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
                >
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos (Padrão)</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>1 hora</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Link da Sala / Videoconferência (Opcional)</span>
              </label>
              <input
                type="url"
                value={linkReuniao}
                onChange={(e) => setLinkReuniao(e.target.value)}
                placeholder="https://meet.google.com/xyz ou deixe em branco"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-center gap-2.5 text-xs text-blue-700 dark:text-blue-300">
              <Video className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Gera o convite com Google Meet, atualiza a etapa no CRM e encerra a sequência automaticamente.</span>
            </div>
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleOpenGoogleCalendar}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Abrindo...' : 'Abrir no Google Agenda'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
