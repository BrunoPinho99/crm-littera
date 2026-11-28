'use server';

import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calcularLimiteHoje } from '@/lib/envio/limites';
import { podeEnviarEmail } from '@/lib/envio/regrasEnvio';
import { calcularProximaJanelaValida } from '@/lib/sequencias/janelas';
import { revalidatePath } from 'next/cache';
import { CaixaEnvio, Contato, Sequencia, SequenciaPasso, Inscricao, FilaEnvio } from '@/types/database';

/**
 * Carrega conjunto de feriados cadastrados no banco
 */
export async function carregarFeriadosSet(): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from('feriados').select('data');
  const set = new Set<string>();
  if (data) {
    for (const f of data) {
      if (f.data) set.add(f.data);
    }
  }
  return set;
}

/**
 * Inscreve uma escola na sequência de e-mails ativa
 */
export async function iniciarSequencia(
  escolaId: string,
  contatoId?: string | null
): Promise<{ success: boolean; inscricaoId?: string; error?: string }> {
  await requireUser();

  try {
    // 1. Checa se já possui inscrição ativa ou pausada
    const { data: inscricaoExistente } = await supabaseAdmin
      .from('inscricoes')
      .select('id, status')
      .eq('escola_id', escolaId)
      .in('status', ['ativa', 'pausada'])
      .maybeSingle();

    if (inscricaoExistente) {
      return {
        success: false,
        error: `A escola já possui uma sequência em andamento (${inscricaoExistente.status}).`,
      };
    }

    // 2. Busca contatos da escola
    const { data: contatos } = await supabaseAdmin
      .from('contatos')
      .select('*')
      .eq('escola_id', escolaId);

    const listaContatos: Contato[] = (contatos as Contato[]) || [];

    // Se não há contatos com e-mail, verifica se a escola possui email_geral para criar contato padrão
    if (listaContatos.length === 0 || !listaContatos.some((c) => Boolean(c.email))) {
      const { data: escolaData } = await supabaseAdmin
        .from('escolas')
        .select('id, nome, email_geral, email_geral_status')
        .eq('id', escolaId)
        .maybeSingle();

      if (escolaData?.email_geral) {
        const { data: novoContato } = await supabaseAdmin
          .from('contatos')
          .insert({
            escola_id: escolaId,
            nome: 'Equipe / Secretaria Pedagógica',
            cargo: 'Contato Institucional',
            email: escolaData.email_geral,
            email_status: escolaData.email_geral_status || 'valido',
            principal: true,
          })
          .select()
          .single();

        if (novoContato) {
          listaContatos.push(novoContato as Contato);
        }
      }
    }

    if (listaContatos.length === 0) {
      return { success: false, error: 'Escola sem contatos ou e-mail cadastrados.' };
    }

    let contatoAlvo: Contato | null = null;
    if (contatoId) {
      const c = listaContatos.find((item) => item.id === contatoId);
      if (c && !c.descadastrado && c.email && podeEnviarEmail(c.email_status)) {
        contatoAlvo = c as Contato;
      } else {
        return {
          success: false,
          error: 'O contato informado não possui e-mail elegível para envio (regras de verificação ou descadastro).',
        };
      }
    } else {
      // Prioridade: principal > mantenedor > diretor_geral > diretor_pedagogico > coordenador_em
      const ordemTipos: Record<string, number> = {
        mantenedor: 1,
        diretor_geral: 2,
        diretor_pedagogico: 3,
        coordenador_em: 4,
        outro: 5,
        secretaria: 6,
      };

      const elegiveis = listaContatos
        .filter((c) => !c.descadastrado && Boolean(c.email) && podeEnviarEmail(c.email_status))
        .sort((a, b) => {
          if (a.principal && !b.principal) return -1;
          if (!a.principal && b.principal) return 1;
          const pesoA = ordemTipos[a.tipo || 'outro'] || 99;
          const pesoB = ordemTipos[b.tipo || 'outro'] || 99;
          return pesoA - pesoB;
        });

      if (elegiveis.length === 0) {
        return {
          success: false,
          error: 'Nenhum contato desta escola possui e-mail disponível para envio de sequências.',
        };
      }

      contatoAlvo = elegiveis[0];
    }

    // 3. Escolhe a caixa com maior folga diária
    const { data: caixas } = await supabaseAdmin
      .from('caixas_envio')
      .select('*')
      .eq('ativo', true);

    if (!caixas || caixas.length === 0) {
      return { success: false, error: 'Nenhuma caixa de envio ativa encontrada no sistema.' };
    }

    const caixasComFolga = (caixas as CaixaEnvio[])
      .map((c) => ({
        caixa: c,
        limite: calcularLimiteHoje(c, new Date()),
      }))
      .sort((a, b) => b.limite.disponivelHoje - a.limite.disponivelHoje);

    const melhorCaixa = caixasComFolga[0].caixa;

    // 4. Busca a sequência padrão ativa
    const { data: sequencias } = await supabaseAdmin
      .from('sequencias')
      .select('*')
      .eq('ativa', true)
      .order('criado_em', { ascending: true })
      .limit(1);

    if (!sequencias || sequencias.length === 0) {
      return { success: false, error: 'Nenhuma sequência de e-mails ativa cadastrada.' };
    }

    const sequencia = sequencias[0] as Sequencia;

    // 5. Calcula próxima janela comercial válida
    const feriadosSet = await carregarFeriadosSet();
    const proximaJanela = calcularProximaJanelaValida(new Date(), feriadosSet, true);

    // 6. Insere a inscrição
    const { data: inscricao, error: insErr } = await supabaseAdmin
      .from('inscricoes')
      .insert({
        escola_id: escolaId,
        contato_id: contatoAlvo.id,
        sequencia_id: sequencia.id,
        caixa_envio_id: melhorCaixa.id,
        status: 'ativa',
        passo_atual: 0,
        proximo_envio_em: proximaJanela.toISOString(),
      })
      .select('id')
      .single();

    if (insErr || !inscricao) {
      return { success: false, error: insErr?.message || 'Erro ao criar inscrição.' };
    }

    // 7. Atualiza status do funil da escola
    await supabaseAdmin
      .from('escolas')
      .update({ status_funil: 'em_sequencia' })
      .eq('id', escolaId);

    revalidatePath('/');
    revalidatePath('/sequencias');
    revalidatePath('/fila');

    return { success: true, inscricaoId: inscricao.id };
  } catch (err: unknown) {
    console.error('Erro ao iniciar sequência:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha interna ao iniciar sequência.',
    };
  }
}

