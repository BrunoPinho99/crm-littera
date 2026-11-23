import { requireUser } from '@/lib/auth';
import { getLembretesAction } from '@/actions/respostas';
import LembretesClient from './LembretesClient';

export const metadata = {
  title: 'Lembretes de Retorno | Littera CRM',
  description: 'Acompanhe lembretes gerados por respostas de contatos (retornos futuros, férias, follow-up agendado)',
};

export default async function LembretesPage() {
  await requireUser();
  const lembretesIniciais = await getLembretesAction('todos');

  return <LembretesClient initialLembretes={lembretesIniciais} />;
}
