import { getAdminSupabase } from '@/lib/supabase/admin';
import { registrarAlertaSistema, enviarEmailAlertaSistema } from './alertas';

export interface MetricasEntregabilidadeCaixa {
  caixaId: string;
  email: string;
  nome: string;
  ativo: boolean;
  enviados: number;
  bounces: number;
  descadastros: number;
  respostas: number;
  taxaBounce: number; // Porcentagem
  taxaDescadastro: number; // Porcentagem
  taxaResposta: number; // Porcentagem
  desativadaNestaRodada: boolean;
  motivoDesativacao?: string;
}

/**
 * Calcula as métricas de entregabilidade por caixa nos últimos X dias (padrão: 7 dias).
 * Se bounce > 3% (com pelo menos 30 envios) ou reclamação de spam detectada:
 * - A caixa é automaticamente desativada (ativo = false) com motivo.
 * - Registra alerta de sistema e envia e-mail de notificação.
 */
export async function verificarEProtegerEntregabilidadeCaixas(
  dias = 7
): Promise<{
  caixasVerificadas: number;
  caixasDesativadas: string[];
  metricas: MetricasEntregabilidadeCaixa[];
}> {
  const supabase = getAdminSupabase();
  const dataCorte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  // 1. Busca todas as caixas de envio
  const { data: caixas, error: caixasError } = await supabase
    .from('caixas_envio')
    .select('id, email, nome, ativo, motivo_desativacao');

  if (caixasError || !caixas) {
    console.error('Erro ao buscar caixas_envio para monitoramento:', caixasError);
    return { caixasVerificadas: 0, caixasDesativadas: [], metricas: [] };
  }

  const metricas: MetricasEntregabilidadeCaixa[] = [];
  const caixasDesativadas: string[] = [];

  for (const caixa of caixas) {
    // a) Total de e-mails enviados nos últimos X dias
    const { count: enviadosCount } = await supabase
      .from('mensagens_enviadas')
      .select('id', { count: 'exact', head: true })
      .eq('caixa_id', caixa.id)
      .gte('enviado_em', dataCorte);

    const enviados = enviadosCount || 0;

    // b) Total de bounces detectados nos últimos X dias
    const { count: bouncesCount } = await supabase
      .from('mensagens_enviadas')
      .select('id', { count: 'exact', head: true })
      .eq('caixa_id', caixa.id)
      .eq('status', 'bounce')
      .gte('enviado_em', dataCorte);

    const bounces = bouncesCount || 0;

    // c) Descadastros associados às mensagens enviadas por esta caixa
    // Busca IDs das mensagens para cruzar com interacoes de descadastro
    const { count: descadastrosCount } = await supabase
      .from('respostas_recebidas')
      .select('id', { count: 'exact', head: true })
      .eq('caixa_email', caixa.email)
      .eq('classificacao', 'descadastro')
      .gte('recebido_em', dataCorte);

    const descadastros = descadastrosCount || 0;

    // d) Respostas recebidas nesta caixa
    const { count: respostasCount } = await supabase
      .from('respostas_recebidas')
      .select('id', { count: 'exact', head: true })
      .eq('caixa_email', caixa.email)
      .not('classificacao', 'in', '("bounce","resposta_automatica")')
      .gte('recebido_em', dataCorte);

    const respostas = respostasCount || 0;

    const taxaBounce = enviados > 0 ? (bounces / enviados) * 100 : 0;
    const taxaDescadastro = enviados > 0 ? (descadastros / enviados) * 100 : 0;
    const taxaResposta = enviados > 0 ? (respostas / enviados) * 100 : 0;

    let desativada = false;
    let motivo: string | undefined;

    // Regra estrita: bounce > 3% com pelo menos 30 envios OU reclamação explícita
    if (caixa.ativo && enviados >= 30 && taxaBounce > 3.0) {
      desativada = true;
      motivo = `Taxa de bounce crítica (${taxaBounce.toFixed(1)}% em ${enviados} envios nos últimos ${dias} dias - limite: 3%)`;
    }

    if (desativada) {
      console.warn(`[Entregabilidade] Desativando caixa ${caixa.email}: ${motivo}`);
      await supabase
        .from('caixas_envio')
        .update({
          ativo: false,
          motivo_desativacao: motivo,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', caixa.id);

      caixasDesativadas.push(caixa.email);

      // Registra alerta no sistema
      await registrarAlertaSistema({
        tipo: 'caixa_desconectada',
        titulo: `Caixa desativada por proteção de reputação: ${caixa.email}`,
        mensagem: `A caixa ${caixa.email} foi desativada automaticamente para proteger o domínio. Motivo: ${motivo}`,
        severidade: 'critico',
        detalhes: {
          caixaId: caixa.id,
          email: caixa.email,
          enviados,
          bounces,
          taxaBounce: taxaBounce.toFixed(2),
          motivo,
        },
      });

      // Envia notificação por e-mail
      await enviarEmailAlertaSistema({
        tipo: 'caixa_desconectada',
        assunto: `[ALERTA CRÍTICO] Caixa de envio desativada: ${caixa.email}`,
        titulo: `Caixa Desativada: ${caixa.email}`,
        mensagem: `A caixa ${caixa.email} atingiu taxa de bounce de ${taxaBounce.toFixed(1)}% (${bounces} de ${enviados} envios em ${dias} dias) e foi pausada automaticamente pelo sistema para evitar bloqueios de SPF/DKIM pelos provedores. O motor de sequências não utilizará mais esta caixa até sua reativação manual.`,
      });
    }

    metricas.push({
      caixaId: caixa.id,
      email: caixa.email,
      nome: caixa.nome,
      ativo: desativada ? false : caixa.ativo,
      enviados,
      bounces,
      descadastros,
      respostas,
      taxaBounce: Number(taxaBounce.toFixed(2)),
      taxaDescadastro: Number(taxaDescadastro.toFixed(2)),
      taxaResposta: Number(taxaResposta.toFixed(2)),
      desativadaNestaRodada: desativada,
      motivoDesativacao: motivo || caixa.motivo_desativacao,
    });
  }

  return {
    caixasVerificadas: caixas.length,
    caixasDesativadas,
    metricas,
  };
}
