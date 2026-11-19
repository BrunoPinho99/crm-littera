import { getLeads } from '@/actions/leads';
import CRMTable from '@/components/CRMTable';
import HeaderNav from '@/components/HeaderNav';

export default async function DashboardPage() {
  const leads = await getLeads();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors duration-300">
      {/* Header com Toggle de Tema */}
      <HeaderNav />

      {/* Conteúdo com Menu Lateral Retrátil Flutuante (sem empurrar conteúdo) */}
      <div className="flex-1 flex relative overflow-hidden">
        <CRMTable initialLeads={leads} />
      </div>
    </main>
  );
}
