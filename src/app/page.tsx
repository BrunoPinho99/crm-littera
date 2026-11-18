import { getLeads } from '@/actions/leads';
import CRMTable from '@/components/CRMTable';
import HeaderAgentStatus from '@/components/HeaderAgentStatus';
import { Sparkles, ShieldCheck } from 'lucide-react';

export default async function DashboardPage() {
  const leads = await getLeads();

  return (
    <main className="min-h-screen bg-[#09090b] text-neutral-100 selection:bg-neutral-800 selection:text-white">
      {/* Barra superior de navegação / cabeçalho */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-blue-500/20">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-100 tracking-tight text-sm">Littera CRM</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
                  Escolas B2B
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-neutral-400">
            {/* Mascote pequeno no topo com alternância de estados */}
            <HeaderAgentStatus />

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Supabase RLS</span>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Título e Subtítulo */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Prospecção Automatizada Brasília - DF</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
              Pipeline de Prospecção Escolar
            </h1>
            <p className="text-sm text-neutral-400 mt-1 max-w-2xl leading-relaxed">
              Monitore os leads educacionais extraídos diariamente via agente autônomo, dispare contatos com copy comercial validada e converta em reuniões de demonstração.
            </p>
          </div>
        </div>

        {/* Tabela Interativa de Leads */}
        <CRMTable initialLeads={leads} />
      </div>
    </main>
  );
}
