'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Inbox,
  CheckCircle2,
  Trash2,
  Edit2,
  Play,
  CheckCheck,
  Clock,
  Building2,
  User,
  Mail,
} from 'lucide-react';
import {
  getFilaEnviosAction,
  aprovarItemFilaAction,
  aprovarTodosFilaAction,
  descartarItemFilaAction,
  executarMotorAction,
} from '@/actions/sequencias';
import { FilaEnvio } from '@/types/database';

type FilaItemCompleto = FilaEnvio & {
  escolaNome: string;
  contatoNome: string | null;
  contatoCargo: string | null;
  passoOrdem: number;
};

interface FilaClientProps {
  initialItens: FilaItemCompleto[];
}

export default function FilaClient({ initialItens }: FilaClientProps) {
  const [itens, setItens] = useState<FilaItemCompleto[]>(initialItens);
  const [statusFiltro, setStatusFiltro] = useState<string>('aguardando_aprovacao');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [isMotorRunning, setIsMotorRunning] = useState(false);

  // Estado do item sendo editado
  const [itemEditando, setItemEditando] = useState<FilaItemCompleto | null>(null);
  const [editPara, setEditPara] = useState('');
  const [editAssunto, setEditAssunto] = useState('');
  const [editCorpoTexto, setEditCorpoTexto] = useState('');

  const carregarItens = async (filtro: string) => {
    setLoading(true);
    setStatusFiltro(filtro);
    try {
      const data = await getFilaEnviosAction(filtro);
      setItens(data);
    } catch (err) {
      console.error('Erro ao buscar itens da fila:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirEdicao = (item: FilaItemCompleto) => {
    setItemEditando(item);
    setEditPara(item.para);
    setEditAssunto(item.assunto);
    setEditCorpoTexto(item.corpo_texto);
  };

  const handleSalvarEAprovar = async () => {
    if (!itemEditando) return;
    setActionLoadingId(itemEditando.id);
    try {
      const res = await aprovarItemFilaAction(itemEditando.id, {
        para: editPara,
        assunto: editAssunto,
        corpo_texto: editCorpoTexto,
      });

      if (res.success) {
        setItemEditando(null);
        await carregarItens(statusFiltro);
      } else {
        alert(`Erro ao aprovar item: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao aprovar item.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAprovarDireto = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await aprovarItemFilaAction(id);
      if (res.success) {
        await carregarItens(statusFiltro);
      } else {
        alert(`Erro ao aprovar: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao aprovar item.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDescartar = async (id: string) => {
    if (!confirm('Deseja realmente descartar este e-mail? Ele não será enviado e o contato passará para o próximo passo.')) return;
    setActionLoadingId(id);
    try {
      const res = await descartarItemFilaAction(id);
      if (res.success) {
        await carregarItens(statusFiltro);
      } else {
        alert(`Erro ao descartar: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao descartar item.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAprovarTodos = async () => {
    const pendentes = itens.filter((i) => i.status === 'aguardando_aprovacao');
    if (pendentes.length === 0) return;

    if (!confirm(`Deseja aprovar todos os ${pendentes.length} e-mails pendentes para despacho comercial?`)) return;

    setIsApprovingAll(true);
    try {
      const res = await aprovarTodosFilaAction();
      if (res.success) {
        alert(`${res.total} e-mail(s) aprovado(s) com sucesso!`);
        await carregarItens(statusFiltro);
      } else {
        alert(`Erro ao aprovar todos: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao aprovar todos os itens.');
    } finally {
      setIsApprovingAll(false);
    }
  };

  const handleExecutarMotorAgora = async () => {
    setIsMotorRunning(true);
    try {
      const res = await executarMotorAction(true); // forçar janela para teste
      if (res.success) {
        alert(
          `Motor executado com sucesso!\n\n` +
            `• Inscrições processadas: ${res.inscricoesProcessadas}\n` +
            `• Envios realizados agora: ${res.enviosRealizados}\n` +
            (res.erros.length > 0 ? `\nAvisos:\n${res.erros.join('\n')}` : '')
        );
        await carregarItens(statusFiltro);
      } else {
        alert('Falha na execução do motor.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao rodar motor.');
    } finally {
      setIsMotorRunning(false);
    }
  };

  const abas = [
    { id: 'aguardando_aprovacao', label: 'Aguardando Aprovação' },
    { id: 'aprovado', label: 'Aprovados para Envio' },
    { id: 'enviado', label: 'Enviados' },
    { id: 'descartado', label: 'Descartados' },
    { id: 'erro', label: 'Com Erro' },
    { id: 'todos', label: 'Todos' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0c] text-slate-900 dark:text-neutral-100 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200 transition mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao CRM</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900/60 text-blue-600 dark:text-blue-400">
                <Inbox className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                  Fila de Envios & Aprovação
                </h1>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Revise, personalize e aprove cada e-mail antes do disparo comercial autônomo
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExecutarMotorAgora}
              disabled={isMotorRunning}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 transition cursor-pointer disabled:opacity-50"
              title="Executa o motor imediatamente, processando inscrições e disparando aprovados"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isMotorRunning ? 'Executando...' : 'Processar Motor Agora'}</span>
            </button>

            {statusFiltro === 'aguardando_aprovacao' && itens.length > 0 && (
              <button
                onClick={handleAprovarTodos}
                disabled={isApprovingAll}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-4 h-4" />
                <span>{isApprovingAll ? 'Aprovando...' : 'Aprovar Todos os Pendentes'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Abas de Filtro de Status */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 dark:border-neutral-800">
          {abas.map((aba) => (
            <button
              key={aba.id}
              onClick={() => carregarItens(aba.id)}
              className={`pb-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition cursor-pointer ${
                statusFiltro === aba.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-neutral-300'
              }`}
            >
              {aba.label}
              {aba.id === 'aguardando_aprovacao' && statusFiltro === aba.id && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono">
                  {itens.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Listagem de Itens */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 dark:text-neutral-500 text-xs flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Atualizando fila de envios...</span>
          </div>
        ) : itens.length === 0 ? (
          <div className="p-16 text-center border-2 border-dashed border-slate-200 dark:border-neutral-800 rounded-2xl space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-neutral-900 text-slate-400 flex items-center justify-center">
              <Inbox className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-200">
                Nenhum e-mail nesta visualização
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Não há itens correspondentes ao filtro &quot;{statusFiltro}&quot;. Inicie sequências nos leads do CRM para alimentar a fila.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              Ir para o CRM
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {itens.map((item) => (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-neutral-800/90 shadow-xs space-y-4 transition hover:border-slate-300 dark:hover:border-neutral-700"
              >
                {/* Header do Card */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-neutral-100 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {item.escolaNome}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                        Toque {item.passoOrdem} de 5
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          item.status === 'enviado'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : item.status === 'aguardando_aprovacao'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : item.status === 'aprovado'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-neutral-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {item.contatoNome || 'Contato da Escola'} {item.contatoCargo ? `(${item.contatoCargo})` : ''}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {item.para}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Agendado:{' '}
                        {new Date(item.agendado_para).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        (Brasília)
                      </span>
                    </div>
                  </div>

                  {/* Ações por Item */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {item.status === 'aguardando_aprovacao' && (
                      <>
                        <button
                          onClick={() => handleAbrirEdicao(item)}
                          disabled={actionLoadingId === item.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => handleAprovarDireto(item.id)}
                          disabled={actionLoadingId === item.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aprovar</span>
                        </button>
                        <button
                          onClick={() => handleDescartar(item.id)}
                          disabled={actionLoadingId === item.id}
                          className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                          title="Descartar este envio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Prévia do Conteúdo */}
                <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-neutral-900/50 border border-slate-200/60 dark:border-neutral-800/60 space-y-2">
                  <div className="text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase block">Assunto</span>
                    <span className="font-bold text-slate-800 dark:text-neutral-200">{item.assunto}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase block">Corpo</span>
                    <p className="text-slate-600 dark:text-neutral-300 whitespace-pre-line leading-relaxed font-sans text-xs">
                      {item.corpo_texto}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de Edição de E-mail da Fila */}
        {itemEditando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-100">
                    Revisar & Personalizar E-mail
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    {itemEditando.escolaNome} • Toque {itemEditando.passoOrdem}
                  </p>
                </div>
                <button
                  onClick={() => setItemEditando(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-neutral-300"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
                <div>
                  <label className="font-bold text-slate-700 dark:text-neutral-300 block mb-1">
                    Destinatário (E-mail)
                  </label>
                  <input
                    type="email"
                    value={editPara}
                    onChange={(e) => setEditPara(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-neutral-300 block mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={editAssunto}
                    onChange={(e) => setEditAssunto(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-neutral-300 block mb-1">
                    Corpo da Mensagem (Texto Simples)
                  </label>
                  <textarea
                    rows={10}
                    value={editCorpoTexto}
                    onChange={(e) => setEditCorpoTexto(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans text-xs resize-y"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setItemEditando(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSalvarEAprovar}
                  disabled={actionLoadingId === itemEditando.id}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvar Alterações & Aprovar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
