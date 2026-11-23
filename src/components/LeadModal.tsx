'use client';

import React, { useState, useEffect } from 'react';
import { EscolaComContatos, Contato, StatusFunil, TipoContato, EmailStatus } from '@/types/database';
import { 
  X, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Star, 
  Globe, 
  FileText,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  Award,
  Sliders,
  CheckCircle2,
  XCircle,
  Sparkles,
  ListOrdered,
  Play,
  Pause,
  Square,
  Clock
} from 'lucide-react';
import { 
  addContatoAction, 
  deleteContatoAction, 
  setContatoPrincipalAction,
  verificarEmailAction
} from '@/actions/leads';
import {
  getInscricaoDaEscolaAction,
  iniciarSequencia,
  pausarInscricaoAction,
  retomarInscricaoAction,
  encerrarInscricaoAction
} from '@/actions/sequencias';
import { SequenciaPasso, FilaEnvio } from '@/types/database';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (escolaData: any) => Promise<void>;
  lead?: EscolaComContatos | null;
  mode: 'create' | 'edit';
}

function EmailStatusBadge({ 
  status, 
  verificadoEm,
  onVerificar,
  isVerificando
}: { 
  status?: EmailStatus; 
  verificadoEm?: string | null;
  onVerificar?: () => void;
  isVerificando?: boolean;
}) {
  const dataFormatada = verificadoEm 
    ? new Date(verificadoEm).toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : null;
  const tooltipText = dataFormatada 
    ? `Verificado em: ${dataFormatada}` 
    : 'Não verificado';

  let badgeContent = null;
  switch (status) {
    case 'valido':
      badgeContent = (
        <span 
          title={tooltipText}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-help"
        >
          <ShieldCheck className="w-2.5 h-2.5" />
          Válido
        </span>
      );
      break;
    case 'invalido':
      badgeContent = (
        <span 
          title={tooltipText}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-help"
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          Inválido
        </span>
      );
      break;
    case 'arriscado':
    case 'catch_all':
      badgeContent = (
        <span 
          title={tooltipText}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 cursor-help"
        >
          <ShieldAlert className="w-2.5 h-2.5" />
          {status === 'catch_all' ? 'Catch-all' : 'Arriscado'}
        </span>
      );
      break;
    default:
      badgeContent = (
        <span 
          title={tooltipText}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700 cursor-help"
        >
          <HelpCircle className="w-2.5 h-2.5" />
          Não verificado
        </span>
      );
      break;
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      {badgeContent}
      {onVerificar && (
        <button
          type="button"
          onClick={onVerificar}
          disabled={isVerificando}
          className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline px-1.5 py-0.5 rounded bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 disabled:opacity-50 cursor-pointer"
          title="Verificar validade deste e-mail agora"
        >
          {isVerificando ? 'Verificando...' : 'Verificar agora'}
        </button>
      )}
    </div>
  );
}

