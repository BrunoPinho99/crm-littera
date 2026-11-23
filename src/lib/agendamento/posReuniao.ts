import { extrairComponentesSP } from '@/lib/sequencias/janelas';
import { ResultadoReuniao, Reuniao } from '@/types/database';

/**
 * Calcula a data no formato YYYY-MM-DD do próximo dia útil (ignora fins de semana e feriados)
 */
export function calcularProximoDiaUtil(
  dataBase: Date = new Date(),
  feriadosSet: Set<string> = new Set()
): string {
  // Começa a verificar a partir de amanhã
  let iterDate = new Date(dataBase.getTime() + 24 * 60 * 60 * 1000);

  for (let i = 0; i < 30; i++) {
    const comp = extrairComponentesSP(iterDate);
    const ehFimDeSemana = comp.diaSemana === 0 || comp.diaSemana === 6;
    const ehFeriado = feriadosSet.has(comp.dataStr);

    if (!ehFimDeSemana && !ehFeriado) {
      return comp.dataStr;
    }

    iterDate = new Date(iterDate.getTime() + 24 * 60 * 60 * 1000);
  }

  // Fallback seguro caso atinja 30 dias
  return iterDate.toISOString().split('T')[0];
}

/**
 * Rotina executada periodicamente pelo cron:
 * Encontra reuniões cujo término ocorreu há mais de 1 hora,
 * com status 'agendada' ou 'remarcada', e marca pendente_registro = true.
 */
export async function marcarReunioesPendentesRegistro(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any
): Promise<{
  sucesso: boolean;
  totalMarcadas: number;
  erros: string[];
}> {
  try {
    const db = dbClient || (await import('@/lib/supabase/admin')).supabaseAdmin;
    const agora = new Date();
    // 1 hora atrás
    const limiteUmaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000).toISOString();

    const { data: reunioesPassadas, error } = await db
      .from('reunioes')
      .select('id, fim, status, pendente_registro')
      .in('status', ['agendada', 'remarcada'])
      .lte('fim', limiteUmaHoraAtras)
      .eq('pendente_registro', false);

    if (error) {
      console.error('Erro ao buscar reuniões para marcar pendência de pós-reunião:', error);
      return { sucesso: false, totalMarcadas: 0, erros: [error.message] };
    }

    if (!reunioesPassadas || reunioesPassadas.length === 0) {
      return { sucesso: true, totalMarcadas: 0, erros: [] };
    }

    const idsParaAtualizar = reunioesPassadas.map((r: { id: string }) => r.id);

    const { error: updError } = await db
      .from('reunioes')
      .update({
        pendente_registro: true,
        atualizado_em: agora.toISOString(),
      })
      .in('id', idsParaAtualizar);

    if (updError) {
      console.error('Erro ao atualizar flag pendente_registro em reunioes:', updError);
      return { sucesso: false, totalMarcadas: 0, erros: [updError.message] };
    }

    return {
      sucesso: true,
      totalMarcadas: idsParaAtualizar.length,
      erros: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Exceção em marcarReunioesPendentesRegistro:', err);
    return { sucesso: false, totalMarcadas: 0, erros: [msg] };
  }
}

export interface RegistrarResultadoPosReuniaoParams {
  reuniaoId: string;
  status: 'realizada' | 'nao_compareceu';
  resultado?: ResultadoReuniao | null;
  notas?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}

/**
 * Registra o desfecho pós-reunião preenchido pelo usuário via modal no CRM:
 * - Se 'realizada': grava status 'realizada', resultado da reunião, notas e limpa pendência
 * - Se 'nao_compareceu': grava status 'nao_compareceu', notas, limpa pendência e
 *   cria um lembrete no próximo dia útil para reagendar a reunião com a escola.
 */
