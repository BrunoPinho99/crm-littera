import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { Contato } from '@/types/database';
import { sanitizeForUpsert } from './escolas';

export async function getContatosByEscolaId(escolaId: string): Promise<Contato[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('contatos')
    .select('*')
    .eq('escola_id', escolaId)
    .order('principal', { ascending: false })
    .order('criado_em', { ascending: true });

  if (error) {
    console.error('Erro em getContatosByEscolaId:', error);
    return [];
  }

  return (data as Contato[]) || [];
}

export async function createContato(
  dados: Partial<Contato>
): Promise<{ success: boolean; data?: Contato; error?: string }> {
  if (!dados.escola_id) {
    return { success: false, error: 'escola_id é obrigatório para criar contato.' };
  }

  const supabase = await createServerSupabaseClient();
  const cleanData = sanitizeForUpsert(dados as Record<string, unknown>);

  // Se este contato for marcado como principal, desmarca anteriores da mesma escola
  if (cleanData.principal === true) {
    await supabase
      .from('contatos')
      .update({ principal: false })
      .eq('escola_id', dados.escola_id);
  }

  const { data, error } = await supabase
    .from('contatos')
    .insert([cleanData])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar contato:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data: data as Contato };
}

export async function updateContato(
  id: string,
  dados: Partial<Contato>
): Promise<{ success: boolean; data?: Contato; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const cleanData = sanitizeForUpsert(dados as Record<string, unknown>);

  // Edição manual de e-mail reseta o status para 'nao_verificado'
  if (dados.email !== undefined && dados.email_status === undefined) {
    const { data: current } = await supabase
      .from('contatos')
      .select('email')
      .eq('id', id)
      .single();
    if (current && (current.email || '').toLowerCase() !== (dados.email || '').toLowerCase()) {
      cleanData.email_status = 'nao_verificado';
      cleanData.email_verificado_em = null;
    }
  }

  // Se estiver atualizando para principal, descobre a escola e desmarca os outros
  if (cleanData.principal === true) {
    const { data: current } = await supabase
      .from('contatos')
      .select('escola_id')
      .eq('id', id)
      .single();

    if (current?.escola_id) {
      await supabase
        .from('contatos')
        .update({ principal: false })
        .eq('escola_id', current.escola_id)
        .neq('id', id);
    }
  }

  const { data, error } = await supabase
    .from('contatos')
    .update(cleanData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar contato:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data: data as Contato };
}

export async function deleteContato(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('contatos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir contato:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function setContatoPrincipal(
  escolaId: string,
  contatoId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  // 1. Remove status principal de todos os contatos da escola
  const { error: resetError } = await supabase
    .from('contatos')
    .update({ principal: false })
    .eq('escola_id', escolaId);

  if (resetError) {
    console.error('Erro ao desmarcar principais anteriores:', resetError);
    return { success: false, error: resetError.message };
  }

  // 2. Define o contato selecionado como principal
  const { error: setError } = await supabase
    .from('contatos')
    .update({ principal: true })
    .eq('id', contatoId)
    .eq('escola_id', escolaId);

  if (setError) {
    console.error('Erro ao definir novo contato principal:', setError);
    return { success: false, error: setError.message };
  }

  return { success: true };
}
