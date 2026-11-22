'use client';

import React, { useState } from 'react';
import { 
  Play, 
  AlertTriangle, 
  X, 
  Loader2, 
  CheckCircle2, 
  ShieldAlert,
  Bot
} from 'lucide-react';
import { triggerAgentWorkflow } from '@/actions/leads';

interface RodarAgenteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RodarAgenteModal({
  isOpen,
  onClose,
  onSuccess,
}: RodarAgenteModalProps) {
  const [forcar, setForcar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmouForcar, setConfirmouForcar] = useState(false);
  const [resultado, setResultado] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  if (!isOpen) return null;

  const handleDisparar = async () => {
    if (forcar && !confirmouForcar) {
      const confirmacao = window.confirm(
        'Atenção: Isso entrega mais 20 leads hoje mesmo que o lote diário já tenha sido entregue. Deseja prosseguir?'
      );
      if (!confirmacao) return;
      setConfirmouForcar(true);
    }

    setIsSubmitting(true);
    setResultado(null);

    try {
      const res = await triggerAgentWorkflow({ forcar });
      setResultado(res);
      if (res.success) {
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      setResultado({
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao disparar agente',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-100">
                Disparar Agente SDR
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                Rotina autônoma de prospecção e qualificação
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 dark:text-neutral-300 leading-relaxed">
            O robô SDR executará o funil de prospecção completo via <strong>GitHub Actions</strong> (enriquecimento por CNPJ/QSA, busca de decisores pedagógicos, verificação de e-mails, cálculo de score e personalização com Claude).
          </p>

          {/* Opção de Forçar */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50/70 dark:bg-neutral-900/50 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={forcar}
                onChange={(e) => {
                  setForcar(e.target.checked);
                  setConfirmouForcar(false);
                }}
                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-neutral-200">
                  Forçar entrega de novo lote hoje (--forcar)
                </span>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">
                  Por padrão, o agente respeita a idempotência e não entrega novos leads se o lote de hoje já foi entregue.
                </p>
              </div>
            </label>

            {forcar && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs font-medium animate-in fade-in duration-150">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Isso entrega mais 20 leads hoje.</span>
              </div>
            )}
          </div>

          {/* Feedback de Resultado */}
          {resultado && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 animate-in fade-in duration-150 ${
                resultado.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              }`}
            >
              {resultado.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              )}
              <span className="flex-1 leading-snug">
                {resultado.message || resultado.error}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleDisparar}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Disparando...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{forcar ? 'Forçar Entrega Agora' : 'Rodar Agente Agora'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