export async function registrarResultadoPosReuniao(
  params: RegistrarResultadoPosReuniaoParams
): Promise<{ sucesso: boolean; reuniao?: Reuniao; erro?: string }> {
  try {
    const { reuniaoId, status, resultado = null, notas = null, dbClient } = params;

    if (!reuniaoId) {
      return { sucesso: false, erro: 'ID da reunião é obrigatório.' };
    }

    if (status !== 'realizada' && status !== 'nao_compareceu') {
      return { sucesso: false, erro: 'Status pós-reunião deve ser "realizada" ou "nao_compareceu".' };
    }

    const db = dbClient || (await import('@/lib/supabase/admin')).supabaseAdmin;

    // Busca a reunião atual
    const { data: reuniao, error: fetchErr } = await db
      .from('reunioes')
      .select('*, escolas(id, nome)')
      .eq('id', reuniaoId)
      .maybeSingle();

    if (fetchErr || !reuniao) {
      return { sucesso: false, erro: `Reunião não encontrada: ${fetchErr?.message || ''}` };
    }

    const agoraIso = new Date().toISOString();

    // 1. Atualiza a reunião
    const payloadUpdate: Partial<Reuniao> = {
      status,
      resultado: status === 'realizada' ? resultado : null,
      notas: notas || reuniao.notas || null,
      pendente_registro: false,
      atualizado_em: agoraIso,
    };

    const { data: updated, error: updErr } = await db
      .from('reunioes')
      .update(payloadUpdate)
      .eq('id', reuniaoId)
      .select()
      .single();

    if (updErr || !updated) {
      return { sucesso: false, erro: `Erro ao salvar pós-reunião: ${updErr?.message}` };
    }

    const escolaId = reuniao.escola_id;
    const nomeEscola = reuniao.escolas?.nome || 'Escola';

    // 2. Se status for 'realizada', registra interação 'reuniao_realizada'
    if (status === 'realizada' && escolaId) {
      const rotuloResultado: Record<string, string> = {
        proposta_enviada: 'Proposta Enviada',
        teste_gratuito: 'Teste Gratuito Iniciado',
        fechado: 'Negócio Fechado (Venda Realizada)',
        sem_fit: 'Sem Fit / Descartado',
        followup: 'Follow-up Agendado',
      };

      await db.from('interacoes').insert({
        escola_id: escolaId,
        contato_id: reuniao.contato_id || null,
        tipo: 'reuniao_realizada',
        assunto: `Reunião realizada: ${nomeEscola}`,
        conteudo: `Reunião concluída. Desfecho: ${
          resultado ? rotuloResultado[resultado] || resultado : 'Registrada'
        }.${notas ? ` Notas: ${notas}` : ''}`,
        metadata: {
          reuniao_id: reuniaoId,
          resultado,
          notas,
        },
        criado_em: agoraIso,
      });

      // Atualiza ultima_interacao na escola
      await db
        .from('escolas')
        .update({ ultima_interacao: agoraIso })
        .eq('id', escolaId);
    }

    // 3. Se status for 'nao_compareceu', cria lembrete para o próximo dia útil
    if (status === 'nao_compareceu' && escolaId) {
      const proximoDiaUtilStr = calcularProximoDiaUtil(new Date());

      await db.from('lembretes').insert({
        escola_id: escolaId,
        contato_id: reuniao.contato_id || null,
        data: proximoDiaUtilStr,
        texto: `Não compareceu na reunião: ${nomeEscola} — tentar reagendar`,
        concluido: false,
        criado_em: agoraIso,
      });

      await db.from('interacoes').insert({
        escola_id: escolaId,
        contato_id: reuniao.contato_id || null,
        tipo: 'mudanca_status',
        assunto: `Lead não compareceu à reunião: ${nomeEscola}`,
        conteudo: `Lead ausente na reunião agendada. Lembrete criado para o próximo dia útil (${proximoDiaUtilStr}) para tentativa de reagendamento.${
          notas ? ` Notas: ${notas}` : ''
        }`,
        metadata: {
          reuniao_id: reuniaoId,
          nao_compareceu: true,
          lembrete_data: proximoDiaUtilStr,
        },
        criado_em: agoraIso,
      });

      await db
        .from('escolas')
        .update({ ultima_interacao: agoraIso })
        .eq('id', escolaId);
    }

    return {
      sucesso: true,
      reuniao: updated as Reuniao,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erro em registrarResultadoPosReuniao:', err);
    return { sucesso: false, erro: msg };
  }
}
