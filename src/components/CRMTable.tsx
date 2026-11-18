'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { LeadEscolar } from '@/types/database';
import { markContactSent } from '@/actions/leads';
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
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface CRMTableProps {
  initialLeads: LeadEscolar[];
}

type FilterStatus = 'todos' | 'novo' | 'contato_enviado' | 'reuniao_agendada';

export default function CRMTable({ initialLeads }: CRMTableProps) {
  const [leads, setLeads] = useState<LeadEscolar[]>(initialLeads);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('todos');
  const [isPending, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtros em tempo real
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.nome_escola.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.email_escola && lead.email_escola.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.nome_decisor && lead.nome_decisor.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        statusFilter === 'todos' ? true : lead.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [leads, searchTerm, statusFilter]);

  // Contadores para métricas
  const counts = useMemo(() => {
    return {
      total: leads.length,
      novos: leads.filter((l) => l.status === 'novo').length,
      contactados: leads.filter((l) => l.status === 'contato_enviado').length,
      reuniao: leads.filter((l) => l.status === 'reuniao_agendada').length,
    };
  }, [leads]);

  const handleSendEmail = (lead: LeadEscolar) => {
    const recipient = lead.email_decisor || lead.email_escola || '';
    const schoolName = lead.nome_escola;
    const recipientName = lead.nome_decisor ? lead.nome_decisor : 'Equipe Pedagógica / Direção';

    // Assunto e corpo do email com copywriting persuasivo B2B educacional
    const subject = encodeURIComponent(
      `Inovação Pedagógica & Gestão Digital: Apresentação para ${schoolName}`
    );
    const body = encodeURIComponent(
      `Olá, ${recipientName},\n\n` +
      `Espero que este e-mail o encontre bem.\n\n` +
      `Acompanho a trajetória de excelência e dedicação do ${schoolName} em Brasília e gostaria de apresentar como nossa plataforma educacional tem auxiliado instituições de ponta a otimizar o engajamento dos alunos e simplificar rotinas acadêmicas.\n\n` +
      `Gostaria de agendar uma breve conversa de 15 minutos esta semana para demonstrar como escolas parceiras aumentaram a retenção e facilitaram a comunicação com as famílias.\n\n` +
      `Qual seria o melhor dia e horário para conversarmos?\n\n` +
      `Atenciosamente,\n` +
      `Equipe Littera Educacional\n` +
      `contato@littera.edu.br | Brasília - DF`
    );

    const mailtoUrl = `mailto:${recipient}?subject=${subject}&body=${body}`;

    // Atualiza otimisticamente na UI e chama a Server Action
    setUpdatingId(lead.id);
    startTransition(async () => {
      // Abre cliente de email padrão
      window.location.href = mailtoUrl;

      const res = await markContactSent(lead.id);
      if (res.success) {
        setLeads((prev) =>
          prev.map((item) =>
            item.id === lead.id
              ? { ...item, status: 'contato_enviado', ultima_interacao: new Date().toISOString() }
              : item
          )
        );
      }
      setUpdatingId(null);
    });
  };

  const renderBadge = (status: LeadEscolar['status']) => {
    switch (status) {
      case 'novo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Novo
          </span>
        );
      case 'contato_enviado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Send className="w-3 h-3" />
            Contato Enviado
          </span>
        );
      case 'respondido':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <MessageSquareCheck className="w-3 h-3" />
            Respondido
          </span>
        );
      case 'reuniao_agendada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Calendar className="w-3 h-3" />
            Reunião Agendada
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Total de Leads</span>
            <Building2 className="w-4 h-4 text-neutral-500" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-100">{counts.total}</div>
          <p className="text-xs text-neutral-500 mt-1">Escolas mapeadas em Brasília</p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-emerald-400 font-medium">Novos Leads</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-100">{counts.novos}</div>
          <p className="text-xs text-neutral-500 mt-1">Aguardando 1º contato comercial</p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-blue-400 font-medium">Contactados</span>
            <Send className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-100">{counts.contactados}</div>
          <p className="text-xs text-neutral-500 mt-1">Apresentação enviada via e-mail</p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-amber-400 font-medium">Reuniões</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-100">{counts.reuniao}</div>
          <p className="text-xs text-neutral-500 mt-1">Demonstrações agendadas</p>
        </div>
      </div>

      {/* Controles: Busca e Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-neutral-900/40 p-4 rounded-2xl border border-neutral-800">
        {/* Barra de Busca */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar por escola, decisor ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-700 focus:border-neutral-700 transition"
          />
        </div>

        {/* Botões de Filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('todos')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'todos'
                ? 'bg-neutral-100 text-neutral-950 shadow-sm'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 border border-neutral-800'
            }`}
          >
            Todos ({counts.total})
          </button>
          <button
            onClick={() => setStatusFilter('novo')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'novo'
                ? 'bg-emerald-500 text-neutral-950 font-semibold'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 border border-neutral-800'
            }`}
          >
            Novos ({counts.novos})
          </button>
          <button
            onClick={() => setStatusFilter('contato_enviado')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'contato_enviado'
                ? 'bg-blue-500 text-white font-semibold'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 border border-neutral-800'
            }`}
          >
            Contactados ({counts.contactados})
          </button>
          <button
            onClick={() => setStatusFilter('reuniao_agendada')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'reuniao_agendada'
                ? 'bg-amber-500 text-neutral-950 font-semibold'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 border border-neutral-800'
            }`}
          >
            Reunião ({counts.reuniao})
          </button>
        </div>
      </div>

      {/* Tabela de Leads */}
      <div className="border border-neutral-800 rounded-2xl overflow-hidden bg-neutral-950/40 backdrop-blur-md shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900/60 text-neutral-400 uppercase text-[11px] tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-4 px-6 font-medium">Escola & Cidade</th>
                <th className="py-4 px-6 font-medium">Contato</th>
                <th className="py-4 px-6 font-medium">Decisor</th>
                <th className="py-4 px-6 font-medium">Status</th>
                <th className="py-4 px-6 font-medium">Última Interação</th>
                <th className="py-4 px-6 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-neutral-500">
                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30 stroke-[1.5]" />
                    <p className="text-base font-medium text-neutral-400">Nenhum lead encontrado</p>
                    <p className="text-xs text-neutral-600 mt-1">Ajuste os filtros ou aguarde a execução do agente diário.</p>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const isUpdating = updatingId === lead.id;
                  return (
                    <tr 
                      key={lead.id} 
                      className="hover:bg-neutral-900/40 transition-colors group"
                    >
                      {/* Escola */}
                      <td className="py-4 px-6">
                        <div className="font-semibold text-neutral-100 group-hover:text-blue-400 transition-colors">
                          {lead.nome_escola}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-neutral-500 mt-0.5">
                          <MapPin className="w-3 h-3 text-neutral-600" />
                          <span>{lead.cidade}</span>
                        </div>
                      </td>

                      {/* Contato Geral */}
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1 text-xs">
                          {lead.email_escola ? (
                            <a 
                              href={`mailto:${lead.email_escola}`}
                              className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-white transition"
                            >
                              <Mail className="w-3.5 h-3.5 text-neutral-500" />
                              <span className="truncate max-w-[190px]">{lead.email_escola}</span>
                            </a>
                          ) : (
                            <span className="text-neutral-600 italic text-[11px]">E-mail não informado</span>
                          )}

                          {lead.telefone_escola ? (
                            <span className="inline-flex items-center gap-1.5 text-neutral-400">
                              <Phone className="w-3.5 h-3.5 text-neutral-500" />
                              <span>{lead.telefone_escola}</span>
                            </span>
                          ) : (
                            <span className="text-neutral-600 italic text-[11px]">Telefone não informado</span>
                          )}
                        </div>
                      </td>

                      {/* Decisor */}
                      <td className="py-4 px-6">
                        {lead.nome_decisor ? (
                          <div>
                            <div className="font-medium text-neutral-200 text-xs">{lead.nome_decisor}</div>
                            {lead.email_decisor && (
                              <div className="text-[11px] text-neutral-500 truncate max-w-[160px]">
                                {lead.email_decisor}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-600 text-xs">A identificar</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        {renderBadge(lead.status)}
                      </td>

                      {/* Última Interação */}
                      <td className="py-4 px-6 text-xs text-neutral-400">
                        {lead.ultima_interacao ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-neutral-600" />
                            <span>{new Date(lead.ultima_interacao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Ação: Enviar Email */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleSendEmail(lead)}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-neutral-100 hover:bg-white text-neutral-950 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm hover:shadow"
                          title="Abrir e-mail com copy comercial e marcar como enviado"
                        >
                          {isUpdating ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Mail className="w-3.5 h-3.5 text-neutral-800" />
                          )}
                          <span>Enviar E-mail</span>
                        </button>
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
  );
}
