'use server';

import { getEmailTransporter, generateLeadEmailContent, GMAIL_USER } from '@/lib/email';
import { revalidatePath } from 'next/cache';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { 
  EscolaComContatos, 
  Escola, 
  Contato, 
  Interacao, 
  StatusFunil, 
  AgenteExecucao 
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
  oldStatus?: StatusFunil
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  try {
    const res = await updateStatusFunil(leadId, newStatus);
    if (!res.success) {
      return res;
    }

    // Registra a interação de mudança de status
    await createInteracao({
      escola_id: leadId,
      tipo: 'mudanca_status',
      assunto: 'Alteração de status no funil',
      conteudo: `Status alterado de "${oldStatus || 'não especificado'}" para "${newStatus}".`,
      metadata: { de: oldStatus || null, para: newStatus },
    });

    try {
      revalidatePath('/');
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
// ENVIO DE E-MAILS
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

    const principal = (escola.contatos as Contato[])?.find((c) => c.principal);
    const { subject, text, html } = generateLeadEmailContent({
      nome_escola: escola.nome,
      nome_decisor: principal?.nome || null,
    });

    const transporter = getEmailTransporter();
    if (!transporter) {
      return {
        success: false,
        error:
          'Envio de e-mail não configurado. Nenhum e-mail foi enviado e o status não foi alterado.',
      };
    }

    const senderEmail = GMAIL_USER || 'contato@littera.com.br';
    const info = await transporter.sendMail({
      from: `"Littera Educacional" <${senderEmail}>`,
      to: recipient,
      subject,
      text,
      html,
    });

    if (info.rejected && info.rejected.length > 0) {
      return { success: false, error: `Gmail rejeitou o destinatário: ${info.rejected.join(', ')}` };
    }

    // Atualiza status do funil para 'contato_enviado'
    await updateLeadStatus(leadId, 'contato_enviado', escola.status_funil);

    // Registra a interação de envio de e-mail
    await createInteracao({
      escola_id: leadId,
      contato_id: principal?.id || null,
      tipo: 'email_enviado',
      assunto: subject,
      conteudo: text,
      metadata: { recipient, messageId: info.messageId },
    });

    return {
      success: true,
      message: `E-mail enviado com sucesso para ${recipient}!`,
    };
  } catch (err: unknown) {
    console.error('Erro ao enviar e-mail:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar e-mail via Gmail.',
    };
  }
}

export async function markContactSent(leadId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  return updateLeadStatus(leadId, 'contato_enviado');
}

export async function getLastAgentExecution(): Promise<AgenteExecucao | null> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('agente_execucoes')
      .select('*')
      .order('iniciado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar última execução do agente:', error);
      return null;
    }

    return (data as AgenteExecucao) || null;
  } catch (err) {
    console.error('Falha na requisição de agente_execucoes:', err);
    return null;
  }
}

export async function runAgentScout(_count = 20): Promise<{
  success: boolean;
  message?: string;
  count?: number;
  error?: string;
}> {
  void _count;
  await requireUser();

  return {
    success: false,
    error: 'Agente em reconstrução: será ligado na Etapa 8',
  };
}
