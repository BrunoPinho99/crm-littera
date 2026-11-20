import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { Interacao, TipoInteracao } from '@/types/database';

export async function getInteracoesByEscolaId(escolaId: string): Promise<Interacao[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('interacoes')
    .select('*')
    .eq('escola_id', escolaId)
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('Erro em getInteracoesByEscolaId:', error);
    return [];
  }

  return (data as Interacao[]) || [];
}

export async function createInteracao(
  dados: {
    escola_id: string;
    contato_id?: string | null;
    tipo: TipoInteracao;
    assunto?: string | null;
    conteudo?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{ success: boolean; data?: Interacao; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  const payload = {
    escola_id: dados.escola_id,
    contato_id: dados.contato_id || null,
    tipo: dados.tipo,
    assunto: dados.assunto || null,
    conteudo: dados.conteudo || null,
    metadata: dados.metadata || null,
    criado_em: now,
  };

  const { data, error } = await supabase
    .from('interacoes')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Erro ao registrar interacao:', error);
    return { success: false, error: error.message };
  }

  // Atualiza timestamp de ultima_interacao na escola
  await supabase
    .from('escolas')
    .update({ ultima_interacao: now })
    .eq('id', dados.escola_id);

  return { success: true, data: data as Interacao };
}