export default function LeadModal({
  isOpen,
  onClose,
  onSave,
  lead,
  mode,
}: LeadModalProps) {
  const [formData, setFormData] = useState({
    nome: '',
    cidade: 'Brasília',
    uf: 'DF',
    telefone: '',
    email_geral: '',
    cnpj: '',
    codigo_inep: '',
    site: '',
    status_funil: 'novo' as StatusFunil,
    // Dados de contato inicial se mode === 'create'
    contato_nome: '',
    contato_email: '',
    contato_cargo: '',
    contato_telefone: '',
  });

  const [contatosList, setContatosList] = useState<Contato[]>([]);
  const [isAddingContato, setIsAddingContato] = useState(false);
  const [newContato, setNewContato] = useState({
    nome: '',
    cargo: '',
    tipo: 'outro' as TipoContato,
    email: '',
    telefone: '',
    linkedin_url: '',
    principal: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'contatos' | 'score' | 'sequencia'>('dados');
  const [verificandoId, setVerificandoId] = useState<string | null>(null);
  const [emailGeralStatus, setEmailGeralStatus] = useState<EmailStatus | undefined>(lead?.email_geral_status);
  const [emailGeralVerificadoEm, setEmailGeralVerificadoEm] = useState<string | null | undefined>(lead?.email_geral_verificado_em);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inscricaoData, setInscricaoData] = useState<{ inscricao: any; passos: SequenciaPasso[]; fila: FilaEnvio[] } | null>(null);
  const [isLoadingSequencia, setIsLoadingSequencia] = useState(false);
  const [isSequenciaActionLoading, setIsSequenciaActionLoading] = useState(false);

  const [prevTrack, setPrevTrack] = useState<{ lead?: EscolaComContatos | null; mode: string; isOpen: boolean }>({
    lead,
    mode,
    isOpen,
  });

  if (prevTrack.lead !== lead || prevTrack.mode !== mode || prevTrack.isOpen !== isOpen) {
    setPrevTrack({ lead, mode, isOpen });
    setEmailGeralStatus(lead?.email_geral_status);
    setEmailGeralVerificadoEm(lead?.email_geral_verificado_em);
    if (lead && mode === 'edit') {
      setFormData({
        nome: lead.nome || '',
        cidade: lead.cidade || 'Brasília',
        uf: lead.uf || 'DF',
        telefone: lead.telefone || '',
        email_geral: lead.email_geral || '',
        cnpj: lead.cnpj || '',
        codigo_inep: lead.codigo_inep || '',
        site: lead.site || '',
        status_funil: lead.status_funil || 'novo',
        contato_nome: '',
        contato_email: '',
        contato_cargo: '',
        contato_telefone: '',
      });
      setContatosList(lead.contatos || []);
    } else {
      setFormData({
        nome: '',
        cidade: 'Brasília',
        uf: 'DF',
        telefone: '',
        email_geral: '',
        cnpj: '',
        codigo_inep: '',
        site: '',
        status_funil: 'novo',
        contato_nome: '',
        contato_email: '',
        contato_cargo: '',
        contato_telefone: '',
      });
      setContatosList([]);
    }
    setIsAddingContato(false);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const recarregarSequencia = async () => {
    if (!lead?.id) return;
    setIsLoadingSequencia(true);
    try {
      const data = await getInscricaoDaEscolaAction(lead.id);
      setInscricaoData(data);
    } catch (err) {
      console.error('Erro ao buscar dados da sequência no modal:', err);
    } finally {
      setIsLoadingSequencia(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (isOpen && lead?.id) {
      getInscricaoDaEscolaAction(lead.id)
        .then((data) => {
          if (isMounted) {
            setInscricaoData(data);
          }
        })
        .catch((err) => {
          console.error('Erro ao buscar dados da sequência no modal:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, lead?.id]);

  const handlePausarSequencia = async (inscricaoId: string) => {
    setIsSequenciaActionLoading(true);
    const res = await pausarInscricaoAction(inscricaoId);
    if (res.success) {
      await recarregarSequencia();
    } else {
      alert(`Erro ao pausar: ${res.error}`);
    }
    setIsSequenciaActionLoading(false);
  };

  const handleRetomarSequencia = async (inscricaoId: string) => {
    setIsSequenciaActionLoading(true);
    const res = await retomarInscricaoAction(inscricaoId);
    if (res.success) {
      await recarregarSequencia();
    } else {
      alert(`Erro ao retomar: ${res.error}`);
    }
    setIsSequenciaActionLoading(false);
  };

  const handleEncerrarSequencia = async (inscricaoId: string) => {
    if (!confirm('Deseja realmente encerrar a sequência desta escola definitivamente?')) return;
    setIsSequenciaActionLoading(true);
    const res = await encerrarInscricaoAction(inscricaoId);
    if (res.success) {
      await recarregarSequencia();
    } else {
      alert(`Erro ao encerrar: ${res.error}`);
    }
    setIsSequenciaActionLoading(false);
  };

  const handleIniciarSequenciaNoModal = async () => {
    if (!lead?.id) return;
    setIsSequenciaActionLoading(true);
    const res = await iniciarSequencia(lead.id);
    if (res.success) {
      alert('Escola inscrita na sequência com sucesso!');
      await recarregarSequencia();
    } else {
      alert(`Não foi possível iniciar a sequência: ${res.error}`);
    }
    setIsSequenciaActionLoading(false);
  };

  const handleVerificarEmail = async (tipo: 'contato' | 'escola', id: string, email: string) => {
    if (!email || !email.trim()) return;
    setVerificandoId(id);
    try {
      const res = await verificarEmailAction({ tipo, id, email });
      if (res.success && res.status) {
        if (tipo === 'contato') {
          setContatosList((prev) =>
            prev.map((c) =>
              c.id === id
                ? {
                    ...c,
                    email_status: res.status!,
                    email_verificado_em: res.verificado_em || new Date().toISOString(),
                  }
                : c
            )
          );
        } else {
          setEmailGeralStatus(res.status);
          setEmailGeralVerificadoEm(res.verificado_em || new Date().toISOString());
        }
      } else {
        alert(res.error || 'Erro ao verificar e-mail');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao verificar e-mail');
    } finally {
      setVerificandoId(null);
    }
  };

  if (!isOpen) return null;

  const handleSubmitEscola = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        id: lead?.id,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddContato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead?.id || !newContato.nome.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await addContatoAction(lead.id, {
        ...newContato,
        fonte: 'manual',
      });
      if (res.success && res.data) {
        if (newContato.principal) {
          setContatosList((prev) =>
            [...prev.map((c) => ({ ...c, principal: false })), res.data!]
          );
        } else {
          setContatosList((prev) => [...prev, res.data!]);
        }
        setNewContato({
          nome: '',
          cargo: '',
          tipo: 'outro',
          email: '',
          telefone: '',
          linkedin_url: '',
          principal: false,
        });
        setIsAddingContato(false);
      } else {
        alert(res.error || 'Erro ao adicionar contato');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPrincipal = async (contatoId: string) => {
    if (!lead?.id) return;
    const res = await setContatoPrincipalAction(lead.id, contatoId);
    if (res.success) {
      setContatosList((prev) =>
        prev.map((c) => ({
          ...c,
          principal: c.id === contatoId,
        }))
      );
    } else {
      alert(res.error || 'Erro ao definir principal');
    }
  };

  const handleDeleteContato = async (contatoId: string) => {
    if (!confirm('Excluir este contato?')) return;
    const res = await deleteContatoAction(contatoId);
    if (res.success) {
      setContatosList((prev) => prev.filter((c) => c.id !== contatoId));
    } else {
      alert(res.error || 'Erro ao excluir contato');
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                  {mode === 'create' ? 'Cadastrar Nova Escola' : (lead?.nome || 'Editar Escola & Decisores')}
                </h2>
                {lead?.site && (
                  <a
                    href={lead.site}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:underline border border-blue-100 dark:border-blue-900/50"
                  >
                    <Globe className="w-3 h-3" />
                    <span>Visitar Site</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                {lead?.google_rating && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/50">
                    <Star className="w-3 h-3 fill-current text-amber-500" />
                    <span>{Number(lead.google_rating).toFixed(1)}</span>
                    {lead.google_avaliacoes && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                        ({lead.google_avaliacoes} avaliações)
                      </span>
                    )}
                  </span>
                )}
                {lead?.precisa_revisao && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <AlertTriangle className="w-3 h-3" />
                    Revisar
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-neutral-500">
                {mode === 'create'
                  ? 'Preencha os dados reais da instituição e dos contatos'
                  : 'Gerencie os dados institucionais e a lista de decisores da escola'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alerta de Revisão se ativo */}
        {lead?.precisa_revisao && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-bold">Atenção para revisão cadastral: </span>
              {lead.observacao_revisao || 'Este lead teve dados genéricos ou e-mails automáticos removidos e requer validação manual.'}
            </div>
          </div>
        )}

        {/* Tabs de navegação quando em modo edição */}
        {mode === 'edit' && (
          <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-100 dark:border-neutral-800 bg-white dark:bg-[#18181b]">
            <button
              type="button"
              onClick={() => setActiveTab('dados')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition ${
                activeTab === 'dados'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-neutral-300'
              }`}
            >
              Dados da Escola
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contatos')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'contatos'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-neutral-300'
              }`}
            >
              <span>Decisores & Contatos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                {contatosList.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('score')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'score'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-neutral-300'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Score & Qualificação</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                (lead?.score ?? 0) >= 60 
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                  : (lead?.score ?? 0) >= 30 
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300' 
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400'
              }`}>
                {lead?.score ?? 0} pts
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sequencia')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'sequencia'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-neutral-300'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Sequência de E-mails</span>
              {inscricaoData?.inscricao ? (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  inscricaoData.inscricao.status === 'ativa'
                    ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300'
                    : inscricaoData.inscricao.status === 'pausada'
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400'
                }`}>
                  {inscricaoData.inscricao.status === 'ativa'
                    ? `Toque ${inscricaoData.inscricao.passo_atual}/5`
                    : inscricaoData.inscricao.status}
                </span>
              ) : null}
            </button>
          </div>
        )}

        {/* Conteúdo do Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'dados' ? (
            <form id="escola-form" onSubmit={handleSubmitEscola} className="space-y-4">
              {/* Resumo e Gancho de Personalização SDR (Claude) */}
              {(lead?.resumo_pesquisa || lead?.gancho_personalizacao) && (
                <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Pesquisa & Personalização SDR
                    </span>
                    {lead.entregue_em && (
                      <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-mono">
                        Entregue em: {new Date(lead.entregue_em).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  {lead.resumo_pesquisa && (
                    <div className="text-xs text-indigo-950 dark:text-indigo-200">
                      <span className="font-semibold block text-[11px] text-indigo-700 dark:text-indigo-300 mb-0.5">
                        Resumo da Instituição:
                      </span>
                      <p className="leading-relaxed">{lead.resumo_pesquisa}</p>
                    </div>
                  )}

                  {lead.gancho_personalizacao && (
                    <div className="text-xs text-indigo-950 dark:text-indigo-200">
                      <span className="font-semibold block text-[11px] text-indigo-700 dark:text-indigo-300 mb-0.5">
                        Gancho de Abertura (Personalização de E-mail):
                      </span>
                      <p className="italic bg-white/70 dark:bg-black/30 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40 leading-relaxed">
                        &ldquo;{lead.gancho_personalizacao}&rdquo;
                      </p>
                    </div>
                  )}

                  {lead.fontes_pesquisa && lead.fontes_pesquisa.length > 0 && (
                    <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/40">
                      <span className="font-semibold text-[10px] text-indigo-700 dark:text-indigo-300 block mb-1">
                        Fontes Auditadas:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {lead.fontes_pesquisa.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline max-w-[320px] truncate"
                          >
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{url}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome da Escola */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Nome da Escola / Instituição *</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Colégio Sigma Asa Sul"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>

                {/* Cidade */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Cidade *</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Brasília"
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>

                {/* UF */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                    <span>UF *</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="DF"
                    value={formData.uf}
                    onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition uppercase"
                  />
                </div>

                {/* Telefone Geral */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Telefone Institucional</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: (61) 3345-0000"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>

                {/* E-mail Geral */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>E-mail Geral da Escola</span>
                    </label>
                    {lead?.id && formData.email_geral && (
                      <EmailStatusBadge 
                        status={emailGeralStatus || 'nao_verificado'} 
                        verificadoEm={emailGeralVerificadoEm}
                        onVerificar={() => handleVerificarEmail('escola', lead.id, formData.email_geral)}
                        isVerificando={verificandoId === lead.id}
                      />
                    )}
                  </div>
                  <input
                    type="email"
                    placeholder="Ex: secretaria@colegio.com.br"
                    value={formData.email_geral}
                    onChange={(e) => {
                      setFormData({ ...formData, email_geral: e.target.value });
                      setEmailGeralStatus('nao_verificado');
                      setEmailGeralVerificadoEm(null);
                    }}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>

                {/* CNPJ */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>CNPJ</span>
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-mono"
                  />
                </div>

                {/* Código INEP */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                    <span>Código INEP</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 53001234"
                    value={formData.codigo_inep}
                    onChange={(e) => setFormData({ ...formData, codigo_inep: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-mono"
                  />
                </div>

                {/* Site */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>Site Institucional</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.site}
                    onChange={(e) => setFormData({ ...formData, site: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>

                {/* Status do Funil */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                    <span>Status no Funil</span>
                  </label>
                  <select
                    value={formData.status_funil}
                    onChange={(e) => setFormData({ ...formData, status_funil: e.target.value as StatusFunil })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="novo">Novo</option>
                    <option value="em_sequencia">Em sequência</option>
                    <option value="contato_enviado">Contato Enviado</option>
                    <option value="respondido">Respondido</option>
                    <option value="reuniao_agendada">Reunião Agendada</option>
                    <option value="sem_interesse">Sem Interesse</option>
                    <option value="descadastrado">Descadastrado</option>
                  </select>
                </div>
              </div>

              {/* Se for modo create, permite adicionar o decisor inicial */}
              {mode === 'create' && (
                <div className="pt-4 border-t border-slate-100 dark:border-neutral-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>Decisor Principal (Opcional)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Nome do Diretor / Coordenador"
                      value={formData.contato_nome}
                      onChange={(e) => setFormData({ ...formData, contato_nome: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                    <input
                      type="text"
                      placeholder="Cargo (ex: Diretor Geral)"
                      value={formData.contato_cargo}
                      onChange={(e) => setFormData({ ...formData, contato_cargo: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                    <input
                      type="email"
                      placeholder="E-mail direto do decisor"
                      value={formData.contato_email}
                      onChange={(e) => setFormData({ ...formData, contato_email: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                    <input
                      type="text"
                      placeholder="WhatsApp direto (com DDD)"
                      value={formData.contato_telefone}
                      onChange={(e) => setFormData({ ...formData, contato_telefone: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              )}
            </form>
          ) : (
            /* Tab de Decisores & Contatos */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-neutral-100">
                    Decisores Mapeados ({contatosList.length})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Defina o contato principal que receberá a cadência automática de e-mails.
                  </p>
                </div>
                {!isAddingContato && (
                  <button
                    type="button"
                    onClick={() => setIsAddingContato(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Decisor</span>
                  </button>
                )}
              </div>

              {/* Formulário de Adicionar Contato */}
              {isAddingContato && (
                <form onSubmit={handleAddContato} className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200 dark:border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-neutral-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-neutral-200">Novo Contato</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingContato(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Nome completo *"
                      value={newContato.nome}
                      onChange={(e) => setNewContato({ ...newContato, nome: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs bg-white dark:bg-neutral-900"
                    />
                    <input
                      type="text"
                      placeholder="Cargo (ex: Coordenador Pedagógico)"
                      value={newContato.cargo}
                      onChange={(e) => setNewContato({ ...newContato, cargo: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs bg-white dark:bg-neutral-900"
                    />
                    <select
                      value={newContato.tipo}
                      onChange={(e) => setNewContato({ ...newContato, tipo: e.target.value as TipoContato })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs bg-white dark:bg-neutral-900"
                    >
                      <option value="mantenedor">Mantenedor</option>
                      <option value="diretor_geral">Diretor Geral</option>
                      <option value="diretor_pedagogico">Diretor Pedagógico</option>
                      <option value="coordenador_em">Coordenador Ensino Médio</option>
                      <option value="secretaria">Secretaria</option>
                      <option value="outro">Outro</option>
                    </select>
                    <input
                      type="email"
                      placeholder="E-mail profissional"
                      value={newContato.email}
                      onChange={(e) => setNewContato({ ...newContato, email: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs bg-white dark:bg-neutral-900"
                    />
                    <input
                      type="text"
                      placeholder="Telefone / Celular"
                      value={newContato.telefone}
                      onChange={(e) => setNewContato({ ...newContato, telefone: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs bg-white dark:bg-neutral-900"
                    />
                    <input
                      type="url"
                      placeholder="LinkedIn URL"
                      value={newContato.linkedin_url}
                      onChange={(e) => setNewContato({ ...newContato, linkedin_url: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs bg-white dark:bg-neutral-900"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newContato.principal}
                        onChange={(e) => setNewContato({ ...newContato, principal: e.target.checked })}
                        className="rounded"
                      />
                      <span>Definir como contato principal desta escola</span>
                    </label>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    >
                      Salvar Contato
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Contatos Existentes */}
              {contatosList.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-neutral-800 rounded-xl text-slate-400">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-medium">Nenhum decisor cadastrado nesta escola.</p>
                  <p className="text-[11px] mt-1">Adicione os dados do mantenedor, diretor ou coordenador pedagógico.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contatosList.map((contato) => (
                    <div
                      key={contato.id}
                      className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                        contato.principal
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 shadow-xs'
                          : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-neutral-100 truncate">
                            {contato.nome || 'Sem nome'}
                          </span>
                          {contato.cargo && (
                            <span className="text-[10px] text-slate-500 dark:text-neutral-400">
                              • {contato.cargo}
                            </span>
                          )}
                          {/* Badge de Fonte */}
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700">
                            {contato.fonte}
                          </span>
                          {contato.principal && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              Principal
                            </span>
                          )}
                          {/* Link Ver Prova na Fonte */}
                          {contato.fonte_url && (
                            <a
                              href={contato.fonte_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40"
                              title={contato.evidencia ? `Evidência literal: "${contato.evidencia}"` : 'Ver prova na fonte'}
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>ver prova</span>
                            </a>
                          )}
                          {/* Trecho Literal ao passar o mouse */}
                          {contato.evidencia && (
                            <span
                              className="cursor-help px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                              title={`Evidência literal: "${contato.evidencia}"`}
                            >
                              &ldquo;{contato.evidencia.slice(0, 45)}...&rdquo;
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-neutral-400 mt-1 flex-wrap">
                          {contato.email && (
                            <div className="flex items-center gap-1.5 font-mono">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{contato.email}</span>
                              <EmailStatusBadge 
                                status={contato.email_status} 
                                verificadoEm={contato.email_verificado_em}
                                onVerificar={() => handleVerificarEmail('contato', contato.id, contato.email!)}
                                isVerificando={verificandoId === contato.id}
                              />
                            </div>
                          )}
                          {contato.telefone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{contato.telefone}</span>
                            </div>
                          )}
                          {contato.linkedin_url && (
                            <a
                              href={contato.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>LinkedIn</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Ações do Contato */}
                      <div className="flex items-center gap-1 shrink-0">
                        {!contato.principal && (
                          <button
                            type="button"
                            onClick={() => handleSetPrincipal(contato.id)}
                            className="px-2 py-1 rounded text-[10px] font-semibold border border-slate-200 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                            title="Tornar este o contato principal"
                          >
                            Tornar Principal
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteContato(contato.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Remover contato"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'score' && (
            <div className="space-y-6">
              {/* Card Resumo do Score */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/80 dark:border-neutral-800 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 dark:text-neutral-400 uppercase tracking-wider">
                      Pontuação de Qualificação
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-extrabold text-slate-900 dark:text-neutral-100">
                        {lead?.score ?? 0}
                      </span>
                      <span className="text-xs font-medium text-slate-400">/ 100 pontos</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {lead?.status_qualificacao === 'qualificado' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Qualificado para Prospecção
                      </span>
                    )}
                    {lead?.status_qualificacao === 'enriquecido' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                        Enriquecido (Score &lt; 60 ou sem e-mail verificado)
                      </span>
                    )}
                    {lead?.status_qualificacao === 'descartado' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        Descartado: {lead?.motivo_descarte || 'Critério de descarte'}
                      </span>
                    )}
                    {(!lead?.status_qualificacao || lead?.status_qualificacao === 'bruto') && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300">
                        Lead Bruto
                      </span>
                    )}
                  </div>
                </div>

                {/* Barra de Progresso */}
                <div className="w-full bg-slate-200 dark:bg-neutral-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (lead?.score ?? 0) >= 60
                        ? 'bg-emerald-500'
                        : (lead?.score ?? 0) >= 30
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, lead?.score ?? 0))}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-600 dark:text-neutral-400">
                  <div>
                    <span className="font-semibold block text-slate-800 dark:text-neutral-200">Ensino Médio:</span>
                    <span>{lead?.oferece_ensino_medio ? 'Sim' : 'Não / Não informado'}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-800 dark:text-neutral-200">Matrículas EM:</span>
                    <span>{lead?.matriculas_em ?? 0}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-800 dark:text-neutral-200">Decisores:</span>
                    <span>{contatosList.length} cadastrado(s)</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-800 dark:text-neutral-200">Status Funil:</span>
                    <span className="capitalize">{lead?.status_funil || 'novo'}</span>
                  </div>
                </div>
              </div>

              {/* Detalhamento dos Critérios */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Critérios Pontuados no Cálculo</span>
                  </h3>
                  <a
                    href="/configuracoes/score"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Ajustar Pesos</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                {(() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const criterios = (lead?.score_detalhes as any)?.criterios || 
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    (lead?.score_detalhes as any)?.score?.criterios || 
                                    [];

                  if (!criterios || criterios.length === 0) {
                    return (
                      <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-neutral-800 rounded-xl text-slate-400 dark:text-neutral-500 text-xs">
                        Nenhum detalhe de pontuação gravado para esta escola ainda. Salve a escola ou execute a rotina de recálculo geral.
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-200/80 dark:border-neutral-800 rounded-xl divide-y divide-slate-100 dark:divide-neutral-800/80 overflow-hidden bg-white dark:bg-[#121215]">
                      {criterios.map((crit: { criterio?: string; regra?: string; pontos: number; motivo?: string }, idx: number) => {
                        const isPositive = crit.pontos > 0;
                        const isNegative = crit.pontos < 0;

                        return (
                          <div key={idx} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50 dark:hover:bg-neutral-900/30 transition">
                            <div className="space-y-0.5 min-w-0">
                              <span className="font-bold text-slate-900 dark:text-neutral-100 block truncate">
                                {crit.motivo || crit.criterio || crit.regra}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono block">
                                Critério: {crit.criterio || crit.regra}
                              </span>
                            </div>

                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-bold border ${
                                isPositive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : isNegative
                                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-700'
                              }`}
                            >
                              {isPositive ? `+${crit.pontos}` : crit.pontos} pts
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'sequencia' && (
            <div className="space-y-6">
              {isLoadingSequencia ? (
                <div className="p-12 text-center text-slate-400 dark:text-neutral-500 text-xs flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Carregando dados da sequência...</span>
                </div>
              ) : !inscricaoData?.inscricao ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-neutral-800 rounded-2xl space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <ListOrdered className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-100">
                      Nenhuma sequência em andamento
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-neutral-400">
                      Esta escola ainda não foi inscrita na cadência de e-mails. O motor disparará 5 toques espaçados em 14 dias dentro das janelas comerciais de Brasília.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSequenciaActionLoading}
                    onClick={handleIniciarSequenciaNoModal}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{isSequenciaActionLoading ? 'Inscrevendo...' : 'Iniciar Sequência (5 Toques)'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Card Principal da Inscrição */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/80 dark:border-neutral-800 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-neutral-100">
                            {inscricaoData.inscricao.sequenciaNome || 'Sequência Padrão - 5 Toques'}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              inscricaoData.inscricao.status === 'ativa'
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : inscricaoData.inscricao.status === 'pausada'
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : inscricaoData.inscricao.status === 'concluida'
                                ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {inscricaoData.inscricao.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
                          Contato:{' '}
                          <span className="font-semibold text-slate-700 dark:text-neutral-200">
                            {inscricaoData.inscricao.contatoNome || 'Não especificado'}
                          </span>{' '}
                          ({inscricaoData.inscricao.contatoEmail})
                        </p>
                      </div>

                      {/* Botões de Ação da Inscrição */}
                      <div className="flex items-center gap-2">
                        {inscricaoData.inscricao.status === 'ativa' && (
                          <button
                            type="button"
                            disabled={isSequenciaActionLoading}
                            onClick={() => handlePausarSequencia(inscricaoData.inscricao.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 transition cursor-pointer"
                          >
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pausar</span>
                          </button>
                        )}

                        {inscricaoData.inscricao.status === 'pausada' && (
                          <button
                            type="button"
                            disabled={isSequenciaActionLoading}
                            onClick={() => handleRetomarSequencia(inscricaoData.inscricao.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 transition cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Retomar</span>
                          </button>
                        )}

                        {['ativa', 'pausada'].includes(inscricaoData.inscricao.status) && (
                          <button
                            type="button"
                            disabled={isSequenciaActionLoading}
                            onClick={() => handleEncerrarSequencia(inscricaoData.inscricao.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 transition cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>Encerrar</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-200/60 dark:border-neutral-800/80">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-mono">Progresso</span>
                        <span className="font-bold text-slate-800 dark:text-neutral-200">
                          Passo {inscricaoData.inscricao.passo_atual} de 5 concluídos
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-mono">Próximo Envio</span>
                        <span className="font-bold text-slate-800 dark:text-neutral-200">
                          {inscricaoData.inscricao.proximo_envio_em
                            ? new Date(inscricaoData.inscricao.proximo_envio_em).toLocaleString('pt-BR', {
                                timeZone: 'America/Sao_Paulo',
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              }) + ' (Brasília)'
                            : 'Nenhum agendado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-mono">Inscrito em</span>
                        <span className="font-bold text-slate-800 dark:text-neutral-200">
                          {new Date(inscricaoData.inscricao.criado_em).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline dos 5 Passos */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider">
                      Linha do Tempo dos 5 Toques (14 dias)
                    </h4>

                    <div className="border border-slate-200/80 dark:border-neutral-800 rounded-xl divide-y divide-slate-100 dark:divide-neutral-800/80 overflow-hidden bg-white dark:bg-[#121215]">
                      {[
                        { ordem: 1, dia: 'Dia 0', tipo: 'E-mail Novo', desc: 'Abertura personalizada com gancho de redação e proposta de valor' },
                        { ordem: 2, dia: 'Dia 3', tipo: 'Resposta na Conversa', desc: 'Lembrete curto com economia de 15h semanais e devolutiva em 1 min' },
                        { ordem: 3, dia: 'Dia 7', tipo: 'Resposta na Conversa', desc: 'Entrega de valor: dado do ENEM e oferta de simulado piloto' },
                        { ordem: 4, dia: 'Dia 10', tipo: 'Multithread (Outro Decisor)', desc: 'E-mail para mantenedor ou diretoria geral da mesma escola' },
                        { ordem: 5, dia: 'Dia 14', tipo: 'Resposta na Conversa', desc: 'Despedida cordial e porta aberta para o próximo semestre' },
                      ].map((passoItem) => {
                        const passoAtualNum = inscricaoData.inscricao.passo_atual || 0;
                        const isEnviado = passoItem.ordem <= passoAtualNum;
                        const isProximo = passoItem.ordem === passoAtualNum + 1;

                        return (
                          <div
                            key={passoItem.ordem}
                            className={`p-3.5 flex items-center justify-between gap-3 text-xs transition ${
                              isProximo
                                ? 'bg-blue-50/40 dark:bg-blue-950/20'
                                : isEnviado
                                ? 'bg-slate-50/30 dark:bg-neutral-900/20'
                                : 'opacity-70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                                  isEnviado
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    : isProximo
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 ring-2 ring-blue-500/30'
                                    : 'bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-neutral-500'
                                }`}
                              >
                                {isEnviado ? <CheckCircle2 className="w-4 h-4" /> : passoItem.ordem}
                              </div>

                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 dark:text-neutral-100">
                                    Toque {passoItem.ordem} ({passoItem.dia})
                                  </span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400">
                                    {passoItem.tipo}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                                  {passoItem.desc}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              {isEnviado ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Enviado</span>
                                </span>
                              ) : isProximo ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Próximo</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 dark:text-neutral-500">
                                  Aguardando
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Itens na Fila de Envios */}
                  {inscricaoData.fila && inscricaoData.fila.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-wider">
                        Disparos Registrados na Fila
                      </h4>
                      <div className="border border-slate-200/80 dark:border-neutral-800 rounded-xl divide-y divide-slate-100 dark:divide-neutral-800/80 overflow-hidden bg-white dark:bg-[#121215]">
                        {inscricaoData.fila.map((item) => (
                          <div key={item.id} className="p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 dark:text-neutral-200">
                                {item.assunto}
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
                            <p className="text-[11px] text-slate-500 dark:text-neutral-400 line-clamp-2">
                              {item.corpo_texto}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            Fechar
          </button>
          {activeTab === 'dados' && (
            <button
              type="submit"
              form="escola-form"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : mode === 'create' ? 'Cadastrar Escola' : 'Salvar Alterações'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
