import { requireUser } from '@/lib/auth';
import { getCaixasEnvioAction } from '@/actions/email-config';
import EmailConfigClient from './EmailConfigClient';

export const metadata = {
  title: 'Configurações de E-mail & Entregabilidade | Littera CRM',
  description: 'Gerenciamento de caixas de envio, plano de aquecimento e validação SPF/DKIM/DMARC',
};

export default async function EmailConfigPage() {
  await requireUser();
  const { caixas, userEmail } = await getCaixasEnvioAction();

  return <EmailConfigClient initialCaixas={caixas} userEmail={userEmail} />;
}
