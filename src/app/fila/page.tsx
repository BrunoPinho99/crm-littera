import { requireUser } from '@/lib/auth';
import { getFilaEnviosAction } from '@/actions/sequencias';
import FilaClient from './FilaClient';

export const metadata = {
  title: 'Fila de Envios & Aprovação | Littera CRM',
  description: 'Gerencie a fila de e-mails da sequência de cadência com revisão e aprovação antes do disparo',
};

export default async function FilaPage() {
  await requireUser();
  const itensIniciais = await getFilaEnviosAction('aguardando_aprovacao');

  return <FilaClient initialItens={itensIniciais} />;
}
