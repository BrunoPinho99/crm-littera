import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { AgenteExecucao, LoteDiario } from '@/types/database';

export function getTodaySaoPaulo(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export async function getLoteDiarioHoje(): Promise<LoteDiario | null> {
  const supabase = await createServerSupabaseClient();
  const hoje = getTodaySaoPaulo();

  try {
    const { data, error } = await supabase
      .from('lotes_diarios')
      .select('*')
      .eq('data', hoje)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar lote_diario de hoje:', error);
      return null;
    }

    return (data as LoteDiario) || null;
  } catch (err) {
    console.error('Falha na consulta ao lotes_diarios:', err);
    return null;
  }
}

export async function getHistoricoExecucoes(limit = 50): Promise<AgenteExecucao[]> {
  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('agente_execucoes')
      .select('*')
      .order('iniciado_em', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Erro ao buscar histórico de agente_execucoes:', error);
      return [];
    }

    return (data as AgenteExecucao[]) || [];
  } catch (err) {
    console.error('Falha na consulta de histórico do agente:', err);
    return [];
  }
}

export async function getUltimaExecucao(): Promise<AgenteExecucao | null> {
  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('agente_execucoes')
      .select('*')
      .order('iniciado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar última execução do agente:', error);
      return null;
    }

    return (data as AgenteExecucao) || null;
  } catch (err) {
    console.error('Falha na consulta de agente_execucoes:', err);
    return null;
  }
}
