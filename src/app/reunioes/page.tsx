import { redirect } from 'next/navigation';
import { getReunioesAction } from '@/actions/reunioes';
import { getEscolasComContatos } from '@/lib/repositorio/escolas';
import HeaderNav from '@/components/HeaderNav';
import ReunioesClient from './ReunioesClient';

export const dynamic = 'force-dynamic';

export default async function ReunioesPage() {
  let reunioes = [];
  let escolas = [];

  try {
    [reunioes, escolas] = await Promise.all([
      getReunioesAction(),
      getEscolasComContatos(),
    ]);
  } catch (err) {
    console.error('Erro ao carregar reuniões:', err);
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors duration-300">
      <HeaderNav />
      <div className="flex-1 flex relative overflow-hidden">
        <ReunioesClient initialReunioes={reunioes} escolas={escolas} />
      </div>
    </main>
  );
}
