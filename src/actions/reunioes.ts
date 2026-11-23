'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { registrarReuniao } from '@/lib/agendamento/registrar';
import {
  registrarResultadoPosReuniao,
  RegistrarResultadoPosReuniaoParams,
} from '@/lib/agendamento/posReuniao';
import { Reuniao } from '@/types/database';

/**
 * Retorna as reuniões registradas no CRM com dados das escolas e contatos vinculados
 */
export async function getReunioesAction(filtro?: {
  status?: string;
  resultado?: string;
  pendentes?: boolean;
}): Promise<Reuniao[]> {
  await requireUser();

  try {
    let query = supabaseAdmin
      .from('reunioes')
      .select('*, escolas(id, nome, cidade, uf, resumo_pesquisa, gancho_personalizacao), contatos(id, nome, cargo, email, telefone)')
      .order('inicio', { ascending: false });

    if (filtro?.status && filtro.status !== 'todos') {
      query = query.eq('status', filtro.status);
    }

    if (filtro?.resultado && filtro.resultado !== 'todos') {
      query = query.eq('resultado', filtro.resultado);
    }

    if (filtro?.pendentes) {
      query = query.eq('pendente_registro', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar reuniões:', error);
      return [];
    }

    return (data as Reuniao[]) || [];
  } catch (err) {
    console.error('Exceção em getReunioesAction:', err);
    return [];
  }
}

/**
 * Retorna o número de reuniões passadas com preenchimento pós-reunião pendente
 */
export async function getContadorReunioesPendentesAction(): Promise<number> {
  await requireUser();

  try {
    const { count, error } = await supabaseAdmin
      .from('reunioes')
      .select('id', { count: 'exact', head: true })
      .eq('pendente_registro', true);

    if (error) {
      console.error('Erro ao contar reuniões pendentes:', error);
      return 0;
    }

    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Server action para agendamento manual de reuniões (combinadas por WhatsApp/Telefone)
 * Grava na tabela reunioes (provedor 'manual') e aciona registrarReuniao
 */
export async function agendarReuniaoManualAction(dados: {
  escolaId: string;
  contatoId?: string | null;
  inicio: string; // ISO
  fim: string; // ISO
  linkReuniao?: string | null;
  notas?: string | null;
  titulo?: string | null;
}): Promise<{ sucesso: boolean; reuniao?: Reuniao; erro?: string }> {
  await requireUser();

  try {
    const idManual = `manual_${crypto.randomUUID()}`;

    const res = await registrarReuniao({
      provedor: 'manual',
      provedorEventoId: idManual,
      inicio: dados.inicio,
      fim: dados.fim,
      linkReuniao: dados.linkReuniao || null,
      escolaId: dados.escolaId,
      contatoId: dados.contatoId || null,
      tipoEvento: 'criacao',
      notas: dados.notas || dados.titulo || null,
    });

    if (res.sucesso) {
      try {
        revalidatePath('/');
        revalidatePath('/reunioes');
      } catch {}
    }

    return res;
  } catch (err) {
    console.error('Erro em agendarReuniaoManualAction:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { sucesso: false, erro: msg };
  }
}

/**
 * Server action para registrar o resultado do pós-reunião (realizada ou não compareceu)
 */
export async function registrarPosReuniaoAction(
  dados: RegistrarResultadoPosReuniaoParams
): Promise<{ sucesso: boolean; reuniao?: Reuniao; erro?: string }> {
  await requireUser();

  try {
    const res = await registrarResultadoPosReuniao(dados);

    if (res.sucesso) {
      try {
        revalidatePath('/');
        revalidatePath('/reunioes');
        revalidatePath('/lembretes');
      } catch {}
    }

    return res;
  } catch (err) {
    console.error('Erro em registrarPosReuniaoAction:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { sucesso: false, erro: msg };
  }
}

/**
 * Server action para vincular manualmente uma reunião de origem desconhecida a uma escola
 */
export async function vincularReuniaoEscolaAction(dados: {
  reuniaoId: string;
  escolaId: string;
  contatoId?: string | null;
}): Promise<{ sucesso: boolean; erro?: string }> {
  await requireUser();

  try {
    const agoraIso = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('reunioes')
      .update({
        escola_id: dados.escolaId,
        contato_id: dados.contatoId || null,
        atualizado_em: agoraIso,
      })
      .eq('id', dados.reuniaoId);

    if (error) {
      return { sucesso: false, erro: error.message };
    }

    // Move a escola para 'reuniao_agendada'
    await supabaseAdmin
      .from('escolas')
      .update({
        status_funil: 'reuniao_agendada',
        ultima_interacao: agoraIso,
        atualizado_em: agoraIso,
      })
      .eq('id', dados.escolaId);

    try {
      revalidatePath('/');
      revalidatePath('/reunioes');
    } catch {}

    return { sucesso: true };
  } catch (err) {
    console.error('Erro em vincularReuniaoEscolaAction:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { sucesso: false, erro: msg };
  }
}
