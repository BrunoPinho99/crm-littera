'use server';

import { generateLeadEmailContent } from '@/lib/envio/conteudoLead';
import { enviarEmail } from '@/lib/envio/enviarEmail';
import { revalidatePath } from 'next/cache';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth';
import { 
  EscolaComContatos, 
  Escola, 
  Contato, 
  Interacao, 
  StatusFunil, 
  AgenteExecucao,
  EmailStatus,
  LoteDiario
} from '@/types/database';
import { pickLeadEmail } from '@/lib/contact';
import { 
  getEscolasComContatos, 
  createEscola, 
  updateEscola, 
  deleteEscola, 
  updateStatusFunil 
} from '@/lib/repositorio/escolas';
import { 
  createContato, 
  updateContato, 
  deleteContato, 
  setContatoPrincipal, 
  getContatosByEscolaId 
} from '@/lib/repositorio/contatos';
import { 
  createInteracao, 
  getInteracoesByEscolaId 
} from '@/lib/repositorio/interacoes';
import {
  getConfigScores,
  updateConfigScore,
  recalcularTodosScores
} from '@/lib/repositorio/config_score';

/**
 * Busca todas as escolas com seus respectivos contatos no CRM
 */
export async function getLeads(): Promise<EscolaComContatos[]> {
  await requireUser();

  try {
    const escolas = await getEscolasComContatos();
    if (escolas && escolas.length > 0) {
      return escolas;
    }

    // Fallback gracioso para a tabela legada caso a migração ainda não tenha rodado
    const supabase = await createServerSupabaseClient();
    const { data: legacyData, error: legacyError } = await supabase
      .from('leads_escolares')
      .select('*')
      .order('created_at', { ascending: false });

    if (!legacyError && legacyData) {
      return legacyData.map((l) => ({
        id: l.id,
        codigo_inep: null,
        cnpj: null,
        nome: l.nome_escola,
        razao_social: null,
        nome_fantasia: null,
        cidade: l.cidade || 'Brasília',
        uf: 'DF',
        bairro: null,
        endereco: null,
        cep: null,
        telefone: l.telefone_escola,
        email_geral: l.email_escola,
        site: null,
        dominio: null,
        matriculas_em: null,
        matriculas_total: null,
        oferece_ensino_medio: null,
        porte_receita: null,
        capital_social: null,
        situacao_cadastral: null,
        score: null,
        score_detalhes: null,
        status_qualificacao: 'bruto',
        motivo_descarte: null,
        status_funil: (l.status || 'novo') as StatusFunil,
        entregue_em: null,
        ultima_interacao: l.ultima_interacao,
        precisa_revisao: Boolean(l.precisa_revisao),
        observacao_revisao: l.observacao_revisao,
        fonte: 'legado_qualotelefone',
        criado_em: l.created_at || new Date().toISOString(),
        atualizado_em: l.created_at || new Date().toISOString(),
        contatos: (l.nome_decisor || l.email_decisor)
          ? [{
              id: `contato-${l.id}`,
              escola_id: l.id,
              nome: l.nome_decisor,
              cargo: null,
              tipo: 'outro',
              email: l.email_decisor,
              email_status: 'nao_verificado',
              email_verificado_em: null,
              telefone: null,
              linkedin_url: null,
              fonte: 'manual',
              fonte_url: null,
              confianca: null,
              principal: true,
              descadastrado: false,
              criado_em: l.created_at || new Date().toISOString(),
              atualizado_em: l.created_at || new Date().toISOString(),
            }]
          : [],
      }));
    }

    return [];
  } catch (err) {
    console.error('Falha na requisição de escolas:', err);
    return [];
  }
}

/**
 * Atualiza o status do funil da escola e registra o evento na tabela de interações
 */
