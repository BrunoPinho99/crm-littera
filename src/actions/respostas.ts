'use server';

import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { ClassificacaoResposta, Resposta, Lembrete } from '@/types/database';
import { enviarEmail } from '@/lib/envio/enviarEmail';

/**
 * Busca respostas registradas para uma escola
 */
export async function getRespostasDaEscolaAction(escolaId: string): Promise<Resposta[]> {
  await requireUser();

  const { data, error } = await supabaseAdmin
    .from('respostas')
    .select('*')
    .eq('escola_id', escolaId)
    .order('recebido_em', { ascending: false });

  if (error) {
    console.error('Erro ao buscar respostas da escola:', error);
    return [];
  }

  return (data || []) as Resposta[];
}

/**
 * Corrige manualmente a classificação de uma resposta e reaplica regras de negócio
 */
export async function corrigirClassificacaoAction(
  respostaId: string,
  novaClassificacao: ClassificacaoResposta
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const { data: resposta, error: buscaErr } = await supabaseAdmin
      .from('respostas')
      .select('*')
      .eq('id', respostaId)
      .single();

    if (buscaErr || !resposta) {
      return { success: false, error: 'Resposta não encontrada.' };
    }

    // 1. Atualiza a classificação na tabela respostas
    await supabaseAdmin
      .from('respostas')
      .update({
        classificacao: novaClassificacao,
        tratada: true,
        justificativa: `Classificação corrigida manualmente para ${novaClassificacao}`,
      })
      .eq('id', respostaId);

    // 2. Reaplica status no funil da escola
    const mapaStatusFunil: Partial<Record<ClassificacaoResposta, string>> = {
      interessado: 'respondido',
      mais_informacoes: 'respondido',
      agora_nao: 'respondido',
      indicou_outra_pessoa: 'respondido',
      sem_interesse: 'sem_interesse',
      descadastro: 'descadastrado',
    };

    const statusFunil = mapaStatusFunil[novaClassificacao];
    if (statusFunil) {
      await supabaseAdmin
        .from('escolas')
        .update({ status_funil: statusFunil, atualizado_em: new Date().toISOString() })
        .eq('id', resposta.escola_id);
    }

    // 3. Trata casos especiais (descadastro / sem interesse / agora_nao)
    if (novaClassificacao === 'descadastro') {
      await supabaseAdmin.from('descadastros').insert({
        email: resposta.de_email.trim().toLowerCase(),
        motivo: 'classificacao_manual',
      });
      if (resposta.contato_id) {
        await supabaseAdmin
          .from('contatos')
          .update({ descadastrado: true })
          .eq('id', resposta.contato_id);
      }
    }

    if (novaClassificacao === 'agora_nao') {
      // Cria lembrete para 90 dias caso não exista
      const dataFutura = new Date();
      dataFutura.setDate(dataFutura.getDate() + 90);
      await supabaseAdmin.from('lembretes').insert({
        escola_id: resposta.escola_id,
        contato_id: resposta.contato_id,
        data: dataFutura.toISOString().split('T')[0],
        texto: `Retomar contato (classificação corrigida para Agora Não)`,
        concluido: false,
      });
    }

    revalidatePath('/');
    revalidatePath('/fila');
    revalidatePath('/lembretes');

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erro ao corrigir classificação da resposta:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Aprova e envia o rascunho de resposta gerado
 */
export async function aprovarRascunhoRespostaAction(
  respostaId: string,
  textoEditado?: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const { data: resposta, error: buscaErr } = await supabaseAdmin
      .from('respostas')
      .select('*')
      .eq('id', respostaId)
      .single();

    if (buscaErr || !resposta) {
      return { success: false, error: 'Resposta não encontrada.' };
    }

    const textoFinal = textoEditado?.trim() || resposta.rascunho_resposta?.trim();
    if (!textoFinal) {
      return { success: false, error: 'Nenhum texto de resposta informado.' };
    }

    const assuntoResposta = resposta.assunto.toLowerCase().startsWith('re:')
      ? resposta.assunto
      : `Re: ${resposta.assunto}`;

    // Dispara via enviarEmail
    await enviarEmail({
      caixaId: resposta.caixa_envio_id || undefined,
      para: resposta.de_email,
      assunto: assuntoResposta,
      texto: textoFinal,
      html: `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${textoFinal.replace(/\n/g, '<br />')}</div>`,
      escolaId: resposta.escola_id,
      contatoId: resposta.contato_id,
      emRespostaA: {
        threadId: resposta.provedor_thread_id,
        rfcMessageId: resposta.provedor_message_id,
      },
    });

    // Se havia item pendente na fila_envios correspondente, atualiza para enviado
    if (resposta.inscricao_id) {
      await supabaseAdmin
        .from('fila_envios')
        .update({
          status: 'enviado',
          enviado_em: new Date().toISOString(),
        })
        .eq('inscricao_id', resposta.inscricao_id)
        .eq('status', 'aguardando_aprovacao');
    }

    // Marca a resposta como tratada
    await supabaseAdmin
      .from('respostas')
      .update({
        tratada: true,
        rascunho_resposta: textoFinal,
      })
      .eq('id', respostaId);

    revalidatePath('/');
    revalidatePath('/fila');

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erro ao aprovar e enviar rascunho de resposta:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Retorna contadores de novas respostas não tratadas e lembretes pendentes
 */
export async function getContadoresRespostasELembretesAction(): Promise<{
  respostasNovas: number;
  lembretesPendentes: number;
}> {
  await requireUser();

  try {
    const { count: countRespostas } = await supabaseAdmin
      .from('respostas')
      .select('*', { count: 'exact', head: true })
      .eq('tratada', false);

    const hoje = new Date().toISOString().split('T')[0];
    const { count: countLembretes } = await supabaseAdmin
      .from('lembretes')
      .select('*', { count: 'exact', head: true })
      .eq('concluido', false)
      .lte('data', hoje);

    return {
      respostasNovas: countRespostas || 0,
      lembretesPendentes: countLembretes || 0,
    };
  } catch (err) {
    console.error('Erro ao buscar contadores:', err);
    return { respostasNovas: 0, lembretesPendentes: 0 };
  }
}

export interface LembreteComEscola extends Lembrete {
  escolas?: { id: string; nome: string; cidade: string; uf: string } | null;
  contatos?: { id: string; nome: string; email: string; cargo: string | null } | null;
}

/**
 * Lista lembretes com filtro (hoje, atrasados, todos)
 */
export async function getLembretesAction(
  filtro: 'hoje' | 'atrasados' | 'todos' = 'todos'
): Promise<LembreteComEscola[]> {
  await requireUser();

  const hoje = new Date().toISOString().split('T')[0];

  let query = supabaseAdmin
    .from('lembretes')
    .select(`
      *,
      escolas:escola_id (id, nome, cidade, uf),
      contatos:contato_id (id, nome, email, cargo)
    `)
    .order('data', { ascending: true });

  if (filtro === 'hoje') {
    query = query.eq('concluido', false).eq('data', hoje);
  } else if (filtro === 'atrasados') {
    query = query.eq('concluido', false).lt('data', hoje);
  } else {
    query = query.eq('concluido', false);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao listar lembretes:', error);
    return [];
  }

  return (data || []) as unknown as LembreteComEscola[];
}

/**
 * Marca um lembrete como concluído
 */
export async function concluirLembreteAction(lembreteId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const { error } = await supabaseAdmin
      .from('lembretes')
      .update({ concluido: true })
      .eq('id', lembreteId);

    if (error) throw error;

    revalidatePath('/lembretes');
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Cria um lembrete manualmente
 */
export async function criarLembreteAction(dados: {
  escolaId: string;
  contatoId?: string | null;
  data: string;
  texto: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const { error } = await supabaseAdmin.from('lembretes').insert({
      escola_id: dados.escolaId,
      contato_id: dados.contatoId || null,
      data: dados.data,
      texto: dados.texto,
      concluido: false,
    });

    if (error) throw error;

    revalidatePath('/lembretes');
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
