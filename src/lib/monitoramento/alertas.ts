import { getAdminSupabase } from '@/lib/supabase/admin';
import { AlertaSistema, SeveridadeAlerta } from '@/types/database';
import { enviarEmail } from '@/lib/envio/enviarEmail';

export interface ParametrosRegistroAlerta {
  tipo: string;
  titulo: string;
  mensagem: string;
  severidade: SeveridadeAlerta;
  detalhes?: Record<string, unknown>;
}

export interface ParametrosEnvioEmailAlerta {
  tipo: string;
  assunto: string;
  titulo: string;
  mensagem: string;
  detalhes?: Record<string, unknown>;
}

/**
 * Retorna a data de hoje no fuso horário America/Sao_Paulo (YYYY-MM-DD).
 */
export function dataHojeSaoPaulo(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Retorna o horário atual em minutos desde 00:00 no fuso de São Paulo,
 * e se hoje é dia útil (segunda a sexta = 1 a 5).
 */
export function horarioAtualSP(): {
  hora: number;
  minuto: number;
  minutosDesdeMeiaNoite: number;
  diaSemana: number; // 0=domingo, 6=sabado
} {
  const now = new Date();
  const partFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });
  const parts = partFormatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  // Dia da semana em SP
  const spDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo' });
  const diaSemana = new Date(spDateStr).getDay();

  return {
    hora: hour,
    minuto: minute,
    minutosDesdeMeiaNoite: hour * 60 + minute,
    diaSemana,
  };
}

/**
 * Registra ou atualiza um alerta na tabela alertas_sistema.
 */
export async function registrarAlertaSistema(
  params: ParametrosRegistroAlerta
): Promise<AlertaSistema | null> {
  try {
    const supabase = getAdminSupabase();
    const { data: existente } = await supabase
      .from('alertas_sistema')
      .select('*')
      .eq('tipo', params.tipo)
      .eq('ativo', true)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente) {
      const { data: atualizado } = await supabase
        .from('alertas_sistema')
        .update({
          titulo: params.titulo,
          mensagem: params.mensagem,
          severidade: params.severidade,
          detalhes: params.detalhes || existente.detalhes,
        })
        .eq('id', existente.id)
        .select()
        .single();

      return atualizado as AlertaSistema;
    }

    const { data, error } = await supabase
      .from('alertas_sistema')
      .insert({
        tipo: params.tipo,
        titulo: params.titulo,
        mensagem: params.mensagem,
        severidade: params.severidade,
        detalhes: params.detalhes || {},
        ativo: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao inserir alerta_sistema:', error);
      return null;
    }

    return data as AlertaSistema;
  } catch (err) {
    console.error('Exceção ao registrar alerta_sistema:', err);
    return null;
  }
}

/**
 * Envia e-mail de alerta para NOTIFICAR_EMAIL garantindo no máximo 1 envio por tipo por dia.
 */
