'use client';

import React, { useState } from 'react';
import { ConfigScore } from '@/types/database';
import { updateConfigScoreAction, recalcularScoresAction } from '@/actions/leads';
import { 
  RefreshCw, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Sliders, 
  Layers, 
  Info,
  Check
} from 'lucide-react';
import Link from 'next/link';

interface ScoreConfigClientProps {
  initialConfigs: ConfigScore[];
}

function getCategory(chave: string): string {
  if (chave.includes('faixa') || chave.includes('em_')) return 'Porte / Ensino Médio';
  if (chave.includes('decisor')) return 'Decisores';
  if (chave.includes('email') || chave.includes('penalidade')) return 'E-mails Institucionais';
  if (chave.includes('google')) return 'Avaliações Google';
  if (chave.includes('corte')) return 'Limites de Qualificação';
  if (chave.includes('rede')) return 'Rede de Ensino';
  if (chave.includes('site')) return 'Site & Presença Digital';
  if (chave.includes('telefone') || chave.includes('df')) return 'Contato & Localização';
  return 'Geral';
}

export default function ScoreConfigClient({ initialConfigs }: ScoreConfigClientProps) {
  const [configs, setConfigs] = useState<ConfigScore[]>(initialConfigs);
  const [editingValues, setEditingValues] = useState<Record<string, number>>({});
  const [editingTextValues, setEditingTextValues] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [savedSuccessKeys, setSavedSuccessKeys] = useState<Record<string, boolean>>({});
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const categories = Array.from(new Set(configs.map((c) => getCategory(c.chave))));

  const handleValueChange = (chave: string, valStr: string) => {
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      setEditingValues((prev) => ({ ...prev, [chave]: num }));
    }
  };

  const handleTextValueChange = (chave: string, valStr: string) => {
    setEditingTextValues((prev) => ({ ...prev, [chave]: valStr }));
  };

  const handleSave = async (chave: string) => {
    const item = configs.find((c) => c.chave === chave);
    const isText = item?.valor_texto !== null && item?.valor_texto !== undefined || chave.endsWith('_uf');

    const currentNumValue = item?.valor ?? 0;
    const currentTextValue = item?.valor_texto ?? '';

    const newNumValue = editingValues[chave] !== undefined ? editingValues[chave] : currentNumValue;
    const newTextValue = editingTextValues[chave] !== undefined ? editingTextValues[chave] : currentTextValue;

    setSavingKeys((prev) => ({ ...prev, [chave]: true }));
    try {
      const res = isText
        ? await updateConfigScoreAction(chave, null, newTextValue)
        : await updateConfigScoreAction(chave, newNumValue, null);

      if (res.success) {
        setConfigs((prev) =>
          prev.map((c) =>
            c.chave === chave
              ? { ...c, valor: isText ? null : newNumValue, valor_texto: isText ? newTextValue : null }
              : c
          )
        );
        setSavedSuccessKeys((prev) => ({ ...prev, [chave]: true }));
        setTimeout(() => {
          setSavedSuccessKeys((prev) => {
            const next = { ...prev };
            delete next[chave];
            return next;
          });
        }, 2500);
      } else {
        setToastMessage({ type: 'error', text: res.error || 'Erro ao salvar configuração' });
      }
    } catch (err) {
      setToastMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao salvar',
      });
    } finally {
      setSavingKeys((prev) => ({ ...prev, [chave]: false }));
    }
  };

  const handleRecalcular = async () => {
    if (isRecalculating) return;
    setIsRecalculating(true);
    setToastMessage(null);

    try {
      const res = await recalcularScoresAction();
      if (res.success) {
        setToastMessage({
          type: 'success',
          text: `Sucesso! ${res.count ?? 0} escolas tiveram seus scores e qualificações recalculados no banco.`,
        });
      } else {
        setToastMessage({
          type: 'error',
          text: res.error || 'Erro ao executar o recálculo no banco.',
        });
      }
    } catch (err) {
      setToastMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao processar recálculo.',
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c0c0e] text-slate-900 dark:text-neutral-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Barra Superior / Voltar */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Pipeline</span>
          </Link>

          <button
            type="button"
            onClick={handleRecalcular}
            disabled={isRecalculating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? 'Recalculando todas as escolas...' : 'Recalcular Todos os Scores'}</span>
          </button>
        </div>

        {/* Notificação Toast */}
        {toastMessage && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in duration-200 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="text-xs font-semibold">{toastMessage.text}</span>
          </div>
        )}

        {/* Header do Módulo */}
        <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 rounded-3xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-neutral-100 tracking-tight">
                Configuração de Score de Qualificação
              </h1>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Pesos, faixas e regras aplicadas pelo algoritmo plpgsql no Supabase para pontuar instituições e contatos.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-neutral-900/50 border border-slate-100 dark:border-neutral-800/80 flex items-start gap-2.5 text-xs text-slate-600 dark:text-neutral-400">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              Qualquer alteração feita nesta tela passa a vigorar imediatamente para edições futuras. Para atualizar todas as escolas já cadastradas com os novos pesos, clique no botão <strong>Recalcular Todos os Scores</strong>.
            </span>
          </div>
        </div>

        {/* Tabelas por Categoria */}
        <div className="space-y-6">
          {categories.map((cat) => {
            const catConfigs = configs.filter((c) => getCategory(c.chave) === cat);

            return (
              <div
                key={cat}
                className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xs overflow-hidden"
              >
                <div className="px-6 py-3.5 bg-slate-50/70 dark:bg-neutral-900/50 border-b border-slate-200/80 dark:border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <h2 className="text-xs font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wider">
                      Categoria: {cat}
                    </h2>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {catConfigs.length} parâmetro{catConfigs.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-neutral-800/80">
                  {catConfigs.map((item) => {
                    const isText = item.valor_texto !== null && item.valor_texto !== undefined || item.chave.endsWith('_uf');
                    const currentEditingVal =
                      editingValues[item.chave] !== undefined
                        ? editingValues[item.chave]
                        : (item.valor ?? 0);
                    const currentEditingText =
                      editingTextValues[item.chave] !== undefined
                        ? editingTextValues[item.chave]
                        : (item.valor_texto ?? '');

                    const isSaving = Boolean(savingKeys[item.chave]);
                    const isSaved = Boolean(savedSuccessKeys[item.chave]);
                    const hasChanged = isText
                      ? editingTextValues[item.chave] !== undefined && editingTextValues[item.chave] !== item.valor_texto
                      : editingValues[item.chave] !== undefined && editingValues[item.chave] !== item.valor;

                    return (
                      <div
                        key={item.chave}
                        className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/40 dark:hover:bg-neutral-900/20 transition"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-neutral-100">
                              {item.descricao || item.chave}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">
                              {item.chave}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="relative w-28">
                            {isText ? (
                              <input
                                type="text"
                                value={currentEditingText}
                                onChange={(e) => handleTextValueChange(item.chave, e.target.value)}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono font-bold text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-right uppercase"
                              />
                            ) : (
                              <input
                                type="number"
                                step="any"
                                value={currentEditingVal}
                                onChange={(e) => handleValueChange(item.chave, e.target.value)}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono font-bold text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-right"
                              />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSave(item.chave)}
                            disabled={isSaving || (!hasChanged && !isSaved)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              isSaved
                                ? 'bg-emerald-600 text-white'
                                : hasChanged
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400'
                            }`}
                          >
                            {isSaved ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Salvo</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5" />
                                <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