export async function updateLeadStatus(
  leadId: string,
  newStatus: StatusFunil,
  oldStatus?: StatusFunil,
  motivo?: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const res = await updateStatusFunil(leadId, newStatus);
    if (!res.success) {
      return res;
    }

    // Se o lead foi marcado como sem_interesse / descadastrado, cancela sequências e descarta fila
    if (newStatus === 'sem_interesse' || newStatus === 'descadastrado') {
      await supabaseAdmin
        .from('escolas')
        .update({
          motivo_descarte: motivo || (newStatus === 'sem_interesse' ? 'Lead disse não / sem interesse' : 'Descadastrado'),
        })
        .eq('id', leadId);

      // Cancela sequências ativas ou pausadas
      await supabaseAdmin
        .from('inscricoes')
        .update({
          status: 'cancelada',
          motivo_cancelamento: motivo || 'Lead marcou recusa (Disse Não)',
          atualizado_em: new Date().toISOString(),
        })
        .eq('escola_id', leadId)
        .in('status', ['ativa', 'pausada']);

      // Descarta mensagens pendentes na fila
      const { data: inscricoesEscola } = await supabaseAdmin
        .from('inscricoes')
        .select('id')
        .eq('escola_id', leadId);

      if (inscricoesEscola && inscricoesEscola.length > 0) {
        const ids = inscricoesEscola.map((i) => i.id);
        await supabaseAdmin
          .from('fila_envios')
          .update({
            status: 'descartado',
            erro: 'Lead marcou recusa (Disse Não / Sem Interesse)',
          })
          .in('inscricao_id', ids)
          .in('status', ['aguardando_aprovacao', 'aprovado']);
      }
    } else if (oldStatus === 'sem_interesse' || oldStatus === 'descadastrado') {
      // Reativação do lead: limpa motivo de descarte
      await supabaseAdmin
        .from('escolas')
        .update({ motivo_descarte: null })
        .eq('id', leadId);
    }

    // Registra a interação de mudança de status
    await createInteracao({
      escola_id: leadId,
      tipo: 'mudanca_status',
      assunto: newStatus === 'sem_interesse' ? 'Lead informou recusa (Disse Não)' : 'Alteração de status no funil',
      conteudo: newStatus === 'sem_interesse'
        ? `Contato realizado. Lead informou que não tem interesse: "${motivo || 'Recusa / Disse Não'}". Removido do funil ativo.`
        : `Status alterado de "${oldStatus || 'não especificado'}" para "${newStatus}".`,
      metadata: { de: oldStatus || null, para: newStatus, motivo: motivo || null },
    });

    try {
      revalidatePath('/');
      revalidatePath('/sequencias');
      revalidatePath('/fila');
    } catch {
      // Ignora erro fora de requisição HTTP
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action updateLeadStatus:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao atualizar status',
    };
  }
}

/**
 * Marca explicitamente que a escola foi contatada e disse NÃO / sem interesse.
 * Remove a escola do funil ativo, cancela sequências em andamento e registra a recusa.
 */
export async function marcarLeadDisseNaoAction(
  leadId: string,
  motivo?: string
): Promise<{ success: boolean; error?: string }> {
  return updateLeadStatus(leadId, 'sem_interesse', undefined, motivo || 'Lead informou que não tem interesse (Disse Não)');
}

/**
 * Reativa um lead que anteriormente disse não, recolocando-o na etapa inicial ("novo").
 */
export async function reativarLeadAction(
  leadId: string
): Promise<{ success: boolean; error?: string }> {
  return updateLeadStatus(leadId, 'novo', 'sem_interesse');
}

/**
 * Cria uma nova escola e opcionalmente seu contato principal
 */