/**
 * Inscreve em massa todas as escolas qualificadas do lote de hoje que ainda não possuem sequência
 */
export async function iniciarSequenciaLoteHojeAction(): Promise<{
  success: boolean;
  totalInscritos: number;
  enviosRealizados?: number;
  passosProcessados?: number;
  erros: string[];
}> {
  await requireUser();

  try {
    const hojeStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // 1. Busca lote de hoje
    const { data: lote } = await supabaseAdmin
      .from('lotes_diarios')
      .select('id')
      .eq('data', hojeStr)
      .maybeSingle();

    // 2. Busca escolas elegíveis
    let query = supabaseAdmin
      .from('escolas')
      .select('id, nome, status_funil, status_qualificacao')
      .eq('status_qualificacao', 'qualificado')
      .in('status_funil', ['novo', 'em_sequencia']);

    if (lote?.id) {
      query = query.or(`entregue_lote_id.eq.${lote.id},entregue_em.eq.${hojeStr}`);
    } else {
      query = query.eq('entregue_em', hojeStr);
    }

    const { data: escolas, error: escolasErr } = await query;
    if (escolasErr || !escolas || escolas.length === 0) {
      return { success: true, totalInscritos: 0, erros: ['Nenhuma escola do lote de hoje encontrada.'] };
    }

    let totalInscritos = 0;
    const erros: string[] = [];

    for (const escola of escolas) {
      const res = await iniciarSequencia(escola.id);
      if (res.success) {
        totalInscritos++;
      } else {
        if (!res.error?.includes('já possui uma sequência')) {
          erros.push(`${escola.nome}: ${res.error}`);
        }
      }
    }

    // Executa imediatamente o motor para gerar o primeiro toque e disparar
    let enviosRealizados = 0;
    let passosProcessados = 0;
    try {
      const { executarMotorSequencias } = await import('@/lib/sequencias/motor');
      const resultadoMotor = await executarMotorSequencias({ forcarJanela: true, limite: 50 });
      enviosRealizados = resultadoMotor.enviosRealizados;
      passosProcessados = resultadoMotor.inscricoesProcessadas;
      if (resultadoMotor.erros && resultadoMotor.erros.length > 0) {
        erros.push(...resultadoMotor.erros);
      }
    } catch (mErr) {
      console.warn('Aviso: motor executado parcialmente após inscrição em lote:', mErr);
    }

    revalidatePath('/');
    revalidatePath('/sequencias');
    revalidatePath('/fila');

    return { 
      success: true, 
      totalInscritos, 
      enviosRealizados, 
      passosProcessados, 
      erros 
    };
  } catch (err: unknown) {
    console.error('Erro na inscrição em lote:', err);
    return {
      success: false,
      totalInscritos: 0,
      enviosRealizados: 0,
      passosProcessados: 0,
      erros: [err instanceof Error ? err.message : 'Falha desconhecida no lote.'],
    };
  }
}