export async function enviarEmailAlertaSistema(
  params: ParametrosEnvioEmailAlerta
): Promise<boolean> {
  const destinatario = process.env.NOTIFICAR_EMAIL || 'bruno@grupolittera.com.br';
  const hojeSP = dataHojeSaoPaulo();
  const supabase = getAdminSupabase();

  try {
    // 1. Verifica se já enviamos e-mail deste tipo hoje
    const { data: alertaExistente } = await supabase
      .from('alertas_sistema')
      .select('id, ultimo_notificado_em')
      .eq('tipo', params.tipo)
      .not('ultimo_notificado_em', 'is', null)
      .order('ultimo_notificado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alertaExistente && alertaExistente.ultimo_notificado_em) {
      const dataUltimaNotificacao = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(alertaExistente.ultimo_notificado_em));

      if (dataUltimaNotificacao === hojeSP) {
        console.log(`[Alertas] Alerta do tipo "${params.tipo}" já notificado hoje (${hojeSP}). Ignorando envio repetido.`);
        return false;
      }
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const linkSaude = `${baseUrl}/saude`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <div style="background-color: #f8fafc; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h2 style="margin-top: 0; color: #b91c1c; font-size: 20px; border-bottom: 2px solid #ef4444; padding-bottom: 8px;">
            ⚠️ ${params.titulo}
          </h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">
            ${params.mensagem}
          </p>
          ${params.detalhes ? `
          <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-top: 16px; font-size: 13px; font-family: monospace; color: #0f172a;">
            <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(params.detalhes, null, 2)}</pre>
          </div>` : ''}
          <div style="margin-top: 24px; text-align: center;">
            <a href="${linkSaude}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">
              Acessar Painel de Saúde do CRM →
            </a>
          </div>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 12px;">
          Littera CRM • Alerta Automático de Monitoramento
        </p>
      </div>
    `;

    // Dispara via enviarEmail com flag de teste para ignorar restrições de funil de vendas
    const resultadoEnvio = await enviarEmail({
      para: destinatario,
      nomeDestinatario: 'Administrador Littera',
      assunto: params.assunto,
      texto: `${params.titulo}\n\n${params.mensagem}\n\nPainel de Saúde: ${linkSaude}`,
      html,
      isTeste: true,
    });

    if (resultadoEnvio.sucesso) {
      // Atualiza ultimo_notificado_em no registro de alerta_sistema
      const agora = new Date().toISOString();
      await supabase
        .from('alertas_sistema')
        .update({ ultimo_notificado_em: agora })
        .eq('tipo', params.tipo);

      console.log(`[Alertas] Notificação enviada com sucesso para ${destinatario} sobre alerta "${params.tipo}".`);
      return true;
    } else {
      console.error(`[Alertas] Falha no disparo de e-mail de alerta "${params.tipo}".`);
      return false;
    }
  } catch (err) {
    console.error(`[Alertas] Erro ao enviar e-mail de alerta do sistema "${params.tipo}":`, err);
    return false;
  }
}

/**
 * Varre as 7 regras de monitoramento definidas e dispara alertas quando detectadas.
 */
export async function verificarAlertasSistema(): Promise<{
  alertasGerados: number;
  alertasEnviados: number;
  detalhes: Array<{ tipo: string; mensagem: string }>;
}> {
  const supabase = getAdminSupabase();
  const hojeSP = dataHojeSaoPaulo();
  const spInfo = horarioAtualSP();
  const detalhes: Array<{ tipo: string; mensagem: string }> = [];
  let alertasEnviados = 0;

  // --------------------------------------------------------------------------
  // 1. Alerta: Agente diário com status 'erro' ou não executado até 08:00 em SP
  // --------------------------------------------------------------------------
  try {
    // Consulta última execução em rotinas_execucoes ou agente_execucoes de hoje
    const { data: ultExecAgente } = await supabase
      .from('agente_execucoes')
      .select('id, status, iniciado_em, finalizado_em, mensagem, detalhes')
      .order('iniciado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    let agenteComErro = false;
    let agenteAtrasado = false;
    let motivoAgente = '';

    if (ultExecAgente && ultExecAgente.status === 'erro') {
      const dataExec = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ultExecAgente.iniciado_em));

      if (dataExec === hojeSP) {
        agenteComErro = true;
        motivoAgente = `Agente SDR diário falhou na execução de hoje: ${ultExecAgente.mensagem || 'Erro interno'}`;
      }
    }

    // Se já passou das 08h00 em dia útil (seg a sex) e hoje não tem execução bem-sucedida
    const isDiaUtil = spInfo.diaSemana >= 1 && spInfo.diaSemana <= 5;
    if (isDiaUtil && spInfo.hora >= 8) {
      const { data: execSucessoHoje } = await supabase
        .from('agente_execucoes')
        .select('id')
        .eq('status', 'sucesso')
        .gte('iniciado_em', `${hojeSP}T00:00:00Z`)
        .limit(1)
        .maybeSingle();

      if (!execSucessoHoje && !agenteComErro) {
        agenteAtrasado = true;
        motivoAgente = `Agente SDR diário ainda não concluiu execução até às 08:00 em America/Sao_Paulo nesta data comercial (${hojeSP}).`;
      }
    }

    if (agenteComErro || agenteAtrasado) {
      const tipo = 'agente_diario';
      await registrarAlertaSistema({
        tipo,
        titulo: agenteComErro ? 'Falha na Execução do Agente Diário' : 'Atraso na Execução do Agente Diário',
        mensagem: motivoAgente,
        severidade: 'erro',
        detalhes: { data: hojeSP, ultExecAgente },
      });

      const enviado = await enviarEmailAlertaSistema({
        tipo,
        assunto: `[Littera CRM] ${agenteComErro ? 'Erro no Agente SDR Diário' : 'Atraso no Agente SDR Diário'}`,
        titulo: agenteComErro ? 'Erro no Agente SDR Diário' : 'Agente Diário Não Executado até 08:00',
        mensagem: motivoAgente,
        detalhes: { data: hojeSP, status: ultExecAgente?.status },
      });
      if (enviado) alertasEnviados++;
      detalhes.push({ tipo, mensagem: motivoAgente });
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de agente_diario:', err);
  }

  // --------------------------------------------------------------------------
  // 2. Alerta: Lote incompleto (com motivo)
  // --------------------------------------------------------------------------
  try {
    const { data: loteHoje } = await supabase
      .from('lotes_diarios')
      .select('id, data, quantidade, meta, motivo_incompleto')
      .eq('data', hojeSP)
      .maybeSingle();

    if (loteHoje && loteHoje.quantidade < loteHoje.meta && loteHoje.motivo_incompleto) {
      const tipo = 'lote_incompleto';
      const msg = `Lote diário de hoje (${hojeSP}) foi entregue incompleto: ${loteHoje.quantidade} de ${loteHoje.meta} leads. Motivo: ${loteHoje.motivo_incompleto}.`;

      await registrarAlertaSistema({
        tipo,
        titulo: 'Lote Diário Incompleto',
        mensagem: msg,
        severidade: 'aviso',
        detalhes: loteHoje,
      });

      const enviado = await enviarEmailAlertaSistema({
        tipo,
        assunto: `[Littera CRM] Alerta: Lote Diário Incompleto (${loteHoje.quantidade}/${loteHoje.meta})`,
        titulo: 'Lote Diário Entregue Incompleto',
        mensagem: msg,
        detalhes: loteHoje,
      });
      if (enviado) alertasEnviados++;
      detalhes.push({ tipo, mensagem: msg });
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de lote_incompleto:', err);
  }

  // --------------------------------------------------------------------------
  // 3. Alerta: Cron sem execução bem-sucedida há mais de 30 minutos em horário de envio
  // --------------------------------------------------------------------------
  try {
    const isDiaUtil = spInfo.diaSemana >= 1 && spInfo.diaSemana <= 5;
    // Horário de envio comercial: 08:00 às 18:00
    const isHorarioEnvio = isDiaUtil && spInfo.hora >= 8 && spInfo.hora < 18;

    if (isHorarioEnvio) {
      const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: ultCronSucesso } = await supabase
        .from('rotinas_execucoes')
        .select('id, finalizado_em')
        .eq('rotina', 'cron_sequencias')
        .eq('status', 'sucesso')
        .gte('finalizado_em', trintaMinAtras)
        .limit(1)
        .maybeSingle();

      if (!ultCronSucesso) {
        const tipo = 'cron_parado';
        const msg = `O cron de sequências (/api/cron/sequencias) não registra execução bem-sucedida há mais de 30 minutos durante a janela comercial de envio.`;

        await registrarAlertaSistema({
          tipo,
          titulo: 'Cron de Sequências Sem Execução',
          mensagem: msg,
          severidade: 'critico',
          detalhes: { horarioSP: `${spInfo.hora}:${spInfo.minuto}`, trintaMinAtras },
        });

        const enviado = await enviarEmailAlertaSistema({
          tipo,
          assunto: `[ALERTA CRÍTICO] Cron de Sequências Sem Execução Há Mais de 30 Minutos`,
          titulo: 'Cron de Sequências Inoperante em Horário Comercial',
          mensagem: msg,
          detalhes: { horaAtualSP: `${spInfo.hora}:${spInfo.minuto}` },
        });
        if (enviado) alertasEnviados++;
        detalhes.push({ tipo, mensagem: msg });
      }
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de cron_parado:', err);
  }

  // --------------------------------------------------------------------------
  // 4. Alerta: Bounce > 2% em 7 dias
  // --------------------------------------------------------------------------
  try {
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: totalEnviados } = await supabase
      .from('mensagens_enviadas')
      .select('id', { count: 'exact', head: true })
      .gte('enviado_em', seteDiasAtras);

    const { count: totalBounces } = await supabase
      .from('mensagens_enviadas')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'bounce')
      .gte('enviado_em', seteDiasAtras);

    const enviados = totalEnviados || 0;
    const bounces = totalBounces || 0;
    const taxaBounce = enviados >= 15 ? (bounces / enviados) * 100 : 0;

    if (taxaBounce > 2.0) {
      const tipo = 'bounce_alto';
      const msg = `Taxa global de bounce atingiu ${taxaBounce.toFixed(1)}% (${bounces} de ${enviados} envios nos últimos 7 dias), superando a tolerância de 2.0%.`;

      await registrarAlertaSistema({
        tipo,
        titulo: 'Taxa de Bounce Elevada (> 2%)',
        mensagem: msg,
        severidade: 'aviso',
        detalhes: { enviados, bounces, taxaBounce: taxaBounce.toFixed(2) },
      });

      const enviado = await enviarEmailAlertaSistema({
        tipo,
        assunto: `[Littera CRM] Alerta: Taxa de Bounce Elevada (${taxaBounce.toFixed(1)}%)`,
        titulo: 'Aumento na Taxa de Bounce nos Últimos 7 Dias',
        mensagem: msg,
        detalhes: { enviados, bounces, taxaBounce: taxaBounce.toFixed(2) },
      });
      if (enviado) alertasEnviados++;
      detalhes.push({ tipo, mensagem: msg });
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de bounce_alto:', err);
  }

  // --------------------------------------------------------------------------
  // 5. Alerta: Caixa desconectada ou desativada
  // --------------------------------------------------------------------------
  try {
    const { data: caixasDesativadas } = await supabase
      .from('caixas_envio')
      .select('id, email, nome, motivo_desativacao')
      .eq('ativo', false);

    if (caixasDesativadas && caixasDesativadas.length > 0) {
      const tipo = 'caixa_desconectada';
      const listaCaixas = caixasDesativadas.map((c) => `${c.email} (${c.motivo_desativacao || 'Sem motivo'})`).join(', ');
      const msg = `Existe(m) ${caixasDesativadas.length} caixa(s) de envio desconectada(s) ou desativada(s): ${listaCaixas}.`;

      await registrarAlertaSistema({
        tipo,
        titulo: 'Caixa(s) de Envio Desativada(s)',
        mensagem: msg,
        severidade: 'erro',
        detalhes: { caixasDesativadas },
      });

      const enviado = await enviarEmailAlertaSistema({
        tipo,
        assunto: `[Littera CRM] Alerta: ${caixasDesativadas.length} Caixa(s) de Envio Desativada(s)`,
        titulo: 'Caixa de Envio Desconectada ou Pausada',
        mensagem: msg,
        detalhes: { total: caixasDesativadas.length, caixas: caixasDesativadas },
      });
      if (enviado) alertasEnviados++;
      detalhes.push({ tipo, mensagem: msg });
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de caixa_desconectada:', err);
  }

  // --------------------------------------------------------------------------
  // 6. Alerta: Créditos do verificador ou custo diário perto do teto
  // --------------------------------------------------------------------------
  try {
    const maxCusto = parseFloat(process.env.MAX_CUSTO_DIARIO_USD || '5.0');
    const { data: custosHoje } = await supabase
      .from('custos_agente')
      .select('custo_usd')
      .gte('criado_em', `${hojeSP}T00:00:00Z`);

    const custoAcumuladoHoje = (custosHoje || []).reduce(
      (acc, c) => acc + (parseFloat(c.custo_usd) || 0),
      0
    );

    // Se custo hoje >= 80% do teto
    if (custoAcumuladoHoje >= maxCusto * 0.8) {
      const tipo = 'creditos_teto';
      const msg = `O custo diário do agente atingiu $${custoAcumuladoHoje.toFixed(2)} USD hoje, correspondendo a mais de 80% do teto diário fixado ($${maxCusto.toFixed(2)} USD).`;

      await registrarAlertaSistema({
        tipo,
        titulo: 'Custo Diário Próximo do Teto',
        mensagem: msg,
        severidade: 'aviso',
        detalhes: { custoAcumuladoHoje, maxCusto, porcentagem: ((custoAcumuladoHoje / maxCusto) * 100).toFixed(1) },
      });

      const enviado = await enviarEmailAlertaSistema({
        tipo,
        assunto: `[Littera CRM] Alerta: Custo Diário a 80%+ do Teto ($${custoAcumuladoHoje.toFixed(2)} / $${maxCusto.toFixed(2)})`,
        titulo: 'Consumo do Agente Próximo do Limite Diário',
        mensagem: msg,
        detalhes: { custoHoje: custoAcumuladoHoje, limite: maxCusto },
      });
      if (enviado) alertasEnviados++;
      detalhes.push({ tipo, mensagem: msg });
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de creditos_teto:', err);
  }

  // --------------------------------------------------------------------------
  // 7. Alerta: Base com menos de 5 dias de leads (< 5 * META_DIARIA)
  // --------------------------------------------------------------------------
  try {
    const metaDiaria = parseInt(process.env.META_DIARIA || '20', 10);
    const limite5Dias = metaDiaria * 5;

    // Escolas qualificadas (score não nulo, não descartadas, ainda não entregues)
    const { count: leadsDisponiveis } = await supabase
      .from('escolas')
      .select('id', { count: 'exact', head: true })
      .not('score', 'is', null)
      .eq('status_qualificacao', 'qualificado')
      .is('entregue_em', null);

    const totalEstoque = leadsDisponiveis || 0;
    const diasRestantes = (totalEstoque / metaDiaria).toFixed(1);

    if (totalEstoque < limite5Dias) {
      const tipo = 'base_baixa';
      const msg = `A base de leads qualificados possui estoque para apenas ${diasRestantes} dias (${totalEstoque} leads disponíveis; mínimo recomendado: ${limite5Dias} para 5 dias).`;

      await registrarAlertaSistema({
        tipo,
        titulo: 'Estoque de Leads da Base Crítico (< 5 dias)',
        mensagem: msg,
        severidade: 'aviso',
        detalhes: { leadsDisponiveis: totalEstoque, metaDiaria, diasRestantes },
      });

      const enviado = await enviarEmailAlertaSistema({
        tipo,
        assunto: `[Littera CRM] Alerta: Base de Leads com menos de 5 dias (${diasRestantes} dias restantes)`,
        titulo: 'Atenção ao Abastecimento de Leads',
        mensagem: msg,
        detalhes: { leadsDisponiveis: totalEstoque, diasRestantes },
      });
      if (enviado) alertasEnviados++;
      detalhes.push({ tipo, mensagem: msg });
    }
  } catch (err) {
    console.error('Erro na verificação de alerta de base_baixa:', err);
  }

  return {
    alertasGerados: detalhes.length,
    alertasEnviados,
    detalhes,
  };
}
