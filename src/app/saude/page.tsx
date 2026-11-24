import { requireUser } from '@/lib/auth';
import HeaderNav from '@/components/HeaderNav';
import { getDadosPainelSaudeAction } from '@/actions/saude';
import SaudeClient from './SaudeClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Saúde do Sistema & Monitoramento | Littera CRM',
  description: 'Monitoramento em tempo real de rotinas, entregabilidade de e-mails, alertas e funil de conversão.',
};

export default async function SaudePage() {
  await requireUser();

  const dadosIniciais = await getDadosPainelSaudeAction();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors duration-300">
      <HeaderNav />
      <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full">
        <SaudeClient initialDados={dadosIniciais} />
      </div>
    </main>
  );
}
