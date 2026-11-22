import { requireUser } from '@/lib/auth';
import HeaderNav from '@/components/HeaderNav';
import { getHistoricoExecucoesAction, getLoteHojeAction, getLastAgentExecution } from '@/actions/leads';
import AgenteClient from './AgenteClient';

export const metadata = {
  title: 'Histórico do Agente SDR | Littera CRM',
  description: 'Histórico detalhado de execuções, entregas de leads diárias e custos do Agente SDR',
};

export default async function AgentePage() {
  await requireUser();

  const [historico, loteHoje, ultimaExecucao] = await Promise.all([
    getHistoricoExecucoesAction(50),
    getLoteHojeAction(),
    getLastAgentExecution(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors duration-300">
      <HeaderNav />
      <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full">
        <AgenteClient
          initialHistorico={historico}
          initialLoteHoje={loteHoje}
          initialUltimaExecucao={ultimaExecucao}
        />
      </div>
    </main>
  );
}
