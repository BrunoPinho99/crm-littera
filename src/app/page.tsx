import { getLeads } from '@/actions/leads';
import CRMTable from '@/components/CRMTable';
import HeaderNav from '@/components/HeaderNav';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  let leads = [];
  try {
    leads = await getLeads();
  } catch {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors duration-300">
      {/* Header com Toggle de Tema e Botão de Logout */}
      <HeaderNav />

      {/* Conteúdo com Menu Lateral Retrátil Flutuante */}
      <div className="flex-1 flex relative overflow-hidden">
        <CRMTable initialLeads={leads} />
      </div>
    </main>
  );
}
