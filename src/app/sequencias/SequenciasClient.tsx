'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ListOrdered,
  Save,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import {
  toggleModoAprovacaoAction,
  salvarPassoSequenciaAction,
} from '@/actions/sequencias';
import { Sequencia, SequenciaPasso } from '@/types/database';
import { contarPalavras, extrairPrimeiroNome } from '@/lib/sequencias/render';

interface EscolaPreviewItem {
  id: string;
  nome: string;
  cidade: string | null;
  gancho_personalizacao: string | null;
  primeiroContatoNome: string | null;
  primeiroContatoCargo: string | null;
}

interface SequenciasClientProps {
  initialSequencia: Sequencia | null;
  initialPassos: SequenciaPasso[];
  initialMetricas: {
    totalInscritos: number;
    totalEnviados: number;
    totalRespostas: number;
    totalReunioes: number;
    aguardandoAprovacao: number;
  };
  escolasPreview: EscolaPreviewItem[];
}

export default function SequenciasClient({
  initialSequencia,
  initialPassos,
  initialMetricas,
  escolasPreview,
}: SequenciasClientProps) {
  const [sequencia, setSequencia] = useState<Sequencia | null>(initialSequencia);
  const [passos, setPassos] = useState<SequenciaPasso[]>(initialPassos);
  const [passoAtivoId, setPassoAtivoId] = useState<string>(
    initialPassos[0]?.id || ''
  );
  const [escolaPreviewId, setEscolaPreviewId] = useState<string>(
    escolasPreview[0]?.id || ''
  );

  const [isTogglingModo, setIsTogglingModo] = useState(false);
  const [savingPassoId, setSavingPassoId] = useState<string | null>(null);

  // Passo selecionado no editor
  const passoAtual = passos.find((p) => p.id === passoAtivoId) || passos[0];
  const escolaSelecionada =
    escolasPreview.find((e) => e.id === escolaPreviewId) || escolasPreview[0];

  // Modificação local do passo atual
  const [diasApos, setDiasApos] = useState<number>(passoAtual?.dias_apos_anterior ?? 0);
  const [assuntoTemplate, setAssuntoTemplate] = useState<string>(passoAtual?.assunto_template ?? '');
  const [corpoTemplate, setCorpoTemplate] = useState<string>(passoAtual?.corpo_template ?? '');
  const [usarIa, setUsarIa] = useState<boolean>(passoAtual?.usar_ia ?? false);
  const [ativo, setAtivo] = useState<boolean>(passoAtual?.ativo ?? true);

  // Atualiza estado local quando troca de passo
  const selecionarPasso = (passo: SequenciaPasso) => {
    setPassoAtivoId(passo.id);
    setDiasApos(passo.dias_apos_anterior);
    setAssuntoTemplate(passo.assunto_template);
    setCorpoTemplate(passo.corpo_template);
    setUsarIa(passo.usar_ia);
    setAtivo(passo.ativo);
  };

  const handleToggleModoAprovacao = async () => {
    if (!sequencia) return;
    const novoModo = !sequencia.modo_aprovacao;
    setIsTogglingModo(true);
    try {
      const res = await toggleModoAprovacaoAction(sequencia.id, novoModo);
      if (res.success) {
        setSequencia((prev) => (prev ? { ...prev, modo_aprovacao: novoModo } : null));
      } else {
        alert(`Erro ao alterar modo de aprovação: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao alterar modo de aprovação.');
    } finally {
      setIsTogglingModo(false);
    }
  };

  const handleSalvarPasso = async () => {
    if (!passoAtual) return;
    setSavingPassoId(passoAtual.id);
    try {
      const res = await salvarPassoSequenciaAction(passoAtual.id, {
        dias_apos_anterior: Number(diasApos),
        assunto_template: assuntoTemplate,
        corpo_template: corpoTemplate,
        usar_ia: usarIa,
        ativo,
      });

      if (res.success) {
        setPassos((prev) =>
          prev.map((p) =>
            p.id === passoAtual.id
              ? {
                  ...p,
                  dias_apos_anterior: Number(diasApos),
                  assunto_template: assuntoTemplate,
                  corpo_template: corpoTemplate,
                  usar_ia: usarIa,
                  ativo,
                }
              : p
          )
        );
        alert('Passo da sequência salvo com sucesso!');
      } else {
        alert(`Erro ao salvar passo: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao salvar passo.');
    } finally {
      setSavingPassoId(null);
    }
  };

  // Renderização do Preview em Tempo Real
  const preview = useMemo(() => {
    if (!escolaSelecionada || !corpoTemplate) {
      return {
        assunto: assuntoTemplate,
        corpo: corpoTemplate,
        erros: [],
        totalPalavras: 0,
        limitePalavras: (passoAtual?.ordem === 1 ? 90 : 60),
      };
    }

    const primeiroNome = extrairPrimeiroNome(escolaSelecionada.primeiroContatoNome);
    const linkAgenda = 'https://calendly.com/littera';
    const remetente = 'Bruno Pinho — Fundador, Littera (littera.app.br)';
    const gancho = escolaSelecionada.gancho_personalizacao || '';

    const mapa: Record<string, string> = {
      primeiro_nome: primeiroNome || `equipe da ${escolaSelecionada.nome}`,
      escola: escolaSelecionada.nome,
      cidade: escolaSelecionada.cidade || 'Brasília',
      cargo: escolaSelecionada.primeiroContatoCargo || 'Direção Pedagógica',
      gancho: gancho,
      link_agenda: linkAgenda,
      remetente: remetente,
    };

    let ass = assuntoTemplate;
    let cor = corpoTemplate;

    for (const [chave, valor] of Object.entries(mapa)) {
      const reg = new RegExp(`\\{\\{${chave}\\}\\}`, 'gi');
      ass = ass.replace(reg, valor);
      cor = cor.replace(reg, valor);
    }

    const erros: string[] = [];

    // Checa variáveis não resolvidas
    const naoResolvidasAssunto = ass.match(/\{\{([^}]+)\}\}/g);
    const naoResolvidasCorpo = cor.match(/\{\{([^}]+)\}\}/g);
    if (naoResolvidasAssunto || naoResolvidasCorpo) {
      erros.push(
        `Variáveis não preenchidas: ${[
          ...(naoResolvidasAssunto || []),
          ...(naoResolvidasCorpo || []),
        ].join(', ')}`
      );
    }

    // Checa marcadores de colchetes
    const marcadores = (ass + '\n' + cor).match(/\[[A-Z0-9_\s-]{3,}\]/g);
    if (marcadores) {
      erros.push(`Marcadores não substituídos: ${marcadores.join(', ')}`);
    }

    // Checa se gancho estava vazio no passo 1
    if (passoAtual?.ordem === 1 && !gancho) {
      erros.push('Gancho de personalização da escola está vazio (o toque 1 ficará genérico).');
    }

    const limitePalavras = passoAtual?.ordem === 1 ? 90 : 60;
    const totalPalavras = contarPalavras(cor);
    if (totalPalavras > limitePalavras) {
      erros.push(
        `Limite de concisão excedido: ${totalPalavras} palavras (máximo permitido: ${limitePalavras} palavras).`
      );
    }

    return {
      assunto: ass,
      corpo: cor,
      erros,
      totalPalavras,
      limitePalavras,
    };
  }, [escolaSelecionada, assuntoTemplate, corpoTemplate, passoAtual?.ordem]);

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
              <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                <ListOrdered className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                  Sequência Padrão de E-mails
                </h1>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Cadência de 5 toques em 14 dias com janelas comerciais de Brasília e personalização
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/fila"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition"
            >
              <span>Ver Fila de Envios</span>
              {initialMetricas.aguardandoAprovacao > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono font-bold">
                  {initialMetricas.aguardandoAprovacao}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Métricas da Sequência */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Inscritos</span>
            <div className="text-xl font-bold text-slate-900 dark:text-neutral-100">
              {initialMetricas.totalInscritos}
            </div>
            <span className="text-[10px] text-slate-400">Escolas no funil</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Disparos</span>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {initialMetricas.totalEnviados}
            </div>
            <span className="text-[10px] text-slate-400">E-mails entregues</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Respostas</span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {initialMetricas.totalRespostas}
            </div>
            <span className="text-[10px] text-slate-400">Engajamentos</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Reuniões</span>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
              {initialMetricas.totalReunioes}
            </div>
            <span className="text-[10px] text-slate-400">Agendamentos</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/80 dark:border-neutral-800 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Na Fila</span>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {initialMetricas.aguardandoAprovacao}
            </div>
            <span className="text-[10px] text-slate-400">Aguardando aprovação</span>
          </div>
        </div>

        {/* Card de Configuração do Modo de Aprovação */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-neutral-800/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-neutral-100">
                Modo de Aprovação Obrigatório
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  sequencia?.modo_aprovacao
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {sequencia?.modo_aprovacao ? 'Ativado (Fila Requer Aprovação)' : 'Desativado (Envio Direto)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
              Quando ativado, os e-mails gerados pela sequência aguardam sua revisão e aprovação na aba{' '}
              <strong>Fila de Envios</strong> antes de serem disparados pela API Brevo. Quando desativado, os e-mails saem de forma 100% autônoma nas janelas comerciais.
            </p>
          </div>

          <button
            onClick={handleToggleModoAprovacao}
            disabled={isTogglingModo}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 shrink-0 ${
              sequencia?.modo_aprovacao
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-300'
            }`}
          >
            {isTogglingModo
              ? 'Salvando...'
              : sequencia?.modo_aprovacao
              ? 'Desativar Modo de Aprovação'
              : 'Ativar Modo de Aprovação'}
          </button>
        </div>

        {/* Seleção do Passo a Editar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-neutral-100 uppercase tracking-wider">
              Passos da Cadência (5 Toques)
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Escola para Prévia:</span>
              <select
                value={escolaPreviewId}
                onChange={(e) => setEscolaPreviewId(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold"
              >
                {escolasPreview.map((esc) => (
                  <option key={esc.id} value={esc.id}>
                    {esc.nome} ({esc.cidade || 'DF'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stepper Tabs */}
          <div className="grid grid-cols-5 gap-2">
            {passos.map((p) => (
              <button
                key={p.id}
                onClick={() => selecionarPasso(p)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  passoAtual?.id === p.id
                    ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500/80 shadow-xs ring-1 ring-blue-500/30'
                    : 'bg-white dark:bg-[#121215] border-slate-200/80 dark:border-neutral-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-neutral-100">
                    Toque {p.ordem}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    +{p.dias_apos_anterior}d
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-neutral-400 truncate mt-0.5">
                  {p.tipo === 'email_novo'
                    ? 'Novo (Gancho)'
                    : p.tipo === 'email_outro_contato'
                    ? 'Multithread'
                    : 'Resposta'}
                </div>
              </button>
            ))}
          </div>

          {/* Grid: Editor do Passo (Esquerda) + Prévia em Tempo Real (Direita) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Editor do Passo */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-neutral-800/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-100">
                    Editor do Toque {passoAtual?.ordem}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Tipo: <span className="font-mono text-slate-600 dark:text-neutral-300">{passoAtual?.tipo}</span>
                  </p>
                </div>

                <button
                  onClick={handleSalvarPasso}
                  disabled={savingPassoId === passoAtual?.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingPassoId === passoAtual?.id ? 'Salvando...' : 'Salvar Passo'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-neutral-300 block mb-1">
                    Dias após o passo anterior
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={diasApos}
                    onChange={(e) => setDiasApos(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 font-mono text-xs"
                  />
                </div>

                <div className="flex items-center gap-3 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={(e) => setAtivo(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Passo Ativo</span>
                  </label>

                  {passoAtual?.ordem === 1 && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-neutral-300">
                      <input
                        type="checkbox"
                        checked={usarIa}
                        onChange={(e) => setUsarIa(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-500" />
                        Reescrever gancho com IA
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="text-xs space-y-1">
                <label className="font-bold text-slate-700 dark:text-neutral-300 block">
                  Template do Assunto
                </label>
                <input
                  type="text"
                  value={assuntoTemplate}
                  onChange={(e) => setAssuntoTemplate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 font-sans text-xs"
                />
              </div>

              <div className="text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-neutral-300 block">
                    Template do Corpo
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Variáveis: &#123;&#123;primeiro_nome&#125;&#125;, &#123;&#123;escola&#125;&#125;, &#123;&#123;cidade&#125;&#125;, &#123;&#123;cargo&#125;&#125;, &#123;&#123;gancho&#125;&#125;, &#123;&#123;link_agenda&#125;&#125;, &#123;&#123;remetente&#125;&#125;
                  </span>
                </div>
                <textarea
                  rows={10}
                  value={corpoTemplate}
                  onChange={(e) => setCorpoTemplate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 font-sans text-xs resize-y leading-relaxed"
                />
              </div>
            </div>

            {/* Painel de Prévia em Tempo Real com Escola Real */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-neutral-800/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-100">
                    Prévia em Tempo Real
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                      preview.totalPalavras <= preview.limitePalavras
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {preview.totalPalavras} / {preview.limitePalavras} palavras
                  </span>
                </div>
              </div>

              {/* Alertas de Validação */}
              {preview.erros.length > 0 ? (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-1.5 text-xs text-rose-800 dark:text-rose-300">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Bloqueios de Envio Detectados:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
                    {preview.erros.map((erro, idx) => (
                      <li key={idx}>{erro}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Template perfeitamente resolvido para a escola selecionada.</span>
                </div>
              )}

              {/* Renderização do E-mail */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/80 dark:border-neutral-800 space-y-3 font-sans text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">Assunto Final</span>
                  <span className="font-bold text-slate-900 dark:text-neutral-100 text-sm">
                    {preview.assunto}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-neutral-800/80">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">Corpo Final</span>
                  <div className="text-slate-700 dark:text-neutral-200 whitespace-pre-line leading-relaxed text-xs">
                    {preview.corpo}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
