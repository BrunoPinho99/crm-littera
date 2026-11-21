import { requireUser } from '@/lib/auth';
import { getConfigScores } from '@/lib/repositorio/config_score';
import ScoreConfigClient from './ScoreConfigClient';

export const metadata = {
  title: 'Configuração de Score | Littera CRM',
  description: 'Ajuste de pesos e regras de pontuação de leads escolares',
};

export default async function ScoreConfigPage() {
  await requireUser();
  const configs = await getConfigScores();

  return <ScoreConfigClient initialConfigs={configs} />;
}
