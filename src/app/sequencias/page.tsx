import { requireUser } from '@/lib/auth';
import { getSequenciaComPassosAction, getEscolasParaPreviewAction } from '@/actions/sequencias';
import SequenciasClient from './SequenciasClient';

export const metadata = {
  title: 'Configurações de Sequências & Cadência | Littera CRM',
  description: 'Gerencie a sequência padrão de 5 toques, editor de templates, modo de aprovação e métricas',
};

export default async function SequenciasPage() {
  await requireUser();
  const [{ sequencia, passos, metricas }, escolasPreview] = await Promise.all([
    getSequenciaComPassosAction(),
    getEscolasParaPreviewAction(),
  ]);

  return (
    <SequenciasClient
      initialSequencia={sequencia}
      initialPassos={passos}
      initialMetricas={metricas}
      escolasPreview={escolasPreview}
    />
  );
}
