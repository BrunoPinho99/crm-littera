'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { LeadEscolar } from '@/types/database';
import { markContactSent, updateLeadStatus, createLead, updateLead, deleteLead, sendLeadEmailDirect } from '@/actions/leads';
import MascotAgent, { MascotMode } from './MascotAgent';
import Sidebar from './Sidebar';
import KanbanBoard from './KanbanBoard';
import WordSwap from './WordSwap';
import LeadModal from './LeadModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import AutoDispatcherModal from './AutoDispatcherModal';
import { generateWhatsAppMessage, getWhatsAppUrl } from '@/lib/whatsapp';
import {
  Search,
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  Calendar,
  MessageSquareCheck,
  Building2,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  Edit2,
  Trash2,
  Award,
  MessageCircle,
  Play
} from 'lucide-react';

interface CRMDashboardProps {
  initialLeads: LeadEscolar[];
}

type FilterStatus = 'todos' | 'novo' | 'contato_enviado' | 'respondido' | 'reuniao_agendada';

export default function CRMTable({ initialLeads }: CRMDashboardProps) {
  const [leads, setLeads] = useState<LeadEscolar[]>(initialLeads);
  const [currentTab, setCurrentTab] = useState<'leads' | 'kanban'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('todos');
  const [onlyCurated, setOnlyCurated] = useState(false);
  const [agentMode, setAgentMode] = useState<MascotMode>('working');
  const [isCurating, setIsCurating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Estados do Modal de CRUD
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedLead, setSelectedLead] = useState<LeadEscolar | null>(null);

  // Estados do Modal de Google Agenda
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleLead, setScheduleLead] = useState<LeadEscolar | null>(null);

  // Estados da Automação de Disparo de E-mails
  const [isAutoDispatcherOpen, setIsAutoDispatcherOpen] = useState(false);
  const [isAutoDispatching, setIsAutoDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState({
    current: 0,
    total: 0,
    currentSchool: '',
    successCount: 0,
    errorCount: 0,
    isSimulated: false,
  });

  // Regra de curadoria SDR: Decisor identificado E telefone/whatsapp + email
  const isHighPotentialLead = (lead: LeadEscolar) => {
    const hasDecisor = Boolean(lead.nome_decisor && lead.nome_decisor.trim().length > 0);
    const hasContact = Boolean(lead.email_escola || lead.email_decisor) && Boolean(lead.telefone_escola);
    return hasDecisor && hasContact;
  };

  const curatedCount = useMemo(() => {
    return leads.filter(isHighPotentialLead).length;
  }, [leads]);

  // Filtros em tempo real
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.nome_escola.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.email_escola && lead.email_escola.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.nome_decisor && lead.nome_decisor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        lead.cidade.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'todos' ? true : lead.status === statusFilter;

      const matchesCurated = onlyCurated ? isHighPotentialLead(lead) : true;

      return matchesSearch && matchesStatus && matchesCurated;
    });
  }, [leads, searchTerm, statusFilter, onlyCurated]);

  // Contadores para métricas
  const counts = useMemo(() => {
    return {
      total: leads.length,
      novos: leads.filter((l) => l.status === 'novo').length,
      contactados: leads.filter((l) => l.status === 'contato_enviado').length,
      respondidos: leads.filter((l) => l.status === 'respondido').length,
      reuniao: leads.filter((l) => l.status === 'reuniao_agendada').length,
    };
  }, [leads]);

  // CRUD: Criar ou Editar Lead
  const handleSaveLead = async (formData: Partial<LeadEscolar>) => {
    if (modalMode === 'create') {
      const res = await createLead({
        nome_escola: formData.nome_escola || '',
        cidade: formData.cidade || 'Brasília',
        telefone_escola: formData.telefone_escola || null,
        email_escola: formData.email_escola || null,
        nome_decisor: formData.nome_decisor || null,
        email_decisor: formData.email_decisor || null,
        status: formData.status || 'novo',
      });

      if (res.success && res.data) {
        setLeads((prev) => [res.data!, ...prev]);
      }
    } else if (modalMode === 'edit' && formData.id) {
      const res = await updateLead(formData.id, {
        nome_escola: formData.nome_escola,
        cidade: formData.cidade,
        telefone_escola: formData.telefone_escola,
        email_escola: formData.email_escola,
        nome_decisor: formData.nome_decisor,
        email_decisor: formData.email_decisor,
        status: formData.status,
      });

      if (res.success) {
        setLeads((prev) =>
          prev.map((item) =>
            item.id === formData.id ? { ...item, ...formData } as LeadEscolar : item
          )
        );
      }
    }
  };

  // CRUD: Deletar Lead
  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Deseja realmente remover esta empresa do CRM?')) return;

    setUpdatingId(leadId);
    const res = await deleteLead(leadId);
    if (res.success) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    }
    setUpdatingId(null);
  };

  const handleOpenCreateModal = () => {
    setSelectedLead(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (lead: LeadEscolar) => {
    setSelectedLead(lead);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // Abrir agendamento no Google Agenda
  const handleOpenSchedule = (lead: LeadEscolar) => {
    setScheduleLead(lead);
    setIsScheduleOpen(true);
  };

  const handleConfirmScheduled = async (leadId: string) => {
    await handleStatusChange(leadId, 'reuniao_agendada');
  };

  const handleStatusChange = async (leadId: string, newStatus: LeadEscolar['status']) => {
    setUpdatingId(leadId);
    setLeads((prev) =>
      prev.map((item) =>
        item.id === leadId
          ? { ...item, status: newStatus, ultima_interacao: new Date().toISOString() }
          : item
      )
    );

    const res = await updateLeadStatus(leadId, newStatus);
    if (!res.success) {
      console.error('Falha ao atualizar status no servidor');
    }
    setUpdatingId(null);
  };

  const handleSendEmail = async (lead: LeadEscolar) => {
    const recipient = lead.email_decisor || lead.email_escola || '';
    if (!recipient) {
      alert('Esta empresa não possui e-mail cadastrado.');
      return;
    }

    setUpdatingId(lead.id);
    try {
      // Disparo automático via Server Action / Gmail
      const res = await sendLeadEmailDirect(lead.id);
      if (res.success) {
        setLeads((prev) =>
          prev.map((item) =>
            item.id === lead.id
              ? { ...item, status: 'contato_enviado', ultima_interacao: new Date().toISOString() }
              : item
          )
        );
        if (res.simulated) {
          console.info(res.message);
        }
      } else {
        alert(`Erro ao enviar e-mail: ${res.error || 'Falha no disparo'}`);
      }
    } catch (err) {
      console.error('Erro ao acionar disparo de e-mail:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSendWhatsApp = (lead: LeadEscolar) => {
    if (!lead.telefone_escola) {
      alert('Esta empresa não possui telefone/WhatsApp cadastrado.');
      return;
    }

    const message = generateWhatsAppMessage(lead);
    const url = getWhatsAppUrl(lead.telefone_escola, message);
    window.open(url, '_blank');

    // Atualiza status do lead no CRM
    handleStatusChange(lead.id, 'contato_enviado');
  };

  // Automação em Massa de Disparo de E-mails
  const handleOpenAutoDispatcher = () => {
    const eligibleLeads = leads.filter(
      (l) => l.status === 'novo' && (Boolean(l.email_decisor) || Boolean(l.email_escola))
    );
    setDispatchProgress({
      current: 0,
      total: eligibleLeads.length,
      currentSchool: '',
      successCount: 0,
      errorCount: 0,
      isSimulated: false,
    });
    setIsAutoDispatcherOpen(true);
  };

  const handleStartAutoDispatch = async () => {
    const eligibleLeads = leads.filter(
      (l) => l.status === 'novo' && (Boolean(l.email_decisor) || Boolean(l.email_escola))
    );

    if (eligibleLeads.length === 0) return;

    setIsAutoDispatching(true);
    let successCount = 0;
    let errorCount = 0;
    let isSimulated = false;

    for (let i = 0; i < eligibleLeads.length; i++) {
      const currentLead = eligibleLeads[i];
      setDispatchProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentSchool: currentLead.nome_escola,
      }));

      try {
        const res = await sendLeadEmailDirect(currentLead.id);
        if (res.success) {
          successCount++;
          if (res.simulated) isSimulated = true;
          setLeads((prev) =>
            prev.map((item) =>
              item.id === currentLead.id
                ? { ...item, status: 'contato_enviado', ultima_interacao: new Date().toISOString() }
                : item
            )
          );
        } else {
          errorCount++;
        }
      } catch (err) {
        console.error(`Erro ao disparar para ${currentLead.nome_escola}:`, err);
        errorCount++;
      }

      setDispatchProgress((prev) => ({
        ...prev,
        successCount,
        errorCount,
        isSimulated,
      }));

      // Intervalo de segurança entre envios
      if (i < eligibleLeads.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }

    setIsAutoDispatching(false);
  };

  const handleRunCurator = () => {
    setIsCurating(true);
    setTimeout(() => {
      setOnlyCurated(true);
      setIsCurating(false);
    }, 700);
  };

  const renderBadge = (status: LeadEscolar['status']) => {
    switch (status) {
      case 'novo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Novo
          </span>
        );
      case 'contato_enviado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Send className="w-3 h-3" />
            Contato Enviado
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <MessageSquareCheck className="w-3 h-3" />
            Respondido
          </span>
        );
      case 'reuniao_agendada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Calendar className="w-3 h-3" />
            Reunião Agendada
          </span>
        );
    }
  };

  return (
    <div className="flex w-full min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-[#09090b] transition-colors duration-300">
      {/* ================= SIDEBAR RETRÁTIL ESTILO BEYOND UI ================= */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        agentMode={agentMode}
        onToggleAgentMode={() =>
          setAgentMode((prev) => (prev === 'working' ? 'idle' : 'working'))
        }
        totalLeads={leads.length}
        curatedCount={curatedCount}
        onRunCurator={handleRunCurator}
        isCurating={isCurating}
      />

      {/* ================= ÁREA DE CONTEÚDO PRINCIPAL (NÃO É EMPURRADA) ================= */}
      <main className="flex-1 p-6 md:p-8 overflow-x-hidden space-y-6">
        {/* BANNER ANIMADO COM WORD SWAP */}
        {agentMode === 'working' && (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50/90 dark:from-emerald-950/30 via-white dark:via-neutral-900/60 to-teal-50/60 dark:to-teal-950/20 p-4 md:p-5 shadow-xs transition-colors">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-neutral-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
                  <MascotAgent mode="working" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 animate-spin text-emerald-600 dark:text-emerald-400" style={{ animationDuration: '3s' }} />
                      SDR Prospecção Ativa
                    </span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400">Curadoria em tempo real (DF)</span>
                  </div>
                  {/* WORD SWAP ANIMADO */}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-bold shrink-0">Etapa:</span>
                    <WordSwap
                      className="text-sm md:text-base font-semibold text-slate-800 dark:text-neutral-100"
                      intervalMs={2600}
                    />
                  </div>
                </div>
              </div>

              {/* Botão de Filtragem Curada Rápida */}
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
                  <span>{onlyCurated ? 'Mostrando Melhores Leads' : 'Ver Só Melhores Leads'}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${onlyCurated ? 'bg-emerald-800 text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300'}`}>
                    {curatedCount}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CABEÇALHO DO PIPELINE + BOTÃO CRIAR LEAD (CRUD) */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Prospecção Automatizada e Curada • Distrito Federal</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-neutral-100">
              {currentTab === 'kanban' ? 'Quadro Kanban de Prospecção' : 'Gestão de Empresas & Leads'}
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-neutral-400 mt-1 max-w-2xl leading-relaxed">
              O robô atua como SDR autônomo curando leads educacionais. Você pode cadastrar novas empresas, editar informações e arrastar pelo kanban.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap md:flex-nowrap">
            {/* Botão de Disparo em Massa */}
            <button
              onClick={handleOpenAutoDispatcher}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 transition cursor-pointer"
              title="Iniciar envio de e-mails em lote para novos leads"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Automação de E-mails</span>
            </button>

            {/* Botão Novo Lead (CRUD) */}
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Empresa</span>
            </button>

            {/* Alternador de Visualização */}
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

        {/* CARDS DE MÉTRICAS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-bold">Total de Empresas</span>
              <Building2 className="w-4 h-4 text-slate-400 dark:text-neutral-500" />
            </div>
            <div className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-neutral-100">{counts.total}</div>
            <p className="text-[11px] text-slate-500 dark:text-neutral-500 mt-1">Mapeadas no banco</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold">Novos / Curados</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-neutral-100">{counts.novos}</div>
            <p className="text-[11px] text-slate-500 dark:text-neutral-500 mt-1">Aguardando abordagem</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold">Contactados</span>
              <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-neutral-100">{counts.contactados}</div>
            <p className="text-[11px] text-slate-500 dark:text-neutral-500 mt-1">E-mail comercial enviado</p>
          </div>

          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-neutral-800 p-4 rounded-2xl shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">Reuniões</span>
              <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-neutral-100">{counts.reuniao}</div>
            <p className="text-[11px] text-slate-500 dark:text-neutral-500 mt-1">Demos agendadas</p>
          </div>
        </div>

        {/* BARRA DE FILTROS E BUSCA */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white dark:bg-[#121215] p-3.5 rounded-2xl border border-slate-200 dark:border-neutral-800 shadow-xs transition-colors">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar por empresa, decisor ou cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm text-slate-800 dark:text-neutral-200 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <button
              onClick={() => setStatusFilter('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'todos'
                  ? 'bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-950 shadow-xs'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
            >
              Todos ({counts.total})
            </button>
            <button
              onClick={() => setStatusFilter('novo')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'novo'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
            >
              Novos ({counts.novos})
            </button>
            <button
              onClick={() => setStatusFilter('contato_enviado')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'contato_enviado'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
            >
              Contactados ({counts.contactados})
            </button>
            <button
              onClick={() => setStatusFilter('reuniao_agendada')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'reuniao_agendada'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-200'
              }`}
            >
              Reuniões ({counts.reuniao})
            </button>
          </div>
        </div>

        {/* ================= CONDICIONAL: KANBAN OU TABELA ================= */}
        {currentTab === 'kanban' ? (
          <KanbanBoard
            leads={filteredLeads}
            onStatusChange={handleStatusChange}
            onSendEmail={handleSendEmail}
            onSendWhatsApp={handleSendWhatsApp}
            onEditLead={handleOpenEditModal}
            onDeleteLead={handleDeleteLead}
            onScheduleMeeting={handleOpenSchedule}
            updatingId={updatingId}
          />
        ) : (
          /* TABELA DE LEADS */
          <div className="border border-slate-200 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-[#121215] shadow-xs transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-neutral-900/60 text-slate-500 dark:text-neutral-400 uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-neutral-800">
                  <tr>
                    <th className="py-4 px-6 font-semibold">Empresa & Cidade</th>
                    <th className="py-4 px-6 font-semibold">Contato (Whats / E-mail)</th>
                    <th className="py-4 px-6 font-semibold">Decisor da Empresa</th>
                    <th className="py-4 px-6 font-semibold">Status</th>
                    <th className="py-4 px-6 font-semibold">Última Interação</th>
                    <th className="py-4 px-6 font-semibold text-right">Ações (CRUD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/80 text-slate-700 dark:text-neutral-300">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-400 dark:text-neutral-600">
                        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30 stroke-[1.5]" />
                        <p className="text-base font-semibold text-slate-600 dark:text-neutral-400">Nenhuma empresa encontrada</p>
                        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">Ajuste os filtros ou adicione uma nova empresa pelo botão acima.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const isUpdating = updatingId === lead.id;
                      const isTier1 = isHighPotentialLead(lead);

                      return (
                        <tr key={lead.id} className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/40 transition-colors group">
                          {/* Nome da Empresa */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {lead.nome_escola}
                              </span>
                              {isTier1 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                  Top Tier
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                              <span>{lead.cidade}</span>
                            </div>
                          </td>

                          {/* Contato Comercial & WhatsApp */}
                          <td className="py-4 px-6">
                            <div className="flex flex-col gap-1 text-xs">
                              {lead.email_escola ? (
                                <a
                                  href={`mailto:${lead.email_escola}`}
                                  className="inline-flex items-center gap-1.5 text-slate-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 transition font-medium"
                                >
                                  <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                                  <span className="truncate max-w-[190px]">{lead.email_escola}</span>
                                </a>
                              ) : (
                                <span className="text-slate-400 dark:text-neutral-500 italic text-[11px]">E-mail não informado</span>
                              )}

                              {lead.telefone_escola ? (
                                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-neutral-300 font-medium">
                                  <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>{lead.telefone_escola}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-neutral-500 italic text-[11px]">WhatsApp não informado</span>
                              )}
                            </div>
                          </td>

                          {/* Decisor & E-mail do Decisor */}
                          <td className="py-4 px-6">
                            {lead.nome_decisor ? (
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-neutral-100 text-xs">{lead.nome_decisor}</div>
                                {lead.email_decisor ? (
                                  <div className="text-[11px] text-slate-500 dark:text-neutral-400 truncate max-w-[170px] mt-0.5">
                                    {lead.email_decisor}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 dark:text-neutral-500 italic">E-mail a obter</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-neutral-500 text-xs italic">A identificar</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-4 px-6">{renderBadge(lead.status)}</td>

                          {/* Última Interação */}
                          <td className="py-4 px-6 text-xs text-slate-500 dark:text-neutral-400">
                            {lead.ultima_interacao ? (
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                                <span>
                                  {new Date(lead.ultima_interacao).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-neutral-600">—</span>
                            )}
                          </td>

                          {/* Ações CRUD */}
                          <td className="py-4 px-6 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Botão Agendar Google Meet */}
                              <button
                                onClick={() => handleOpenSchedule(lead)}
                                className="p-2 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition cursor-pointer"
                                title="Agendar Reunião no Google Agenda"
                              >
                                <Calendar className="w-4 h-4" />
                              </button>

                              {/* Botão Enviar WhatsApp */}
                              {lead.telefone_escola && (
                                <button
                                  onClick={() => handleSendWhatsApp(lead)}
                                  className="p-2 rounded-xl text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                                  title="Enviar mensagem no WhatsApp"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                              )}

                              {/* Botão Enviar E-mail */}
                              <button
                                onClick={() => handleSendEmail(lead)}
                                disabled={isUpdating}
                                className="p-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                                title="Enviar E-mail automático via Gmail"
                              >
                                {isUpdating ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Mail className="w-4 h-4" />
                                )}
                              </button>

                              {/* Botão Editar */}
                              <button
                                onClick={() => handleOpenEditModal(lead)}
                                className="p-2 rounded-xl text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                                title="Editar dados da empresa"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Botão Deletar */}
                              <button
                                onClick={() => handleDeleteLead(lead.id)}
                                className="p-2 rounded-xl text-slate-400 dark:text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                title="Excluir empresa"
                              >
                                <Trash2 className="w-4 h-4" />
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
        )}
      </main>

      {/* MODAL DE CRUD */}
      <LeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLead}
        lead={selectedLead}
        mode={modalMode}
      />

      {/* MODAL DE AGENDAMENTO GOOGLE AGENDA */}
      <ScheduleMeetingModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        lead={scheduleLead}
        onConfirmScheduled={handleConfirmScheduled}
      />

      {/* MODAL DE AUTOMAÇÃO DE DISPAROS DE E-MAILS */}
      <AutoDispatcherModal
        isOpen={isAutoDispatcherOpen}
        onClose={() => setIsAutoDispatcherOpen(false)}
        onConfirm={handleStartAutoDispatch}
        isRunning={isAutoDispatching}
        totalPending={leads.filter((l) => l.status === 'novo' && (Boolean(l.email_decisor) || Boolean(l.email_escola))).length}
        progress={dispatchProgress}
      />
    </div>
  );
}
