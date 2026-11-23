'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  ArrowLeft,
  Flame,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Save,
  ShieldCheck,
  Calendar,
  FileCode,
} from 'lucide-react';
import {
  CaixaEnvioComLimite,
  salvarCaixaEnvioAction,
  enviarEmailTesteAction,
} from '@/actions/email-config';

interface EmailConfigClientProps {
  initialCaixas: CaixaEnvioComLimite[];
  userEmail: string | null;
}

export default function EmailConfigClient({
  initialCaixas,
  userEmail,
}: EmailConfigClientProps) {
  const [caixas, setCaixas] = useState<CaixaEnvioComLimite[]>(initialCaixas);
  const [selecionadaId, setSelecionadaId] = useState<string>(
    initialCaixas[0]?.id || ''
  );

  const caixaAtual = caixas.find((c) => c.id === selecionadaId) || caixas[0];

  // Estado do formulário de edição da caixa
  const [nomeRemetente, setNomeRemetente] = useState(
    caixaAtual?.nome_remetente || 'Bruno - Littera'
  );
  const [ativo, setAtivo] = useState(caixaAtual?.ativo ?? true);
  const [aquecimentoInicio, setAquecimentoInicio] = useState(
    caixaAtual?.aquecimento_inicio || new Date().toISOString().split('T')[0]
  );
  const [limiteInicial, setLimiteInicial] = useState(
    caixaAtual?.limite_diario_inicial ?? 10
  );
  const [incrementoSemanal, setIncrementoSemanal] = useState(
    caixaAtual?.incremento_semanal ?? 5
  );
  const [limiteMaximo, setLimiteMaximo] = useState(
    caixaAtual?.limite_diario_maximo ?? 50
  );
  const [assinaturaHtml, setAssinaturaHtml] = useState(
    caixaAtual?.assinatura_html || ''
  );
  const [mostrarPreviewAssinatura, setMostrarPreviewAssinatura] = useState(false);

  // Estados de feedback de salvamento
  const [salvando, setSalvando] = useState(false);
  const [mensagemSalvo, setMensagemSalvo] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  // Estados de envio de teste
  const [emailTeste, setEmailTeste] = useState(
    userEmail || 'bruno.pinho.brasilia@gmail.com'
  );
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{
    sucesso: boolean;
    provedorMessageId?: string;
    rfcMessageId?: string;
    provedorThreadId?: string;
    caixaEmail?: string;
    erro?: string;
  } | null>(null);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caixaAtual) return;

    setSalvando(true);
    setMensagemSalvo(null);

    try {
      const res = await salvarCaixaEnvioAction(caixaAtual.id, {
        nome_remetente: nomeRemetente,
        ativo,
        aquecimento_inicio: aquecimentoInicio,
        limite_diario_inicial: Number(limiteInicial),
        incremento_semanal: Number(incrementoSemanal),
        limite_diario_maximo: Number(limiteMaximo),
        assinatura_html: assinaturaHtml,
      });

      if (res.success) {
        setMensagemSalvo({
          tipo: 'sucesso',
          texto: 'Configurações da caixa de envio salvas com sucesso!',
        });
        setCaixas((prev) =>
          prev.map((c) =>
            c.id === caixaAtual.id
              ? {
                  ...c,
                  nome_remetente: nomeRemetente,
                  ativo,
                  aquecimento_inicio: aquecimentoInicio,
                  limite_diario_inicial: Number(limiteInicial),
                  incremento_semanal: Number(incrementoSemanal),
                  limite_diario_maximo: Number(limiteMaximo),
                  assinatura_html: assinaturaHtml,
                }
              : c
          )
        );
      } else {
        setMensagemSalvo({
          tipo: 'erro',
          texto: res.error || 'Erro ao salvar alterações.',
        });
      }
    } catch (err: unknown) {
      setMensagemSalvo({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Falha na comunicação com o servidor.',
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleEnviarTeste = async () => {
    if (!emailTeste || !emailTeste.includes('@')) {
      alert('Por favor, informe um endereço de e-mail de destino válido.');
      return;
    }

    setEnviandoTeste(true);
    setResultadoTeste(null);

    try {
      const res = await enviarEmailTesteAction({
        caixaId: caixaAtual?.id,
        emailDestino: emailTeste,
      });

      if (res.success) {
        setResultadoTeste({
          sucesso: true,
          provedorMessageId: res.provedorMessageId,
          rfcMessageId: res.rfcMessageId,
          provedorThreadId: res.provedorThreadId,
          caixaEmail: res.caixaEmail,
        });
      } else {
        setResultadoTeste({
          sucesso: false,
          erro: res.error || 'Falha ao disparar e-mail de teste.',
        });
      }
    } catch (err: unknown) {
      setResultadoTeste({
        sucesso: false,
        erro: err instanceof Error ? err.message : 'Falha na execução do envio.',
      });
    } finally {
      setEnviandoTeste(false);
    }
  };

  const limiteHoje = caixaAtual?.limiteCalculado.limiteHoje ?? 10;
  const enviadosHoje = caixaAtual?.limiteCalculado.enviadosHojeEfetivo ?? 0;
  const porcentagem = Math.min(100, Math.round((enviadosHoje / Math.max(1, limiteHoje)) * 100));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-800 dark:text-neutral-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-neutral-800">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition shadow-xs"
                title="Voltar ao CRM"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-neutral-100">
                    Infraestrutura de Envio &amp; Entregabilidade
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    Brevo API &bull; Domínio grupolittera.com.br &bull; Plano de Aquecimento Diário
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {caixas.length > 1 && (
              <select
                value={selecionadaId}
                onChange={(e) => setSelecionadaId(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-semibold bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 shadow-xs"
              >
                {caixas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email}
                  </option>
                ))}
              </select>
            )}
            <Link
              href="/configuracoes/score"
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900 transition"
            >
              Configurar Score
            </Link>
          </div>
        </div>

        {/* Resumo e Status da Caixa de Envio */}
        {caixaAtual && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Identificação da Caixa */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">
                  Caixa de Prospecção
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    ativo
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                  }`}
                >
                  {ativo ? 'Ativa' : 'Pausada'}
                </span>
              </div>
              <div>
                <p className="font-mono text-base font-bold text-slate-900 dark:text-neutral-100">
                  {caixaAtual.email}
                </p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Remetente: <strong className="text-slate-700 dark:text-neutral-300">{nomeRemetente}</strong>
                </p>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                Respostas encaminhadas via ImprovMX para o Gmail pessoal
              </p>
            </div>

            {/* Card 2: Aquecimento e Limites de Hoje */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500" />
                  Limite Hoje
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-neutral-400">
                  Semana {caixaAtual.limiteCalculado.semanas} de aquecimento
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-neutral-100">
                  {enviadosHoje}
                </span>
                <span className="text-sm font-semibold text-slate-400">
                  / {limiteHoje} e-mails
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${porcentagem}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                Disponível para disparos hoje:{' '}
                <strong className="text-slate-800 dark:text-neutral-200">
                  {caixaAtual.limiteCalculado.disponivelHoje} envio(s)
                </strong>
              </p>
            </div>

            {/* Card 3: Regras de Segurança */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Segurança &amp; Rastreamento
              </div>
              <ul className="text-xs text-slate-600 dark:text-neutral-400 space-y-1.5 pt-1">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>List-Unsubscribe One-Click habilitado</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>RFC Message-ID único por disparo</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Bloqueio estrito de opt-out (descadastros)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Teto máximo de 50/dia por caixa</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Card de Teste de Entregabilidade (SPF/DKIM/DMARC) */}
        <div className="p-6 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Enviar E-mail de Teste Real
              </h2>
              <p className="text-xs text-slate-600 dark:text-neutral-400">
                Dispara uma mensagem de validação pelo Brevo API com todos os cabeçalhos para validar SPF, DKIM e DMARC no Gmail.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <label htmlFor="input-email-teste" className="sr-only">E-mail de Teste</label>
              <input
                id="input-email-teste"
                type="email"
                value={emailTeste}
                onChange={(e) => setEmailTeste(e.target.value)}
                placeholder="Seu e-mail (ex: bruno.pinho.brasilia@gmail.com)"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
              />
            </div>
            <button
              type="button"
              onClick={handleEnviarTeste}
              disabled={enviandoTeste}
              className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer"
            >
              {enviandoTeste ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Disparando via Brevo...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar e-mail de teste para mim</span>
                </>
              )}
            </button>
          </div>

          {resultadoTeste && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                resultadoTeste.sucesso
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
              }`}
            >
              {resultadoTeste.sucesso ? (
                <>
                  <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>E-mail de teste enviado com sucesso via Brevo API!</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px] bg-white/60 dark:bg-neutral-900/60 p-2.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40">
                    <div>
                      <span className="text-slate-500 dark:text-neutral-400 block font-sans text-[10px]">
                        Provedor Message-ID:
                      </span>
                      <span className="break-all">{resultadoTeste.provedorMessageId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-neutral-400 block font-sans text-[10px]">
                        RFC Message-ID:
                      </span>
                      <span className="break-all">{resultadoTeste.rfcMessageId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-neutral-400 block font-sans text-[10px]">
                        Provedor Thread-ID:
                      </span>
                      <span className="break-all">{resultadoTeste.provedorThreadId}</span>
                    </div>
                  </div>
                  <div className="pt-2 text-[11px] text-emerald-950 dark:text-emerald-100 space-y-1">
                    <p className="font-semibold">Como conferir a entregabilidade agora no seu Gmail:</p>
                    <ol className="list-decimal pl-5 space-y-0.5">
                      <li>Abra a mensagem recebida na sua caixa de entrada do Gmail.</li>
                      <li>Clique nos <strong>três pontinhos</strong> (Mais opções) no canto superior direito.</li>
                      <li>Selecione <strong>&quot;Mostrar original&quot;</strong>.</li>
                      <li>
                        Verifique se aparecem os selos verdes: <code>SPF: PASS</code>, <code>DKIM: PASS</code> (com grupolittera.com.br) e <code>DMARC: PASS</code>.
                      </li>
                    </ol>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold">Erro no envio: </span>
                    <span>{resultadoTeste.erro}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Formulário de Configuração da Caixa */}
        {caixaAtual && (
          <form
            onSubmit={handleSalvar}
            className="p-6 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                  Parâmetros de Operação &amp; Assinatura
                </h2>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Ajuste os parâmetros de aquecimento gradual e identidade do remetente
                </p>
              </div>

              {/* Toggle Ativo / Pausado */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                  Status da Caixa:
                </span>
                <button
                  type="button"
                  onClick={() => setAtivo(!ativo)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-neutral-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      ativo ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs font-bold text-slate-600 dark:text-neutral-300">
                  {ativo ? 'Ativa' : 'Pausada'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Nome do Remetente */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                  Nome do Remetente (From Header)
                </label>
                <input
                  type="text"
                  value={nomeRemetente}
                  onChange={(e) => setNomeRemetente(e.target.value)}
                  placeholder="Ex: Bruno - Littera"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 text-xs text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400">
                  Aparecerá como <code>&quot;{nomeRemetente}&quot; &lt;{caixaAtual.email}&gt;</code>
                </p>
              </div>

              {/* Data Início Aquecimento */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Data de Início do Aquecimento
                </label>
                <input
                  type="date"
                  value={aquecimentoInicio}
                  onChange={(e) => setAquecimentoInicio(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 text-xs text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400">
                  Utilizada para calcular as semanas transcorridas de aquecimento
                </p>
              </div>

              {/* Limite Diário Inicial */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                  Limite Diário Inicial (Semana 0)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={limiteInicial}
                  onChange={(e) => setLimiteInicial(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 text-xs text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400">Padrão seguro: 10 disparos/dia</p>
              </div>

              {/* Incremento Semanal */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                  Incremento Semanal
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={incrementoSemanal}
                  onChange={(e) => setIncrementoSemanal(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 text-xs text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400">+5 e-mails adicionados a cada 7 dias</p>
              </div>

              {/* Limite Máximo Diário */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                  Limite Diário Máximo (Teto Estrito)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={limiteMaximo}
                  onChange={(e) => setLimiteMaximo(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 text-xs text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400">
                  Teto máximo recomendado: 50/dia por caixa para manter reputação impecável
                </p>
              </div>

              {/* Assinatura HTML */}
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    Assinatura HTML (opcional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setMostrarPreviewAssinatura(!mostrarPreviewAssinatura)}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {mostrarPreviewAssinatura ? 'Esconder Preview' : 'Ver Preview da Assinatura'}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={assinaturaHtml}
                  onChange={(e) => setAssinaturaHtml(e.target.value)}
                  placeholder="<p>Atenciosamente,<br><strong>Bruno Pinho</strong><br>Littera Educacional</p>"
                  className="w-full font-mono text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 text-slate-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {mostrarPreviewAssinatura && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60 text-xs">
                    <p className="font-semibold text-slate-500 text-[10px] uppercase mb-2">
                      Preview Renderizado:
                    </p>
                    <div
                      className="text-slate-800 dark:text-neutral-200"
                      dangerouslySetInnerHTML={{ __html: assinaturaHtml || '<p><em>Nenhuma assinatura configurada.</em></p>' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {mensagemSalvo && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  mensagemSalvo.tipo === 'sucesso'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                }`}
              >
                {mensagemSalvo.tipo === 'sucesso' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{mensagemSalvo.texto}</span>
              </div>
            )}

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={salvando}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-neutral-100 hover:bg-slate-800 dark:hover:bg-neutral-200 disabled:opacity-50 text-white dark:text-neutral-900 shadow-sm transition cursor-pointer"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Links de Documentação e Apoio */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-400">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Consulte o guia completo de DNS, SPF, DKIM e plano de aquecimento na documentação.</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 font-mono">
            docs/entregabilidade.md
          </span>
        </div>
      </div>
    </div>
  );
}
