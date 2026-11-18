'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { LeadEscolar } from '@/types/database';

export async function getLeads(): Promise<LeadEscolar[]> {
  try {
    const { data, error } = await supabase
      .from('leads_escolares')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar leads:', JSON.stringify(error, null, 2));
      return [];
    }

    return (data as LeadEscolar[]) || [];
  } catch (err) {
    console.error('Falha na requisição de leads:', err);
    return [];
  }
}

export async function markContactSent(leadId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('leads_escolares')
      .update({
        status: 'contato_enviado',
        ultima_interacao: now,
      })
      .eq('id', leadId);

    if (error) {
      console.error('Erro ao atualizar status do lead:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
  } catch (err) {
    console.error('Erro na server action markContactSent:', err);
    return { success: false, error: 'Erro interno ao atualizar lead' };
  }
}
