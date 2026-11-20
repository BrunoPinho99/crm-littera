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
  ExternalLink
} from 'lucide-react';
import { 
  addContatoAction, 
  deleteContatoAction, 
  setContatoPrincipalAction 
} from '@/actions/leads';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (escolaData: any) => Promise<void>;
  lead?: EscolaComContatos | null;
  mode: 'create' | 'edit';
}

function EmailStatusBadge({ status }: { status: EmailStatus }) {
  switch (status) {
    case 'valido':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
          <ShieldCheck className="w-2.5 h-2.5" />
          Válido
        </span>
      );
    case 'arriscado':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
          <ShieldAlert className="w-2.5 h-2.5" />
          Arriscado
        </span>
      );
    case 'invalido':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
          <AlertTriangle className="w-2.5 h-2.5" />
          Inválido
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400">
          <HelpCircle className="w-2.5 h-2.5" />
          Não verificado
        </span>
      );
  }
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
  const [activeTab, setActiveTab] = useState<'dados' | 'contatos'>('dados');

  const [prevTrack, setPrevTrack] = useState<{ lead?: EscolaComContatos | null; mode: string; isOpen: boolean }>({
    lead,
    mode,
    isOpen,
  });

  if (prevTrack.lead !== lead || prevTrack.mode !== mode || prevTrack.isOpen !== isOpen) {
    setPrevTrack({ lead, mode, isOpen });
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
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
                  {mode === 'create' ? 'Cadastrar Nova Escola' : 'Editar Escola & Decisores'}
                </h2>
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
          </div>
        )}

        {/* Conteúdo do Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'dados' ? (
            <form id="escola-form" onSubmit={handleSubmitEscola} className="space-y-4">
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
                  <label className="text-xs font-semibold text-slate-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>E-mail Geral da Escola</span>
                  </label>
                  <input
                    type="email"
                    placeholder="Ex: secretaria@colegio.com.br"
                    value={formData.email_geral}
                    onChange={(e) => setFormData({ ...formData, email_geral: e.target.value })}
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
                          {contato.principal && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-neutral-400 mt-1 flex-wrap">
                          {contato.email && (
                            <div className="flex items-center gap-1.5 font-mono">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{contato.email}</span>
                              <EmailStatusBadge status={contato.email_status} />
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
