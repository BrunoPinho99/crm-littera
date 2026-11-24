import { getAdminSupabase } from '@/lib/supabase/admin';
import { TipoRotina, StatusRotina, RotinaExecucao } from '@/types/database';

export async function registrarInicioRotina(rotina: TipoRotina): Promise<string | null> {
  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('rotinas_execucoes')
      .insert({
        rotina,
        status: 'rodando' as StatusRotina,
        iniciado_em: new Date().toISOString(),
        resumo: {},
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Erro ao registrar início da rotina ${rotina}:`, error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error(`Exceção ao registrar início da rotina ${rotina}:`, err);
    return null;
  }
}

export async function registrarFimRotina(
  id: string | null,
  status: 'sucesso' | 'erro',
  resumo?: Record<string, unknown>,
  erro?: string | null
): Promise<void> {
  if (!id) return;
  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from('rotinas_execucoes')
      .update({
        finalizado_em: new Date().toISOString(),
        status,
        resumo: resumo || {},
        erro: erro || null,
      })
      .eq('id', id);

    if (error) {
      console.error(`Erro ao registrar término da rotina ${id}:`, error);
    }
  } catch (err) {
    console.error(`Exceção ao registrar término da rotina ${id}:`, err);
  }
}

export async function executarRotinaComRegistro<T>(
  rotina: TipoRotina,
  fn: () => Promise<T>
): Promise<{ sucesso: boolean; resultado?: T; erro?: string }> {
  const rotinaId = await registrarInicioRotina(rotina);
  try {
    const res = await fn();
    await registrarFimRotina(
      rotinaId,
      'sucesso',
      typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : { valor: res }
    );
    return { sucesso: true, resultado: res };
  } catch (err) {
    const erroMsg = err instanceof Error ? err.message : String(err);
    console.error(`Falha isolada na rotina ${rotina}:`, err);
    await registrarFimRotina(rotinaId, 'erro', {}, erroMsg);
    return { sucesso: false, erro: erroMsg };
  }
}

export async function consultarUltimasExecucoesRotinas(): Promise<Record<TipoRotina, RotinaExecucao | null>> {
  const resultado: Record<TipoRotina, RotinaExecucao | null> = {
    agente_diario: null,
    cron_sequencias: null,
    leitor_respostas: null,
    agenda: null,
    verificacao_email: null,
  };

  try {
    const supabase = getAdminSupabase();
    const rotinas: TipoRotina[] = [
      'agente_diario',
      'cron_sequencias',
      'leitor_respostas',
      'agenda',
      'verificacao_email',
    ];

    for (const r of rotinas) {
      const { data, error } = await supabase
        .from('rotinas_execucoes')
        .select('*')
        .eq('rotina', r)
        .order('iniciado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        resultado[r] = data as RotinaExecucao;
      }
    }
  } catch (err) {
    console.error('Erro ao consultar histórico de rotinas:', err);
  }

  return resultado;
}
