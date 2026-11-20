'use client';

import React, { useState } from 'react';
import { LeadEscolar } from '@/types/database';
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar';
import { X, Calendar, Video, Mail, User, Building2, ExternalLink } from 'lucide-react';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: LeadEscolar | null;
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
    // formato YYYY-MM-DDTHH:mm
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [meetingDate, setMeetingDate] = useState(getDefaultDateTime());
  const [duration, setDuration] = useState(30);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [prevLeadId, setPrevLeadId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (lead && lead.id !== prevLeadId) {
    setPrevLeadId(lead.id);
    setCustomTitle(`Demonstração Littera Platform • ${lead.nome_escola}`);
  }

  const title =
    customTitle ??
    (lead ? `Demonstração Littera Platform • ${lead.nome_escola}` : '');
  const setTitle = setCustomTitle;

  if (!isOpen || !lead) return null;

  const attendeeEmail = lead.email_decisor || lead.email_escola || '';
  const decisorName = lead.nome_decisor || 'Equipe Diretiva';

  const handleOpenGoogleCalendar = async () => {
    setIsSubmitting(true);
    try {
      const description = 
        `Reunião de Demonstração e Alinhamento Pedagógico com ${lead.nome_escola}.\n\n` +
        `Decisor: ${decisorName}\n` +
        `E-mail: ${attendeeEmail}\n` +
        `Telefone/WhatsApp: ${lead.telefone_escola || 'Não informado'}\n` +
        `Cidade: ${lead.cidade}\n\n` +
        `Pauta:\n` +
        `1. Apresentação das soluções tecnológicas Littera\n` +
        `2. Diagnóstico das demandas pedagógicas da instituição\n` +
        `3. Proposta de implementação piloto e condições comerciais.`;

      const gcalUrl = buildGoogleCalendarUrl({
        title: title || `Reunião Littera • ${lead.nome_escola}`,
        description,
        location: 'Google Meet (videoconferência)',
        startDateTime: meetingDate,
        durationMinutes: Number(duration),
        attendeesEmails: attendeeEmail ? [attendeeEmail] : [],
      });

      // Abre nova aba diretamente no Google Calendar com todos os dados preenchidos
      window.open(gcalUrl, '_blank', 'noopener,noreferrer');

      // Atualiza o lead no CRM para 'reuniao_agendada'
      await onConfirmScheduled(lead.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-neutral-100 text-base">
                Conectar ao Google Agenda
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Agendamento de Demonstração Comercial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informações do Lead */}
        <div className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-900/70 border border-slate-200 dark:border-neutral-800 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-slate-800 dark:text-neutral-200 font-bold">
              <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{lead.nome_escola}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-400">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>{decisorName}</span>
            </div>
            {attendeeEmail && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-400">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">{attendeeEmail}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
              Título do Evento no Google Agenda
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs md:text-sm text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Data & Horário
              </label>
              <input
                type="datetime-local"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Duração
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition cursor-pointer"
              >
                <option value={15}>15 minutos (Quick Call)</option>
                <option value={30}>30 minutos (Demonstração)</option>
                <option value={45}>45 minutos</option>
                <option value={60}>1 hora (Apresentação Completa)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-[11px] border border-blue-200/60 dark:border-blue-900/40">
            <Video className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>O Google Meet e o convite por e-mail para o decisor serão adicionados automaticamente.</span>
          </div>

          {/* Botões */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
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
              <span>{isSubmitting ? 'Abrindo...' : 'Agendar no Google Agenda'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
