'use client';

import React, { useState, useMemo } from 'react';
import { EscolaComContatos, StatusFunil, EmailStatus, LoteDiario, AgenteExecucao } from '@/types/database';
import { 
  updateLeadStatus, 
  createLead, 
  updateLead, 
  deleteLead 
} from '@/actions/leads';
import { 
  iniciarSequencia, 
  iniciarSequenciaLoteHojeAction 
} from '@/actions/sequencias';
import MascotAgent, { MascotMode } from './MascotAgent';
import Sidebar from './Sidebar';
import KanbanBoard from './KanbanBoard';
import LeadModal from './LeadModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import { generateWhatsAppMessage, getWhatsAppUrl } from '@/lib/whatsapp';
import { pickLeadEmail, isLandline } from '@/lib/contact';
import {
  Search,
  Mail,
  Phone,
  MapPin,
  Send,
  Calendar,
  MessageSquareCheck,
  Building2,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  Edit2,
  Trash2,
  Award,
  MessageCircle,
  Play,
  AlertTriangle,
  UserCheck,
  Users,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface CRMDashboardProps {
  initialLeads: EscolaComContatos[];
  initialLoteHoje?: LoteDiario | null;
  initialUltimaExecucao?: AgenteExecucao | null;
}

type FilterStatus = 'todos' | StatusFunil;

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

export function getScoreBadgeClass(score: number | null | undefined): string {
  const val = score ?? 0;
  if (val >= 60) {
    return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
  }
  if (val >= 30) {
    return 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
  }
  return 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-700';
}

export function getScoreBarClass(score: number | null | undefined): string {
  const val = score ?? 0;
  if (val >= 60) return 'bg-emerald-500';
  if (val >= 30) return 'bg-amber-500';
  return 'bg-slate-400 dark:bg-neutral-600';
}

export default function CRMTable({
  initialLeads,
  initialLoteHoje,
  initialUltimaExecucao,
}: CRMDashboardProps) {
  const [leads, setLeads] = useState<EscolaComContatos[]>(initialLeads);
  const [currentTab, setCurrentTab] = useState<'leads' | 'kanban'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('todos');
  const [onlyCurated, setOnlyCurated] = useState(false);
  const [onlyTodayLeads, setOnlyTodayLeads] = useState(true);
  const [agentMode] = useState<MascotMode>('working');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Data atual em America/Sao_Paulo (YYYY-MM-DD)
  const hojeSP = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }, []);

  // Contagem de leads entregues hoje
  const leadsHojeCount = useMemo(() => {
    return leads.filter((l) => l.entregue_em === hojeSP).length;
  }, [leads, hojeSP]);

  // Alerta de autonomia da base
  const diasRestantes = initialUltimaExecucao?.detalhes?.dias_restantes;
  const isBaseAcabando = typeof diasRestantes === 'number' && diasRestantes < 5;

  // Estados do Modal de CRUD
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedLead, setSelectedLead] = useState<EscolaComContatos | null>(null);

  // Estados do Modal de Google Agenda
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleLead, setScheduleLead] = useState<EscolaComContatos | null>(null);

  // Estado de Inscrição em Lote na Sequência de E-mails
  const [isEnrollingBatch, setIsEnrollingBatch] = useState(false);

  // Curadoria SDR baseada em score e qualificação real no banco
  const curatedCount = useMemo(() => {
    return leads.filter((l) => l.status_qualificacao === 'qualificado').length;
  }, [leads]);

  // Modo de ordenação: maior score primeiro (padrão) ou data mais recente
  const [sortMode, setSortMode] = useState<'score_desc' | 'criado_em_desc'>('score_desc');

  // Filtros em tempo real
  const filteredLeads = useMemo(() => {
    const list = leads.filter((lead) => {
      const contatos = lead.contatos || [];
      const matchContatos = contatos.some(
        (c) =>
          (c.nome && c.nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      const matchesSearch =
        lead.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.email_geral && lead.email_geral.toLowerCase().includes(searchTerm.toLowerCase())) ||
        lead.cidade.toLowerCase().includes(searchTerm.toLowerCase()) ||
        matchContatos;

      const matchesStatus =
        statusFilter === 'todos' ? true : lead.status_funil === statusFilter;

      const matchesCurated = onlyCurated ? lead.status_qualificacao === 'qualificado' : true;

      const matchesToday = onlyTodayLeads ? (lead.entregue_em === hojeSP) : true;

      return matchesSearch && matchesStatus && matchesCurated && matchesToday;
    });

    return list.sort((a, b) => {
      if (sortMode === 'score_desc') {
        const scoreA = a.score ?? -1;
        const scoreB = b.score ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
      }
      return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
    });
  }, [leads, searchTerm, statusFilter, onlyCurated, onlyTodayLeads, hojeSP, sortMode]);

  // Contadores para métricas
  const counts = useMemo(() => {
    return {
      total: leads.length,
      novos: leads.filter((l) => l.status_funil === 'novo').length,
      emSequencia: leads.filter((l) => l.status_funil === 'em_sequencia').length,
      contactados: leads.filter((l) => l.status_funil === 'contato_enviado').length,
      respondidos: leads.filter((l) => l.status_funil === 'respondido').length,
      reuniao: leads.filter((l) => l.status_funil === 'reuniao_agendada').length,
    };
  }, [leads]);

  // CRUD: Criar ou Editar Lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSaveLead = async (formData: any) => {
    if (modalMode === 'create') {
      const res = await createLead({
        nome: formData.nome || '',
        cidade: formData.cidade || 'Brasília',
        uf: formData.uf || 'DF',
        telefone: formData.telefone || null,
        email_geral: formData.email_geral || null,
        cnpj: formData.cnpj || null,
        codigo_inep: formData.codigo_inep || null,
        site: formData.site || null,
        contato_nome: formData.contato_nome || null,
        contato_email: formData.contato_email || null,
        contato_cargo: formData.contato_cargo || null,
        contato_telefone: formData.contato_telefone || null,
        status_funil: formData.status_funil || 'novo',
      });

      if (res.success && res.data) {
        setLeads((prev) => [res.data!, ...prev]);
      } else {
        alert(`Erro ao cadastrar: ${res.error}`);
      }
    } else if (modalMode === 'edit' && formData.id) {
      const res = await updateLead(formData.id, {
        nome: formData.nome,
        cidade: formData.cidade,
        uf: formData.uf,
        telefone: formData.telefone,
        email_geral: formData.email_geral,
        cnpj: formData.cnpj,
        codigo_inep: formData.codigo_inep,
        site: formData.site,
        status_funil: formData.status_funil,
      });

      if (res.success) {
        setLeads((prev) =>
          prev.map((item) =>
            item.id === formData.id ? { ...item, ...formData } : item
          )
        );
      } else {
        alert(`Erro ao salvar alterações: ${res.error}`);
      }
    }
  };

  // CRUD: Deletar Lead
  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Deseja realmente remover esta instituição do CRM?')) return;

    setUpdatingId(leadId);
    const res = await deleteLead(leadId);
    if (res.success) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } else {
      alert(`Erro ao excluir: ${res.error}`);
    }
    setUpdatingId(null);
  };

  // Abertura de Modais
  const handleOpenCreateModal = () => {
    setSelectedLead(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (lead: EscolaComContatos) => {
    setSelectedLead(lead);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // Drag and Drop e mudança de status
  const handleStatusChange = async (
    leadId: string, 
    newStatus: StatusFunil, 
    oldStatus?: StatusFunil
  ) => {
    setUpdatingId(leadId);
    const res = await updateLeadStatus(leadId, newStatus, oldStatus);
    if (res.success) {
      setLeads((prev) =>
        prev.map((item) =>
          item.id === leadId
            ? { ...item, status_funil: newStatus, ultima_interacao: new Date().toISOString() }
            : item
        )
      );
    } else {
      alert(`Erro ao atualizar status: ${res.error}`);
    }
    setUpdatingId(null);
  };

  // Iniciar Sequência de E-mails Individual (5 Toques)
  const handleIniciarSequencia = async (lead: EscolaComContatos) => {
    const emailToUse = pickLeadEmail(lead);
    if (!emailToUse) {
      alert('Esta escola não possui nenhum e-mail válido cadastrado para iniciar a sequência.');
      return;
    }

    if (lead.status_funil === 'em_sequencia') {
      alert('Esta escola já está com uma sequência em andamento.');
      return;
    }

    const confirmar = confirm(
      `Deseja inscrever a escola "${lead.nome}" na Sequência de E-mails (5 Toques em 14 dias)?\n\nO primeiro envio será programado na próxima janela comercial útil de Brasília.`
    );
    if (!confirmar) return;

    setUpdatingId(lead.id);
    const res = await iniciarSequencia(lead.id);
    if (res.success) {
      alert(`Sequência iniciada com sucesso para ${lead.nome}! O e-mail foi enfileirado para envio.`);
      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id
            ? { ...item, status_funil: 'em_sequencia', ultima_interacao: new Date().toISOString() }
            : item
        )
      );
    } else {
      alert(`Não foi possível iniciar a sequência: ${res.error}`);
    }
    setUpdatingId(null);
  };

  // Envio de WhatsApp
  const handleSendWhatsApp = (lead: EscolaComContatos) => {
    if (!lead.telefone) {
      alert('Esta escola não possui telefone cadastrado.');
      return;
    }

    if (
      isLandline(lead.telefone) &&
      !confirm(
        `${lead.telefone} parece ser um telefone fixo. O WhatsApp só abrirá a conversa se esse número tiver WhatsApp (Business). Abrir mesmo assim?`
      )
    ) {
      return;
    }

    const message = generateWhatsAppMessage(lead);
    const url = getWhatsAppUrl(lead.telefone, message);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      alert('O navegador bloqueou a nova aba. Permita pop-ups para este site.');
      return;
    }

    handleStatusChange(lead.id, 'contato_enviado', lead.status_funil);
  };

  // Google Agenda
  const handleOpenScheduleModal = (lead: EscolaComContatos) => {
    setScheduleLead(lead);
    setIsScheduleOpen(true);
  };

  const handleConfirmScheduled = async (leadId: string) => {
    await handleStatusChange(leadId, 'reuniao_agendada');
  };

  // Inscrição em Massa de Leads do Lote de Hoje na Sequência Padrão
  const handleIniciarSequenciaLoteHoje = async () => {
    const confirmar = confirm(
      'Deseja inscrever todas as escolas qualificadas do lote de hoje na Sequência de E-mails?\n\nOs disparos respeitarão as janelas comerciais de Brasília e o modo de aprovação configurado.'
    );
    if (!confirmar) return;

    setIsEnrollingBatch(true);
    try {
      const res = await iniciarSequenciaLoteHojeAction();
      if (res.success) {
        alert(
          `Inscrição concluída!\n${res.totalInscritos} escola(s) inscrita(s) com sucesso na sequência.` +
            (res.erros && res.erros.length > 0 ? `\n\nAvisos:\n${res.erros.slice(0, 3).join('\n')}` : '')
        );
        window.location.reload();
      } else {
        alert(`Erro na inscrição do lote: ${res.erros?.[0] || 'Falha desconhecida.'}`);
      }
    } catch (err) {
      console.error('Erro na ação de inscrição em lote:', err);
      alert('Erro inesperado ao inscrever lote de hoje.');
    } finally {
      setIsEnrollingBatch(false);
    }
  };

  const renderBadge = (status: StatusFunil) => {
    switch (status) {
      case 'novo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Novo
          </span>
        );
      case 'em_sequencia':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            Em sequência
          </span>
        );
      case 'contato_enviado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Send className="w-3 h-3 text-blue-500" />
            Contato Enviado
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <MessageSquareCheck className="w-3 h-3 text-purple-500" />
            Respondido
          </span>
        );
      case 'reuniao_agendada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Calendar className="w-3 h-3 text-amber-500" />
            Reunião Agendada
          </span>
        );
      case 'sem_interesse':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700">
            Sem Interesse
          </span>
        );
      case 'descadastrado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            Descadastrado
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* SIDEBAR FLUTUANTE RETRÁTIL */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        totalLeads={leads.length}
      />

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 p-6 md:p-8 overflow-x-hidden space-y-6">
        {agentMode === 'working' && (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50/90 dark:from-emerald-950/30 via-white dark:via-neutral-900/60 to-teal-50/60 dark:to-teal-950/20 p-4 md:p-5 shadow-xs transition-colors">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-neutral-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
                  <MascotAgent mode="working" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                      SDR Prospecção Ativa
                    </span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400">Escolas Particulares • Ensino Médio</span>
                  </div>
                </div>
              </div>

              {/* Botão de Filtragem Curada */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setOnlyCurated(!onlyCurated)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                    onlyCurated
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 border border-slate-200 dark:border-neutral-800'
                  }`}
                >
                  <Award className={`w-3.5 h-3.5 ${onlyCurated ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                  <span>{onlyCurated ? 'Mostrando Melhores Leads (Qualificados)' : 'Ver Só Melhores Leads'}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${onlyCurated ? 'bg-emerald-800 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300'}`}>
                    {curatedCount}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BARRA SUPERIOR DE AÇÕES E VISUALIZAÇÃO */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-neutral-100 tracking-tight">
              Pipeline de Prospecção Comercial
            </h1>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              Instituições de ensino particular qualificadas no Distrito Federal e Entorno
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap md:flex-nowrap">
            {/* Botão de Inscrição em Massa na Sequência (Etapa 10) */}
            <button
              disabled={isEnrollingBatch}
              onClick={handleIniciarSequenciaLoteHoje}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 shadow-xs transition cursor-pointer disabled:opacity-50"
              title="Inscreve todas as escolas qualificadas entregues hoje na sequência de 5 toques"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isEnrollingBatch ? 'Inscrevendo Lote...' : 'Iniciar Sequência (Leads de Hoje)'}</span>
            </button>

            {/* Botão Cadastrar Escola */}
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Escola</span>
            </button>

            {/* Alternador Kanban / Tabela */}
            <div className="flex items-center p-1 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-xs">
              <button
                onClick={() => setCurrentTab('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  currentTab === 'kanban'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setCurrentTab('leads')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  currentTab === 'leads'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Tabela</span>
              </button>
            </div>
          </div>
        </div>

        {/* ALERTA DE BASE ESGOTANDO (< 5 DIAS) */}
        {isBaseAcabando && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                A base atual rende cerca de <strong>{diasRestantes} dias</strong>. Amplie as regiões em <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded text-[11px] font-mono">scripts/config/regioes.json</code> e rode o importador do Censo.
              </span>
            </div>
          </div>
        )}

        {/* CONTADOR DE LOTE DIÁRIO E FILTRO DE ENTREGA */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100 dark:border-blue-900/40">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900 dark:text-neutral-100">
                  {leadsHojeCount} de 20 entregues hoje
                </span>
                {initialLoteHoje?.motivo_incompleto && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Motivo: {initialLoteHoje.motivo_incompleto === 'base_esgotada' ? 'Base esgotada' : initialLoteHoje.motivo_incompleto === 'teto_custo' ? 'Teto de custo atingido' : initialLoteHoje.motivo_incompleto}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                Seleção autônoma diária do Agente SDR por ranking de qualificação
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-neutral-900 p-1 rounded-xl self-start sm:self-auto border border-slate-200/60 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setOnlyTodayLeads(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                onlyTodayLeads
                  ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
            >
              Leads de hoje ({leadsHojeCount})
            </button>
            <button
              type="button"
              onClick={() => setOnlyTodayLeads(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                !onlyTodayLeads
                  ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
            >
              Todos os leads ({leads.length})
            </button>
          </div>
        </div>

        {/* CARDS DE MÉTRICAS */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-bold">Total Mapeadas</span>
              <Building2 className="w-4 h-4 text-slate-400 dark:text-neutral-500" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-neutral-100">{counts.total}</div>
            <p className="text-[11px] text-slate-500 mt-1">Escolas no banco</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold">Novas</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-neutral-100">{counts.novos}</div>
            <p className="text-[11px] text-slate-500 mt-1">Aguardando início</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold">Em sequência</span>
              <Play className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-neutral-100">{counts.emSequencia}</div>
            <p className="text-[11px] text-slate-500 mt-1">Na cadência</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-bold">Respondidos</span>
              <MessageSquareCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-neutral-100">{counts.respondidos}</div>
            <p className="text-[11px] text-slate-500 mt-1">Interações ativas</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">Reuniões</span>
              <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-neutral-100">{counts.reuniao}</div>
            <p className="text-[11px] text-slate-500 mt-1">No Google Agenda</p>
          </div>
        </div>

        {/* BARRA DE FILTROS E ORDENAÇÃO (Compartilhada entre Kanban e Tabela) */}
        <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-3.5 rounded-2xl shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por escola, decisor, cidade ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="todos">Todos os Status</option>
              <option value="novo">Novo</option>
              <option value="em_sequencia">Em sequência</option>
              <option value="contato_enviado">Contato Enviado</option>
              <option value="respondido">Respondido</option>
              <option value="reuniao_agendada">Reunião Agendada</option>
            </select>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as 'score_desc' | 'criado_em_desc')}
              className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              title="Modo de ordenação"
            >
              <option value="score_desc">Maior Score primeiro</option>
              <option value="criado_em_desc">Data mais recente</option>
            </select>
          </div>
        </div>

        {/* VISUALIZAÇÃO KANBAN OU TABELA */}
        {currentTab === 'kanban' ? (
          <KanbanBoard
            leads={filteredLeads}
            sortMode={sortMode}
            onStatusChange={handleStatusChange}
            onSendEmail={handleIniciarSequencia}
            onSendWhatsApp={handleSendWhatsApp}
            onEditLead={handleOpenEditModal}
            onDeleteLead={handleDeleteLead}
            onScheduleMeeting={handleOpenScheduleModal}
            updatingId={updatingId}
          />
        ) : (
          /* TABELA LISTING */
          <div className="space-y-4">
            {/* TABELA DE DADOS */}
            <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-neutral-800 text-slate-400 dark:text-neutral-500 uppercase tracking-wider text-[10px] bg-slate-50/50 dark:bg-neutral-900/50">
                      <th className="py-4 px-6 font-semibold">Instituição de Ensino</th>
                      <th className="py-4 px-6 font-semibold">Score</th>
                      <th className="py-4 px-6 font-semibold">Contato Geral</th>
                      <th className="py-4 px-6 font-semibold">Decisor Principal</th>
                      <th className="py-4 px-6 font-semibold">Status Funil</th>
                      <th className="py-4 px-6 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80 text-slate-700 dark:text-neutral-300">
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-400 dark:text-neutral-600">
                          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30 stroke-[1.5]" />
                          <p className="text-base font-semibold text-slate-600 dark:text-neutral-400">Nenhuma escola encontrada</p>
                          <p className="text-xs text-slate-400 mt-1">Ajuste os filtros ou adicione uma nova escola.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const isQualificado = lead.status_qualificacao === 'qualificado';
                        const contatos = lead.contatos || [];
                        const contatoPrincipal = contatos.find((c) => c.principal) || contatos[0];
                        const outrosContatosCount = contatos.length > 1 ? contatos.length - 1 : 0;

                        return (
                          <tr key={lead.id} className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/40 transition-colors group">
                            {/* Nome da Escola */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {lead.nome}
                                </span>
                                {lead.precisa_revisao && (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0"
                                    title={lead.observacao_revisao || 'Lead precisa de revisão nos dados'}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                    <span>Revisar</span>
                                  </span>
                                )}
                                {isQualificado && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                    Qualificado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>{lead.cidade}/{lead.uf}</span>
                                {lead.bairro && <span>• {lead.bairro}</span>}
                              </div>

                              {lead.gancho_personalizacao && (
                                <div className="mt-2 p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-900 dark:text-indigo-200 max-w-sm">
                                  <div className="flex items-center gap-1 font-bold text-indigo-700 dark:text-indigo-400 text-[10px]">
                                    <Sparkles className="w-3 h-3" />
                                    <span>Gancho SDR:</span>
                                  </div>
                                  <p className="mt-0.5 italic">
                                    &ldquo;{lead.gancho_personalizacao}&rdquo;
                                  </p>
                                  {lead.fontes_pesquisa && lead.fontes_pesquisa.length > 0 && (
                                    <div className="mt-1 flex items-center gap-1">
                                      <span className="text-[10px] text-slate-400">Fonte:</span>
                                      <a
                                        href={lead.fontes_pesquisa[0]}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        <span className="truncate max-w-[150px]">{lead.fontes_pesquisa[0]}</span>
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Score */}
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-1.5 w-28">
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold border ${getScoreBadgeClass(lead.score)}`}>
                                    <Award className="w-3 h-3" />
                                    {lead.score ?? 0} pts
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getScoreBarClass(lead.score)}`}
                                    style={{ width: `${Math.min(100, Math.max(0, lead.score ?? 0))}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Contato Geral */}
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-1 text-xs">
                                {lead.email_geral ? (
                                  <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-neutral-300 font-mono">
                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="truncate max-w-[190px]">{lead.email_geral}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-neutral-500 italic text-[11px]">E-mail geral não cadastrado</span>
                                )}

                                {lead.telefone ? (
                                  <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-neutral-300 font-medium">
                                    <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <span>{lead.telefone}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-neutral-500 italic text-[11px]">Telefone não cadastrado</span>
                                )}
                              </div>
                            </td>

                            {/* Decisor Principal */}
                            <td className="py-4 px-6">
                              {contatoPrincipal ? (
                                <div>
                                  <div className="font-semibold text-slate-900 dark:text-neutral-100 text-xs flex items-center gap-1">
                                    <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                                    <span>{contatoPrincipal.nome || 'Decisor'}</span>
                                    {contatoPrincipal.cargo && (
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        ({contatoPrincipal.cargo})
                                      </span>
                                    )}
                                  </div>
                                  {contatoPrincipal.email && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-400 font-mono mt-0.5">
                                      <span className="truncate max-w-[170px]">{contatoPrincipal.email}</span>
                                      <EmailStatusBadge status={contatoPrincipal.email_status} />
                                    </div>
                                  )}
                                  {outrosContatosCount > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 mt-1">
                                      <Users className="w-3 h-3" />
                                      <span>+{outrosContatosCount} outro{outrosContatosCount > 1 ? 's' : ''} contato{outrosContatosCount > 1 ? 's' : ''}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-neutral-500 italic text-[11px]">Nenhum decisor cadastrado</span>
                              )}
                            </td>

                            {/* Status no Funil */}
                            <td className="py-4 px-6">
                              {renderBadge(lead.status_funil)}
                            </td>

                            {/* Ações */}
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Botão WhatsApp (Ativo) */}
                                {lead.telefone && (
                                  <button
                                    onClick={() => handleSendWhatsApp(lead)}
                                    className="p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer"
                                    title="Chamar no WhatsApp"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Iniciar Sequência de E-mails (5 Toques) */}
                                <button
                                  onClick={() => handleIniciarSequencia(lead)}
                                  disabled={lead.status_funil === 'em_sequencia' || updatingId === lead.id}
                                  className={`p-1.5 rounded-lg border transition ${
                                    lead.status_funil === 'em_sequencia'
                                      ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 opacity-80 cursor-default'
                                      : 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer'
                                  }`}
                                  title={
                                    lead.status_funil === 'em_sequencia'
                                      ? 'Sequência já em andamento'
                                      : 'Iniciar Sequência de E-mails (5 toques)'
                                  }
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </button>

                                {/* Agendar Reunião */}
                                <button
                                  onClick={() => handleOpenScheduleModal(lead)}
                                  className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition cursor-pointer"
                                  title="Agendar Reunião no Google Agenda"
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                </button>

                                {/* Editar */}
                                <button
                                  onClick={() => handleOpenEditModal(lead)}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                                  title="Editar Escola e Contatos"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {/* Excluir */}
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE CRUD DA ESCOLA & CONTATOS */}
      <LeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLead}
        lead={selectedLead}
        mode={modalMode}
      />

      {/* MODAL DO GOOGLE AGENDA */}
      <ScheduleMeetingModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        lead={scheduleLead}
        onConfirmScheduled={handleConfirmScheduled}
      />
    </div>
  );
}