/**
 * Automação de Disparo de Campanhas:
 * 1. Inscreve todas as escolas qualificadas ativas que ainda não possuem sequência
 * 2. Processa os passos pendentes no motor de cadência
 * 3. Dispara os e-mails liberados da fila
 */
export async function dispararCampanhaAutomaticaAction(options?: {
  apenasLoteHoje?: boolean;
  forcarJanela?: boolean;
}): Promise<{
  success: boolean;
  totalInscritos: number;
  passosProcessados: number;
  enviosRealizados: number;
  erros: string[];
}> {
  await requireUser();

  try {
    const { data: escolasQualificadas } = await supabaseAdmin
      .from('escolas')
      .select('id, nome, status_funil, status_qualificacao')
      .eq('status_qualificacao', 'qualificado')
      .in('status_funil', ['novo', 'em_sequencia']);

    let totalInscritos = 0;
    const erros: string[] = [];

    if (escolasQualificadas && escolasQualificadas.length > 0) {
      for (const escola of escolasQualificadas) {
        const res = await iniciarSequencia(escola.id);
        if (res.success) {
          totalInscritos++;
        } else if (!res.error?.includes('já possui uma sequência')) {
          erros.push(`${escola.nome}: ${res.error}`);
        }
      }
    }

    // Executa o motor de disparos
    const { executarMotorSequencias } = await import('@/lib/sequencias/motor');
    const resMotor = await executarMotorSequencias({
      forcarJanela: options?.forcarJanela ?? true,
      limite: 50,
    });

    if (resMotor.erros && resMotor.erros.length > 0) {
      erros.push(...resMotor.erros);
    }

    revalidatePath('/');
    revalidatePath('/sequencias');
    revalidatePath('/fila');

    return {
      success: true,
      totalInscritos,
      passosProcessados: resMotor.inscricoesProcessadas,
      enviosRealizados: resMotor.enviosRealizados,
      erros,
    };
  } catch (err: unknown) {
    console.error('Erro ao disparar campanha automática:', err);
    return {
      success: false,
      totalInscritos: 0,
      passosProcessados: 0,
      enviosRealizados: 0,
      erros: [err instanceof Error ? err.message : 'Falha ao disparar automação de campanhas'],
    };
  }
}

/**
 * Pausa uma inscrição ativa
 */