export async function createLead(
  formData: {
    nome: string;
    cidade: string;
    uf?: string;
    telefone?: string | null;
    email_geral?: string | null;
    cnpj?: string | null;
    codigo_inep?: string | null;
    site?: string | null;
    contato_nome?: string | null;
    contato_email?: string | null;
    contato_cargo?: string | null;
    contato_telefone?: string | null;
    status_funil?: StatusFunil;
    // Retrocompatibilidade com campos legados
    nome_escola?: string;
    telefone_escola?: string | null;
    email_escola?: string | null;
    nome_decisor?: string | null;
    email_decisor?: string | null;
  }
): Promise<{ success: boolean; data?: EscolaComContatos; error?: string }> {
  await requireUser();

  try {
    const nome = formData.nome || formData.nome_escola || '';
    const cidade = formData.cidade || 'Brasília';
    const uf = formData.uf || (['Luziânia', 'Formosa', 'Valparaíso de Goiás', 'Novo Gama'].includes(cidade) ? 'GO' : 'DF');
    const telefone = formData.telefone !== undefined ? formData.telefone : formData.telefone_escola;
    const email_geral = formData.email_geral !== undefined ? formData.email_geral : formData.email_escola;

    const res = await createEscola({
      nome,
      cidade,
      uf,
      telefone: telefone || null,
      email_geral: email_geral || null,
      cnpj: formData.cnpj || null,
      codigo_inep: formData.codigo_inep || null,
      site: formData.site || null,
      status_funil: formData.status_funil || 'novo',
      status_qualificacao: 'bruto',
      fonte: 'manual',
    });

    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Erro ao criar escola' };
    }

    const escola = res.data;
    const contatoNome = formData.contato_nome !== undefined ? formData.contato_nome : formData.nome_decisor;
    const contatoEmail = formData.contato_email !== undefined ? formData.contato_email : formData.email_decisor;

    let novoContato: Contato | null = null;
    if ((contatoNome && contatoNome.trim()) || (contatoEmail && contatoEmail.trim())) {
      const contatoRes = await createContato({
        escola_id: escola.id,
        nome: contatoNome ? contatoNome.trim() : null,
        email: contatoEmail ? contatoEmail.trim() : null,
        cargo: formData.contato_cargo || null,
        telefone: formData.contato_telefone || null,
        tipo: 'outro',
        fonte: 'manual',
        principal: true,
      });
      if (contatoRes.data) {
        novoContato = contatoRes.data;
      }
    }

    try {
      revalidatePath('/');
    } catch {
      // Ignora erro fora de contexto HTTP
    }

    const escolaComContatos: EscolaComContatos = {
      ...escola,
      contatos: novoContato ? [novoContato] : [],
    };

    return { success: true, data: escolaComContatos };
  } catch (err) {
    console.error('Erro na server action createLead:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao criar escola',
    };
  }
}

/**
 * Atualiza os dados de uma escola
 */
export async function updateLead(
  leadId: string,
  leadData: Partial<Escola> & {
    nome_escola?: string;
    telefone_escola?: string | null;
    email_escola?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const payload: Partial<Escola> = { ...leadData };
    if (leadData.nome_escola) payload.nome = leadData.nome_escola;
    if (leadData.telefone_escola !== undefined) payload.telefone = leadData.telefone_escola;
    if (leadData.email_escola !== undefined) payload.email_geral = leadData.email_escola;

    delete (payload as Record<string, unknown>).nome_escola;
    delete (payload as Record<string, unknown>).telefone_escola;
    delete (payload as Record<string, unknown>).email_escola;

    const res = await updateEscola(leadId, payload);
    if (res.success) {
      try {
        revalidatePath('/');
      } catch {
        // Ignora
      }
    }
    return res;
  } catch (err) {
    console.error('Erro na server action updateLead:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao atualizar escola',
    };
  }
}

/**
 * Remove uma escola (com cascade para contatos e interações)
 */
export async function deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const res = await deleteEscola(leadId);
    if (res.success) {
      try {
        revalidatePath('/');
      } catch {
        // Ignora
      }
    }
    return res;
  } catch (err) {
    console.error('Erro na server action deleteLead:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao deletar escola',
    };
  }
}

// ==============================================================================
// GESTÃO DE CONTATOS (Decisores de uma Escola)
// ==============================================================================

export async function addContatoAction(
  escolaId: string,
  contatoData: Partial<Contato>
): Promise<{ success: boolean; data?: Contato; error?: string }> {
  await requireUser();
  const res = await createContato({ ...contatoData, escola_id: escolaId });
  if (res.success) {
    try { revalidatePath('/'); } catch {}
  }
  return res;
}

