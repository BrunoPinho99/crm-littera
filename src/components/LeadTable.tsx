"use client";

import { useMemo, useState, useTransition } from "react";
import { markLeadAsContacted } from "@/app/actions";

export type Lead = {
  id: string;
  nome_escola: string;
  cidade: string | null;
  telefone_escola: string | null;
  email_escola: string | null;
  nome_decisor: string | null;
  email_decisor: string | null;
  status: "novo" | "contato_enviado" | "respondido" | "reuniao_agendada";
  ultima_interacao: string | null;
};

const STATUS_FILTERS = [
  { label: "Novos", status: "novo" },
  { label: "Contactados", status: "contato_enviado" },
  { label: "Reunião", status: "reuniao_agendada" },
] as const;

const STATUS_LABELS: Record<Lead["status"], string> = {
  novo: "Novo",
  contato_enviado: "Contactado",
  respondido: "Respondido",
  reuniao_agendada: "Reunião",
};

export default function LeadTable({ leads }: { leads: Lead[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        !query || lead.nome_escola.toLowerCase().includes(query);
      const matchesStatus =
        !statusFilter || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  function sendEmail(lead: Lead) {
    const recipient = lead.email_decisor || lead.email_escola;
    if (!recipient) return;

    const subject = encodeURIComponent(
      `Uma nova experiência digital para ${lead.nome_escola}`,
    );
    const body = encodeURIComponent(
      `Olá${lead.nome_decisor ? `, ${lead.nome_decisor}` : ""},\n\n` +
        `Sou da Littera e ajudo escolas a aproximar famílias, professores e alunos com uma plataforma educacional simples, moderna e completa.\n\n` +
        `Gostaria de apresentar em uma conversa rápida como podemos apoiar a ${lead.nome_escola} em suas iniciativas digitais.\n\n` +
        `Posso lhe enviar uma apresentação ou agendar uma demonstração?\n\n` +
        `Atenciosamente,\nEquipe Littera`,
    );

    startTransition(async () => {
      await markLeadAsContacted(lead.id);
      window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar escola</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome da escola"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm outline-none transition focus:border-indigo-400"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={`h-11 rounded-xl px-4 text-sm transition ${
              statusFilter === null
                ? "bg-white text-black"
                : "border border-white/10 text-zinc-300 hover:bg-white/5"
            }`}
          >
            Todos
          </button>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.status}
              type="button"
              onClick={() => setStatusFilter(filter.status)}
              className={`h-11 rounded-xl px-4 text-sm transition ${
                statusFilter === filter.status
                  ? "bg-indigo-500 text-white"
                  : "border border-white/10 text-zinc-300 hover:bg-white/5"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/[0.03] text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-medium">Escola</th>
                <th className="px-6 py-4 font-medium">Contato</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-white/[0.025]">
                  <td className="px-6 py-5">
                    <div className="font-medium text-white">{lead.nome_escola}</div>
                    <div className="mt-1 text-zinc-500">
                      {lead.cidade || "Brasília"}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div>{lead.email_decisor || lead.email_escola || "Sem e-mail"}</div>
                    <div className="mt-1 text-zinc-500">
                      {lead.telefone_escola || "Sem telefone"}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      {STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button
                      type="button"
                      disabled={
                        isPending ||
                        !(lead.email_decisor || lead.email_escola)
                      }
                      onClick={() => sendEmail(lead)}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Enviar E-mail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLeads.length === 0 && (
          <p className="px-6 py-10 text-center text-zinc-500">
            Nenhum lead encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
