'use client';

import React from 'react';
import { Mail, CheckCircle, Play, X, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';

interface AutoDispatcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isRunning: boolean;
  totalPending: number;
  progress: {
    current: number;
    total: number;
    currentSchool: string;
    successCount: number;
    errorCount: number;
    isSimulated: boolean;
  };
}

export default function AutoDispatcherModal({
  isOpen,
  onClose,
  onConfirm,
  isRunning,
  totalPending,
  progress,
}: AutoDispatcherModalProps) {
  if (!isOpen) return null;

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div
      onClick={isRunning ? undefined : onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                Disparador Automático de E-mails
              </h2>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Disparo via e-mail configurado no servidor
              </p>
            </div>
          </div>

          {!isRunning && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-5">
          {!isRunning && progress.current === 0 ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-blue-900 dark:text-blue-200 text-xs leading-relaxed space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-blue-700 dark:text-blue-400">
                  <Sparkles className="w-4 h-4" />
                  <span>Pronto para iniciar prospecção em massa</span>
                </div>
                <p>
                  O robô identificou <strong>{totalPending} empresa(s) nova(s)</strong> elegíveis para envio no estágio &quot;Novo&quot; com e-mail cadastrado.
                </p>
                <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80">
                  Cada e-mail será enviado com intervalo de segurança (3 segundos) para proteger a reputação do seu Gmail e evitar bloqueios. O status no Kanban será avançado para <strong>Contato Enviado</strong> automaticamente.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-[11px] text-slate-600 dark:text-neutral-400 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-neutral-300">Remetente:</p>
                <p className="font-mono text-slate-800 dark:text-neutral-200">Littera Educacional &lt;Configurado via GMAIL_USER&gt;</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Barra de Progresso */}
              <div>
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    {isRunning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                        <span>Enviando e-mails...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Campanha Concluída!</span>
                      </>
                    )}
                  </span>
                  <span>{percentage}% ({progress.current}/{progress.total})</span>
                </div>

                <div className="w-full bg-slate-100 dark:bg-neutral-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              {/* Status Atual */}
              {isRunning && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-xs">
                  <span className="text-slate-400 dark:text-neutral-500 text-[11px]">Enviando para agora:</span>
                  <p className="font-bold text-slate-800 dark:text-neutral-200 truncate mt-0.5">
                    {progress.currentSchool || 'Processando fila...'}
                  </p>
                </div>
              )}

              {/* Contadores */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-center">
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Enviados com Sucesso</span>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{progress.successCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 text-center">
                  <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">Falhas / Sem E-mail</span>
                  <p className="text-xl font-black text-rose-700 dark:text-rose-300 mt-0.5">{progress.errorCount}</p>
                </div>
              </div>

              {progress.isSimulated && !isRunning && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Modo de Teste/Simulação Ativo:</span>
                    <p className="text-[11px] mt-0.5">
                      Os leads foram atualizados no CRM. Para envio SMTP real através dos servidores do Google, lembre-se de configurar a <strong>Senha de App</strong> no arquivo <code>.env.local</code>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé / Ações */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40">
          {!isRunning && progress.current === 0 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={totalPending === 0}
                onClick={onConfirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Disparar para {totalPending} Leads</span>
              </button>
            </>
          ) : !isRunning && progress.current > 0 ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-900 transition cursor-pointer"
            >
              Fechar e Ver Resultados
            </button>
          ) : (
            <div className="text-xs text-slate-500 dark:text-neutral-400 italic">
              Não feche a página durante o disparo da campanha...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