export async function updateContatoAction(
  contatoId: string,
  contatoData: Partial<Contato>
): Promise<{ success: boolean; data?: Contato; error?: string }> {
  await requireUser();
  const res = await updateContato(contatoId, contatoData);
  if (res.success) {
    try { revalidatePath('/'); } catch {}
  }
  return res;
}

export async function deleteContatoAction(
  contatoId: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const res = await deleteContato(contatoId);
  if (res.success) {
    try { revalidatePath('/'); } catch {}
  }
  return res;
}

export async function setContatoPrincipalAction(
  escolaId: string,
  contatoId: string
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const res = await setContatoPrincipal(escolaId, contatoId);
  if (res.success) {
    try { revalidatePath('/'); } catch {}
  }
  return res;
}

export async function getContatosAction(escolaId: string): Promise<Contato[]> {
  await requireUser();
  return getContatosByEscolaId(escolaId);
}

// ==============================================================================
// GESTÃO DE INTERAÇÕES
// ==============================================================================

export async function getInteracoesAction(escolaId: string): Promise<Interacao[]> {
  await requireUser();
  return getInteracoesByEscolaId(escolaId);
}

export async function addInteracaoAction(dados: {
  escola_id: string;
  contato_id?: string | null;
  tipo: Interacao['tipo'];
  assunto?: string | null;
  conteudo?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ success: boolean; data?: Interacao; error?: string }> {
  await requireUser();
  const res = await createInteracao(dados);
  if (res.success) {
    try { revalidatePath('/'); } catch {}
  }
  return res;
}

// ==============================================================================
// ENVIO DE E-MAILS (ETAPA 9 — BREVO API)
// ==============================================================================

export async function sendLeadEmailDirect(leadId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const { data: escola, error: fetchError } = await supabase
      .from('escolas')
      .select('*, contatos(*)')
      .eq('id', leadId)
      .single();

    if (fetchError || !escola) {
      return { success: false, error: 'Escola não encontrada.' };
    }

    const recipient = pickLeadEmail(escola);
    if (!recipient) {
      return {
        success: false,
        error:
          'Escola sem e-mail válido. Cadastre o e-mail real da escola ou do decisor.',
      };
    }

    const principal =
      (escola.contatos as Contato[])?.find((c) => c.principal) ||
      (escola.contatos as Contato[])?.[0];

    const { subject, text, html } = generateLeadEmailContent({
      nome_escola: escola.nome,
      nome_decisor: principal?.nome || null,
    });

    const envioRes = await enviarEmail({
      para: recipient,
      nomeDestinatario: principal?.nome || escola.nome,
      assunto: subject,
      html,
      texto: text,
      escolaId: escola.id,
      contatoId: principal?.id || null,
    });

    // Atualiza status do funil para 'contato_enviado'
    await updateLeadStatus(leadId, 'contato_enviado', escola.status_funil);

    return {
      success: true,
      message: `E-mail enviado com sucesso via Brevo para ${recipient} (Message-ID: ${envioRes.provedorMessageId})!`,
    };
  } catch (err: unknown) {
    console.error('Erro ao enviar e-mail via Brevo:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar e-mail via Brevo API.',
    };
  }
}

export async function markContactSent(leadId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  return updateLeadStatus(leadId, 'contato_enviado');
}

export async function getLastAgentExecution(): Promise<AgenteExecucao | null> {
  await requireUser();
  const { getUltimaExecucao } = await import('@/lib/repositorio/agente');
  return getUltimaExecucao();
}

export async function getLoteHojeAction(): Promise<LoteDiario | null> {
  await requireUser();
  const { getLoteDiarioHoje } = await import('@/lib/repositorio/agente');
  return getLoteDiarioHoje();
}

export async function getHistoricoExecucoesAction(limit = 50): Promise<AgenteExecucao[]> {
  await requireUser();
  const { getHistoricoExecucoes } = await import('@/lib/repositorio/agente');
  return getHistoricoExecucoes(limit);
}

