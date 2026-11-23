'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  User,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { getLembretesAction, concluirLembreteAction, LembreteComEscola } from '@/actions/respostas';

interface LembretesClientProps {
  initialLembretes: LembreteComEscola[];
}

export default function LembretesClient({ initialLembretes }: LembretesClientProps) {
  const [lembretes, setLembretes] = useState<LembreteComEscola[]>(initialLembretes);
  const [filtro, setFiltro] = useState<'todos' | 'hoje' | 'atrasados'>('todos');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const hoje = new Date().toISOString().split('T')[0];

  const carregarLembretes = async (novoFiltro: 'todos' | 'hoje' | 'atrasados') => {
    setLoading(true);
    setFiltro(novoFiltro);
    try {
      const data = await getLembretesAction(novoFiltro);
      setLembretes(data);
    } catch (err) {
      console.error('Erro ao buscar lembretes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConcluir = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await concluirLembreteAction(id);
      if (res.success) {
        setLembretes((prev) => prev.filter((l) => l.id !== id));
      } else {
        alert(`Erro ao concluir: ${res.error}`);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // Contadores
  const atrasadosCount = initialLembretes.filter((l) => l.data < hoje && !l.concluido).length;
  const hojeCount = initialLembretes.filter((l) => l.data === hoje && !l.concluido).length;
  const todosCount = initialLembretes.filter((l) => !l.concluido).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition shadow-2xs"
              title="Voltar para o CRM"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-100">
                  Lembretes de Retorno
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Cadência & Retornos
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Gerados automaticamente quando decisores respondem &ldquo;agora não&rdquo; com previsão de retorno futuro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => carregarLembretes(filtro)}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-neutral-800/80 transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Abas de Filtros */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => carregarLembretes('todos')}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              filtro === 'todos'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-neutral-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Todos os Pendentes</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-mono">
              {todosCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => carregarLembretes('hoje')}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              filtro === 'hoje'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-neutral-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            <span>Para Hoje</span>
            {hojeCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono font-bold">
                {hojeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => carregarLembretes('atrasados')}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              filtro === 'atrasados'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400 dark:border-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-neutral-300'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>Atrasados</span>
            {atrasadosCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-mono font-bold">
                {atrasadosCount}
              </span>
            )}
          </button>
        </div>

        {/* Lista de Lembretes */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs">Carregando lembretes...</p>
          </div>
        ) : lembretes.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-neutral-800 rounded-2xl text-center p-6 text-slate-400">
            <Calendar className="w-10 h-10 mb-2 stroke-1 text-slate-300 dark:text-neutral-600" />
            <p className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
              Nenhum lembrete pendente
            </p>
            <p className="text-[11px] max-w-sm mt-1">
              Quando um lead responder pedindo para contatar no próximo semestre ou após férias, o sistema criará o lembrete aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {lembretes.map((item) => {
              const isAtrasado = item.data < hoje;
              const isHoje = item.data === hoje;
              const isActionLoading = actionLoadingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all duration-200 bg-white dark:bg-[#121215] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs ${
                    isAtrasado
                      ? 'border-rose-300/80 dark:border-rose-900/60 bg-rose-50/20'
                      : isHoje
                      ? 'border-amber-300/80 dark:border-amber-900/60 bg-amber-50/20'
                      : 'border-slate-200/80 dark:border-neutral-800'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          isAtrasado
                            ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                            : isHoje
                            ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-neutral-800 dark:text-neutral-300'
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        {new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                        {isAtrasado && ' • Vencido'}
                        {isHoje && ' • Hoje'}
                      </span>

                      {item.escolas && (
                        <Link
                          href={`/?escola=${item.escola_id}`}
                          className="font-bold text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate"
                        >
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{item.escolas.nome}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </Link>
                      )}
                    </div>

                    <p className="text-xs text-slate-800 dark:text-neutral-200 font-medium">
                      {item.texto}
                    </p>

                    {item.contatos && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-400">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>
                          {item.contatos.nome} ({item.contatos.email})
                          {item.contatos.cargo ? ` • ${item.contatos.cargo}` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleConcluir(item.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer disabled:opacity-50"
                      title="Marcar como concluído"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isActionLoading ? 'Concluindo...' : 'Marcar Concluído'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
