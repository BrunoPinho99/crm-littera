'use client';

import React, { useState } from 'react';
import { Reuniao, ResultadoReuniao } from '@/types/database';
import { registrarPosReuniaoAction } from '@/actions/reunioes';
import {
  X,
  CheckCircle2,
  UserX,
  FileText,
  Building2,
  Calendar,
  Loader2,
  Send,
  AlertCircle,
} from 'lucide-react';

interface ModalPosReuniaoProps {
  isOpen: boolean;
  onClose: () => void;
  reuniao: Reuniao | null;
  onSuccess?: () => void;
}

export default function ModalPosReuniao({
  isOpen,
  onClose,
  reuniao,
  onSuccess,
}: ModalPosReuniaoProps) {
  const [status, setStatus] = useState<'realizada' | 'nao_compareceu'>('realizada');
  const [resultado, setResultado] = useState<ResultadoReuniao>('proposta_enviada');
  const [notas, setNotas] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!isOpen || !reuniao) return null;

  const nomeEscola = reuniao.escolas?.nome || 'Escola';
  const decisorNome = reuniao.contatos?.nome || 'Decisor';

  const formatarData = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErro(null);

    try {
      const res = await registrarPosReuniaoAction({
        reuniaoId: reuniao.id,
        status,
        resultado: status === 'realizada' ? resultado : null,
        notas: notas.trim() || null,
      });

      if (!res.sucesso) {
        setErro(res.erro || 'Falha ao registrar pós-reunião.');
        return;
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Erro ao submeter pós-reunião:', err);
      setErro('Erro de conexão ao salvar desfecho.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                Registro de Pós-Reunião
              </h2>
              <p className="text-xs text-slate-400 dark:text-neutral-500">
                Registre o desfecho da conversa e próximos passos
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Card com Detalhes da Reunião Concluída */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-neutral-200">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{nomeEscola}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-400">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{formatarData(reuniao.inicio)} ({decisorNome})</span>
            </div>
          </div>

          {erro && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Seleção do Status da Reunião */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
              A reunião aconteceu?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStatus('realizada')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  status === 'realizada'
                    ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Sim, realizada</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('nao_compareceu')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  status === 'nao_compareceu'
                    ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 ring-2 ring-rose-500/20'
                    : 'border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800'
                }`}
              >
                <UserX className="w-4 h-4 text-rose-600" />
                <span>Não compareceu (No-show)</span>
              </button>
            </div>
          </div>

          {/* Se a reunião foi realizada, escolhe o resultado */}
          {status === 'realizada' && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                Resultado da Reunião
              </label>
              <select
                value={resultado}
                onChange={(e) => setResultado(e.target.value as ResultadoReuniao)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
              >
                <option value="proposta_enviada">Proposta Comercial Enviada</option>
                <option value="teste_gratuito">Teste Gratuito / Piloto Iniciado</option>
                <option value="fechado">Negócio Fechado (Venda Concluída)</option>
                <option value="followup">Follow-up Agendado / Negociação em Andamento</option>
                <option value="sem_fit">Sem Fit / Lead Descartado</option>
              </select>
            </div>
          )}

          {/* Se não compareceu, aviso sobre lembrete automático */}
          {status === 'nao_compareceu' && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 animate-in fade-in duration-150 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>🗓️ Lembrete automático no próximo dia útil</span>
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                O CRM criará automaticamente uma tarefa na aba Lembretes para você entrar em contato e tentar reagendar a conversa com o decisor.
              </p>
            </div>
          )}

          {/* Campo de Notas */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
              Notas e Observações da Conversa
            </label>
            <textarea
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ex: Conversa produtiva com o coordenador pedagógico. Demonstraram grande interesse nas correções automáticas de redação para turmas de 3º ano..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition resize-none"
            />
          </div>

          {/* Botões */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Salvar Desfecho</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