/**
 * Server action protegida que aciona o workflow Agente SDR Diário no GitHub Actions.
 * Utiliza o endpoint oficial POST /repos/{owner}/{repo}/actions/workflows/leadbot.yml/dispatches
 */
export async function triggerAgentWorkflow(params?: { forcar?: boolean }): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  await requireUser();

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO || 'BrunoPinho99/crm-littera';

  if (!token) {
    return {
      success: false,
      error: 'GITHUB_DISPATCH_TOKEN não configurado. Adicione o Personal Access Token com permissão Actions:write nas variáveis de ambiente da Vercel / .env.local.',
    };
  }

  const forcar = Boolean(params?.forcar);

  try {
    const url = `https://api.github.com/repos/${repo}/actions/workflows/leadbot.yml/dispatches`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CRM-Littera-Agent',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          gatilho: 'manual',
          forcar: String(forcar),
        },
      }),
    });

    if (response.status === 204) {
      try {
        revalidatePath('/');
      } catch {
        // Ignora fora de contexto HTTP direto
      }
      return {
        success: true,
        message: forcar
          ? 'Workflow disparado com sucesso! (Modo forçado: nova remessa será gerada)'
          : 'Workflow do Agente SDR disparado com sucesso no GitHub Actions!',
      };
    }

    const errBody = await response.json().catch(() => null);
    const msg = errBody?.message || `GitHub API respondeu com status ${response.status}`;
    return {
      success: false,
      error: `Erro ao acionar workflow no GitHub: ${msg}`,
    };
  } catch (err) {
    console.error('Erro na requisição para GitHub Actions:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha na conexão com GitHub Actions',
    };
  }
}

/**
 * Server action para verificar um e-mail individualmente pela interface (modal).
 * Protegida por requireUser(), aciona o mesmo provedor configurado no servidor.
 */
export async function verificarEmailAction(params: {
  tipo: 'contato' | 'escola';
  id: string;
  email: string;
}): Promise<{
  success: boolean;
  status?: EmailStatus;
  sub_status?: string | null;
  verificado_em?: string;
  error?: string;
}> {
  await requireUser();

  try {
    if (!params.email || !params.email.trim()) {
      return { success: false, error: 'E-mail não informado' };
    }

    const { verificarEmailComCache } = await import('@/lib/verificador-email');
    const resultado = await verificarEmailComCache(params.email, true);
    const verificadoEm = new Date().toISOString();

    if (params.tipo === 'contato') {
      await updateContato(params.id, {
        email_status: resultado.status,
        email_verificado_em: verificadoEm,
      });
    } else {
      await updateEscola(params.id, {
        email_geral_status: resultado.status,
        email_geral_verificado_em: verificadoEm,
      });
    }

    try {
      revalidatePath('/');
    } catch {
      // Ignora fora de contexto HTTP
    }

    return {
      success: true,
      status: resultado.status,
      sub_status: resultado.sub_status,
      verificado_em: verificadoEm,
    };
  } catch (err) {
    console.error('Erro na server action verificarEmailAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao verificar e-mail',
    };
  }
}

/**
 * Busca todos os parâmetros de configuração de score
 */
export async function getConfigScoreAction() {
  await requireUser();
  return await getConfigScores();
}

/**
 * Atualiza o valor de um peso/parâmetro de score
 */
export async function updateConfigScoreAction(
  chave: string, 
  valor: number | null, 
  valor_texto?: string | null
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const res = await updateConfigScore(chave, valor, valor_texto);
  if (res.success) {
    try {
      revalidatePath('/configuracoes/score');
      revalidatePath('/');
    } catch {
      // Ignora fora de contexto HTTP
    }
  }
  return res;
}

/**
 * Recalcula os scores de todas as escolas no banco usando a função calcular_score()
 */
export async function recalcularScoresAction(): Promise<{ success: boolean; count?: number; error?: string }> {
  await requireUser();
  const res = await recalcularTodosScores();
  if (res.success) {
    try {
      revalidatePath('/configuracoes/score');
      revalidatePath('/');
    } catch {
      // Ignora fora de contexto HTTP
    }
  }
  return res;
}