export async function pausarInscricaoAction(inscricaoId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const { error } = await supabaseAdmin
    .from('inscricoes')
    .update({ status: 'pausada', motivo_fim: 'Pausa manual pelo operador' })
    .eq('id', inscricaoId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/sequencias');
  return { success: true };
}

/**
 * Retoma uma inscrição pausada reagendando para a próxima janela
 */
export async function retomarInscricaoAction(inscricaoId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const feriadosSet = await carregarFeriadosSet();
  const proximaJanela = calcularProximaJanelaValida(new Date(), feriadosSet, true);

  const { error } = await supabaseAdmin
    .from('inscricoes')
    .update({
      status: 'ativa',
      proximo_envio_em: proximaJanela.toISOString(),
      motivo_fim: null,
    })
    .eq('id', inscricaoId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/sequencias');
  return { success: true };
}

/**
 * Encerra definitivamente uma inscrição
 */
export async function encerrarInscricaoAction(
  inscricaoId: string,
  motivo = 'Cancelado manualmente'
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const { error } = await supabaseAdmin
    .from('inscricoes')
    .update({ status: 'cancelada', motivo_fim: motivo })
    .eq('id', inscricaoId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/sequencias');
  return { success: true };
}

/**
 * Liga / Desliga o modo de aprovação da sequência
 */
export async function toggleModoAprovacaoAction(
  sequenciaId: string,
  modoAprovacao: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const { error } = await supabaseAdmin
    .from('sequencias')
    .update({ modo_aprovacao: modoAprovacao })
    .eq('id', sequenciaId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/sequencias');
  revalidatePath('/fila');
  return { success: true };
}

/**
 * Atualiza um passo da sequência
 */
export async function salvarPassoSequenciaAction(
  passoId: string,
  dados: {
    dias_apos_anterior: number;
    assunto_template: string;
    corpo_template: string;
    usar_ia: boolean;
    ativo: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const { error } = await supabaseAdmin
    .from('sequencia_passos')
    .update({
      dias_apos_anterior: Number(dados.dias_apos_anterior),
      assunto_template: dados.assunto_template.trim(),
      corpo_template: dados.corpo_template.trim(),
      usar_ia: dados.usar_ia,
      ativo: dados.ativo,
    })
    .eq('id', passoId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/sequencias');
  return { success: true };
}

/**
 * Busca dados da sequência padrão com seus passos e métricas
 */
export async function getSequenciaComPassosAction(): Promise<{
  sequencia: Sequencia | null;
  passos: SequenciaPasso[];
  metricas: {
    totalInscritos: number;
    totalEnviados: number;
    totalRespostas: number;
    totalReunioes: number;
    aguardandoAprovacao: number;
  };
}> {
  await requireUser();

  const { data: sequencias } = await supabaseAdmin
    .from('sequencias')
    .select('*')
    .eq('ativa', true)
    .order('criado_em', { ascending: true })
    .limit(1);

  const seq = sequencias?.[0] as Sequencia | undefined;
  if (!seq) {
    return {
      sequencia: null,
      passos: [],
      metricas: { totalInscritos: 0, totalEnviados: 0, totalRespostas: 0, totalReunioes: 0, aguardandoAprovacao: 0 },
    };
  }

  const { data: passos } = await supabaseAdmin
    .from('sequencia_passos')
    .select('*')
    .eq('sequencia_id', seq.id)
    .order('ordem', { ascending: true });

  // Métricas
  const { count: totalInscritos } = await supabaseAdmin
    .from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('sequencia_id', seq.id);

  const { count: totalEnviados } = await supabaseAdmin
    .from('fila_envios')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'enviado');

  const { count: totalRespostas } = await supabaseAdmin
    .from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('sequencia_id', seq.id)
    .eq('status', 'respondida');

  const { count: totalReunioes } = await supabaseAdmin
    .from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('sequencia_id', seq.id)
    .eq('status', 'reuniao');

  const { count: aguardandoAprovacao } = await supabaseAdmin
    .from('fila_envios')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aguardando_aprovacao');

  return {
    sequencia: seq,
    passos: (passos as SequenciaPasso[]) || [],
    metricas: {
      totalInscritos: totalInscritos || 0,
      totalEnviados: totalEnviados || 0,
      totalRespostas: totalRespostas || 0,
      totalReunioes: totalReunioes || 0,
      aguardandoAprovacao: aguardandoAprovacao || 0,
    },
  };
}

/**
 * Busca fila de envios com filtro opcional de status
 */
export async function getFilaEnviosAction(filtroStatus?: string): Promise<
  Array<
    FilaEnvio & {
      escolaNome: string;
      contatoNome: string | null;
      contatoCargo: string | null;
      passoOrdem: number;
    }
  >
> {
  await requireUser();

  let query = supabaseAdmin
    .from('fila_envios')
    .select('*, inscricoes(escola_id, escolas(nome)), contatos(nome, cargo), sequencia_passos(ordem)');

  if (filtroStatus && filtroStatus !== 'todos') {
    query = query.eq('status', filtroStatus);
  } else if (!filtroStatus) {
    query = query.eq('status', 'aguardando_aprovacao');
  }

  const { data, error } = await query.order('agendado_para', { ascending: true });

  if (error || !data) {
    console.error('Erro ao buscar fila de envios:', error);
    return [];
  }

  return (data as unknown as Array<FilaEnvio & {
    inscricoes?: { escolas?: { nome: string } };
    contatos?: { nome: string; cargo: string };
    sequencia_passos?: { ordem: number };
  }>).map((item) => ({
    id: item.id,
    inscricao_id: item.inscricao_id,
    passo_id: item.passo_id,
    contato_id: item.contato_id,
    para: item.para,
    assunto: item.assunto,
    corpo_html: item.corpo_html,
    corpo_texto: item.corpo_texto,
    status: item.status,
    agendado_para: item.agendado_para,
    enviado_em: item.enviado_em,
    erro: item.erro,
    criado_em: item.criado_em,
    escolaNome: item.inscricoes?.escolas?.nome || 'Escola',
    contatoNome: item.contatos?.nome || null,
    contatoCargo: item.contatos?.cargo || null,
    passoOrdem: item.sequencia_passos?.ordem || 1,
  }));
}

/**
 * Aprova um item da fila (opcionalmente editando destinatário, assunto e corpo)
 */
export async function aprovarItemFilaAction(
  filaId: string,
  edicao?: { para?: string; assunto?: string; corpo_texto?: string }
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const updateData: Record<string, unknown> = {
    status: 'aprovado',
  };

  if (edicao?.para) {
    updateData.para = edicao.para.trim().toLowerCase();
  }

  if (edicao?.assunto) {
    updateData.assunto = edicao.assunto.trim();
  }

  if (edicao?.corpo_texto) {
    updateData.corpo_texto = edicao.corpo_texto.trim();
    const { formatarTextoParaHtml } = await import('@/lib/sequencias/render');
    updateData.corpo_html = formatarTextoParaHtml(edicao.corpo_texto.trim());
  }

  const { error } = await supabaseAdmin
    .from('fila_envios')
    .update(updateData)
    .eq('id', filaId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/fila');
  return { success: true };
}

/**
 * Aprova todos os itens pendentes na fila
 */
export async function aprovarTodosFilaAction(): Promise<{ success: boolean; total: number; error?: string }> {
  await requireUser();

  const { data, error } = await supabaseAdmin
    .from('fila_envios')
    .update({ status: 'aprovado' })
    .eq('status', 'aguardando_aprovacao')
    .select('id');

  if (error) return { success: false, total: 0, error: error.message };
  revalidatePath('/fila');
  return { success: true, total: data?.length || 0 };
}

/**
 * Descarta um item da fila (pula o passo correspondente)
 */
export async function descartarItemFilaAction(filaId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const { data: item } = await supabaseAdmin
    .from('fila_envios')
    .select('inscricao_id, passo_id')
    .eq('id', filaId)
    .single();

  const { error } = await supabaseAdmin
    .from('fila_envios')
    .update({ status: 'descartado' })
    .eq('id', filaId);

  if (error) return { success: false, error: error.message };

  // Avança a inscrição para não travar o fluxo
  if (item?.inscricao_id) {
    const { data: inscricao } = await supabaseAdmin
      .from('inscricoes')
      .select('passo_atual, sequencia_id')
      .eq('id', item.inscricao_id)
      .single();

    if (inscricao) {
      const { data: proximoPasso } = await supabaseAdmin
        .from('sequencia_passos')
        .select('dias_apos_anterior')
        .eq('sequencia_id', inscricao.sequencia_id)
        .eq('ordem', inscricao.passo_atual + 2)
        .maybeSingle();

      const feriadosSet = await carregarFeriadosSet();
      const diasApos = proximoPasso?.dias_apos_anterior || 3;
      const proximoEnvio = calcularProximaJanelaValida(
        new Date(Date.now() + diasApos * 24 * 60 * 60 * 1000),
        feriadosSet,
        false
      );

      await supabaseAdmin
        .from('inscricoes')
        .update({
          passo_atual: inscricao.passo_atual + 1,
          proximo_envio_em: proximoEnvio.toISOString(),
        })
        .eq('id', item.inscricao_id);
    }
  }

  revalidatePath('/fila');
  return { success: true };
}


/**
 * Retorna o número de itens na fila aguardando aprovação
 */
export async function getContadorFilaAction(): Promise<number> {
  await requireUser();
  const { count } = await supabaseAdmin
    .from('fila_envios')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aguardando_aprovacao');

  return count || 0;
}

/**
 * Retorna os detalhes de inscrição e passos de uma escola para exibição no LeadModal
 */
export async function getInscricaoDaEscolaAction(escolaId: string): Promise<{
  inscricao: (Inscricao & { sequenciaNome?: string; contatoNome?: string; contatoEmail?: string }) | null;
  passos: SequenciaPasso[];
  fila: FilaEnvio[];
}> {
  await requireUser();

  const { data: inscricoes } = await supabaseAdmin
    .from('inscricoes')
    .select('*, sequencias(nome), contatos(nome, email)')
    .eq('escola_id', escolaId)
    .order('criado_em', { ascending: false })
    .limit(1);

  const rawInscricao = inscricoes?.[0];
  if (!rawInscricao) {
    return { inscricao: null, passos: [], fila: [] };
  }

  const rawObj = rawInscricao as unknown as Inscricao & {
    sequencias?: { nome?: string };
    contatos?: { nome?: string; email?: string };
  };

  const inscricao = {
    ...rawInscricao,
    sequenciaNome: rawObj.sequencias?.nome || 'Sequência Padrão',
    contatoNome: rawObj.contatos?.nome || null,
    contatoEmail: rawObj.contatos?.email || null,
  };

  const { data: passos } = await supabaseAdmin
    .from('sequencia_passos')
    .select('*')
    .eq('sequencia_id', inscricao.sequencia_id)
    .order('ordem', { ascending: true });

  const { data: fila } = await supabaseAdmin
    .from('fila_envios')
    .select('*')
    .eq('inscricao_id', inscricao.id)
    .order('criado_em', { ascending: true });

  return {
    inscricao: inscricao as unknown as (Inscricao & { sequenciaNome?: string; contatoNome?: string; contatoEmail?: string }),
    passos: (passos as SequenciaPasso[]) || [],
    fila: (fila as FilaEnvio[]) || [],
  };
}


/**
 * Executa uma rodada do motor de sequências sob demanda pelo operador autenticado
 */
export async function executarMotorAction(forcarJanela: boolean = false): Promise<{
  success: boolean;
  executou: boolean;
  motivo?: string;
  inscricoesProcessadas: number;
  enviosRealizados: number;
  erros: string[];
}> {
  await requireUser();
  const { executarMotorSequencias } = await import('@/lib/sequencias/motor');
  const resultado = await executarMotorSequencias({ forcarJanela });
  revalidatePath('/fila');
  revalidatePath('/sequencias');
  revalidatePath('/');
  return {
    success: true,
    ...resultado,
  };
}


/**
 * Busca escolas com contatos reais para alimentar o preview dinâmico de templates
 */
export async function getEscolasParaPreviewAction(): Promise<
  Array<{
    id: string;
    nome: string;
    cidade: string | null;
    gancho_personalizacao: string | null;
    primeiroContatoNome: string | null;
    primeiroContatoCargo: string | null;
  }>
> {
  await requireUser();

  const { data: escolas } = await supabaseAdmin
    .from('escolas')
    .select('id, nome, cidade, gancho_personalizacao, contatos(nome, cargo, principal)')
    .order('criado_em', { ascending: false })
    .limit(20);

  if (!escolas) return [];

  return (escolas as unknown as Array<{
    id: string;
    nome: string;
    cidade: string | null;
    gancho_personalizacao: string | null;
    contatos?: Array<{ nome: string; cargo: string; principal: boolean }>;
  }>).map((e) => {
    const contatos = e.contatos || [];
    const principal = contatos.find((c) => c.principal) || contatos[0];
    return {
      id: e.id,
      nome: e.nome,
      cidade: e.cidade || 'Brasília',
      gancho_personalizacao: e.gancho_personalizacao,
      primeiroContatoNome: principal?.nome || null,
      primeiroContatoCargo: principal?.cargo || null,
    };
  });
}
