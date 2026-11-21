import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfigScore } from '@/types/database';

export async function getConfigScores(): Promise<ConfigScore[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('config_score')
    .select('*')
    .order('chave', { ascending: true });

  if (error) {
    console.error('Erro ao buscar config_score:', error);
    return [];
  }

  return (data as ConfigScore[]) || [];
}

export async function updateConfigScore(
  chave: string, 
  valor: number | null, 
  valor_texto?: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const updatePayload: { valor: number | null; valor_texto?: string | null } = { valor };
  if (valor_texto !== undefined) {
    updatePayload.valor_texto = valor_texto;
  }
  const { error } = await supabase
    .from('config_score')
    .update(updatePayload)
    .eq('chave', chave);

  if (error) {
    console.error(`Erro ao atualizar config_score chave ${chave}:`, error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function recalcularTodosScores(): Promise<{ success: boolean; count?: number; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('recalcular_todos_scores');

  if (error) {
    console.error('Erro ao executar recalcular_todos_scores:', error);
    return { success: false, error: error.message };
  }

  return { success: true, count: typeof data === 'number' ? data : 0 };
}
