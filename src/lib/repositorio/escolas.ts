import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { Escola, EscolaComContatos, StatusFunil } from '@/types/database';

/**
 * Remove chaves undefined e null de um objeto para que o upsert
 * nunca sobrescreva dados já existentes no banco com valores nulos.
 */
export function sanitizeForUpsert<T extends Record<string, unknown>>(data: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = value;
    }
  }
  return result;
}

export async function getEscolasComContatos(): Promise<EscolaComContatos[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('escolas')
    .select(`
      *,
      contatos (*)
    `)
    .order('score', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('Erro no repositório getEscolasComContatos:', error);
    return [];
  }

  return (data as EscolaComContatos[]) || [];
}

export async function getEscolaById(id: string): Promise<EscolaComContatos | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('escolas')
    .select(`
      *,
      contatos (*)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as EscolaComContatos;
}

export async function upsertEscolas(
  linhas: Partial<Escola>[]
): Promise<{ success: boolean; data?: Escola[]; error?: string }> {
  if (!linhas || linhas.length === 0) {
    return { success: true, data: [] };
  }

  const supabase = await createServerSupabaseClient();

  // Separa em linhas que possuem codigo_inep e as que usam chave_dedup
  const comInep: Partial<Escola>[] = [];
  const comChaveDedup: Partial<Escola>[] = [];

  for (const row of linhas) {
    const cleanRow = sanitizeForUpsert(row as Record<string, unknown>) as Partial<Escola>;
    if (cleanRow.codigo_inep && cleanRow.codigo_inep.trim() !== '') {
      comInep.push(cleanRow);
    } else {
      comChaveDedup.push(cleanRow);
    }
  }

  const results: Escola[] = [];

  try {
    if (comInep.length > 0) {
      const { data, error } = await supabase
        .from('escolas')
        .upsert(comInep, { onConflict: 'codigo_inep' })
        .select();

      if (error) {
        throw error;
      }
      if (data) results.push(...(data as Escola[]));
    }

    if (comChaveDedup.length > 0) {
      const { data, error } = await supabase
        .from('escolas')
        .upsert(comChaveDedup, { onConflict: 'chave_dedup' })
        .select();

      if (error) {
        throw error;
      }
      if (data) results.push(...(data as Escola[]));
    }

    return { success: true, data: results };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao realizar upsert de escolas';
    console.error('Falha em upsertEscolas:', message);
    return { success: false, error: message };
  }
}

export async function updateStatusFunil(
  id: string,
  novoStatus: StatusFunil
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('escolas')
    .update({
      status_funil: novoStatus,
      ultima_interacao: now,
    })
    .eq('id', id);

  if (error) {
    console.error('Erro em updateStatusFunil:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function createEscola(
  dados: Partial<Escola>
): Promise<{ success: boolean; data?: Escola; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const cleanData = sanitizeForUpsert(dados as Record<string, unknown>);

  const { data, error } = await supabase
    .from('escolas')
    .insert([cleanData])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar escola:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data: data as Escola };
}

export async function updateEscola(
  id: string,
  dados: Partial<Escola>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const cleanData = sanitizeForUpsert(dados as Record<string, unknown>);

  // Edição manual de e-mail geral reseta o status para 'nao_verificado'
  if (dados.email_geral !== undefined && dados.email_geral_status === undefined) {
    const { data: current } = await supabase
      .from('escolas')
      .select('email_geral')
      .eq('id', id)
      .single();
    if (current && (current.email_geral || '').toLowerCase() !== (dados.email_geral || '').toLowerCase()) {
      cleanData.email_geral_status = 'nao_verificado';
      cleanData.email_geral_verificado_em = null;
    }
  }

  const { error } = await supabase
    .from('escolas')
    .update(cleanData)
    .eq('id', id);

  if (error) {
    console.error('Erro ao atualizar escola:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteEscola(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('escolas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir escola:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
