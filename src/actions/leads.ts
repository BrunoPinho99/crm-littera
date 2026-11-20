'use server';

import { getEmailTransporter, generateLeadEmailContent, GMAIL_USER } from '@/lib/email';
import { revalidatePath } from 'next/cache';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { LeadEscolar } from '@/types/database';
import { pickLeadEmail } from '@/lib/contact';

export async function getLeads(): Promise<LeadEscolar[]> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

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

export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadEscolar['status']
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('leads_escolares')
      .update({
        status: newStatus,
        ultima_interacao: now,
      })
      .eq('id', leadId)
      .select('id');

    if (error) {
      console.error('Erro ao atualizar status do lead:', error);
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Nenhum registro atualizado: sem permissão ou lead inexistente.',
      };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action updateLeadStatus:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao atualizar lead',
    };
  }
}

export async function createLead(
  leadData: Omit<LeadEscolar, 'id' | 'created_at' | 'ultima_interacao'>
): Promise<{ success: boolean; data?: LeadEscolar; error?: string }> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('leads_escolares')
      .insert([leadData])
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar lead:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return {
        success: false,
        error: 'Nenhum lead criado: sem permissão ou dados inválidos.',
      };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true, data: data as LeadEscolar };
  } catch (err) {
    console.error('Erro na server action createLead:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao criar lead',
    };
  }
}

export async function updateLead(
  leadId: string,
  leadData: Partial<Omit<LeadEscolar, 'id' | 'created_at'>>
): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('leads_escolares')
      .update(leadData)
      .eq('id', leadId)
      .select('id');

    if (error) {
      console.error('Erro ao atualizar lead:', error);
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Nenhum registro atualizado: sem permissão ou lead inexistente.',
      };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action updateLead:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao atualizar lead',
    };
  }
}

export async function deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('leads_escolares')
      .delete()
      .eq('id', leadId)
      .select('id');

    if (error) {
      console.error('Erro ao excluir lead:', error);
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Nada foi excluído: sem permissão ou lead inexistente.',
      };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action deleteLead:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao deletar lead',
    };
  }
}

export async function markContactSent(leadId: string): Promise<{ success: boolean; error?: string }> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('leads_escolares')
      .update({
        status: 'contato_enviado',
        ultima_interacao: now,
      })
      .eq('id', leadId)
      .select('id');

    if (error) {
      console.error('Erro ao atualizar status do lead:', error);
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Nenhum registro atualizado: sem permissão ou lead inexistente.',
      };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action markContactSent:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno ao atualizar lead',
    };
  }
}

// ==============================================================================
// PROSPECÇÃO ATIVA DO AGENTE SDR (ICP: Escolas Particulares e Colégios no DF)
// Disparada ao clicar no botão "Ativar Agente / Buscar Leads ICP"
// ==============================================================================

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const d = digits.slice(2);
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 8) {
    return `(61) ${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.length === 9) {
    return `(61) ${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return raw;
}

function cleanSchoolName(raw: string): string {
  const unescaped = raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  const words = unescaped.split(/\s+/);
  const lowercaseWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com']);
  const uppercaseWords = new Set([
    'ce',
    'cei',
    'cem',
    'caas',
    'df',
    'jk',
    'cmdp',
    'cmdpii',
    'sesi',
    'senai',
    'sesc',
    'unb',
  ]);

  const formatted = words.map((w) => {
    const lw = w.toLowerCase().replace(/^[.,-]+|[.,-]+$/g, '');
    if (uppercaseWords.has(lw)) return lw.toUpperCase();
    if (lowercaseWords.has(lw)) return lw;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });

  return formatted.join(' ');
}

// Importante: NÃO inventamos e-mails. As fontes públicas (qualotelefone) só trazem telefone,
// então o e-mail fica vazio até ser cadastrado manualmente ou enriquecido via CNPJ/Apify.
function inferDecisor(name: string): { decisor: string; email: string | null } {
  const norm = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/infantil|baby|crianca|pequeno|creche|bercario/.test(norm)) {
    return { decisor: 'Direção Pedagógica da Educação Infantil', email: null };
  }
  if (/vestibular|olimpico|aprovacao|curso|exito|alfa/.test(norm)) {
    return { decisor: 'Direção / Coordenação do Pré-Vestibular', email: null };
  }
  return { decisor: 'Coordenação Pedagógica & Ensino Médio', email: null };
}

async function fetchPhone(detailUrl: string): Promise<string | null> {
  try {
    const detRes = await fetch(detailUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!detRes.ok) return null;
    const h = await detRes.text();
    const tels = [...h.matchAll(/href=["']tel:([^"']+)["']/g)].map((m) =>
      m[1].replace(/\D/g, '')
    );
    const selected = tels.find((t) => t.startsWith('61') || t.startsWith('5561')) || tels[0];
    return selected ? formatPhone(selected) : null;
  } catch {
    return null;
  }
}

export async function runAgentScout(count: number = 20): Promise<{
  success: boolean;
  insertedCount: number;
  newLeads: LeadEscolar[];
  message: string;
}> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const baseUrl = 'https://qualotelefone.com/df/brasilia/escolas-particulares';
    let currentUrl = baseUrl;
    const candidates: Array<{
      name: string;
      bairro: string;
      detailUrl: string;
      decisor: string;
      email: string | null;
    }> = [];

    // Busca nomes existentes no banco para não duplicar
    const { data: existingData } = await supabase
      .from('leads_escolares')
      .select('id, nome_escola, telefone_escola');

    const normName = (n: string) =>
      n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const existingNames = new Set((existingData || []).map((item) => normName(item.nome_escola)));
    // Leads já cadastrados SEM telefone: o agente tenta completar o contato em vez de ignorá-los
    const missingPhoneByName = new Map<string, { id: string; detailUrl: string }>();

    for (let page = 1; page <= 5; page++) {
      if (candidates.length >= count) break;

      const res = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        cache: 'no-store',
      });

      if (!res.ok) break;

      const rawHtml = await res.text();
      const cardMatches = [
        ...rawHtml.matchAll(
          /<a[^>]+href=["'](https:\/\/qualotelefone\.com\/df\/brasilia\/escolas-particulares\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g
        ),
      ];

      for (const match of cardMatches) {
        const href = match[1];
        const inner = match[2];

        const nameMatch = inner.match(/<h3[^>]*>(.*?)<\/h3>/);
        if (!nameMatch) continue;

        const rawName = nameMatch[1].trim();
        if (/transporte|condominio|condomínio|autoescola|auto escola|estacionamento/i.test(rawName)) {
          continue;
        }

        const cleanName = cleanSchoolName(rawName);
        const normKey = cleanName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

        if (existingNames.has(normKey)) {
          const ex = (existingData || []).find((i) => normName(i.nome_escola) === normKey);
          if (ex && !ex.telefone_escola && !missingPhoneByName.has(normKey)) {
            missingPhoneByName.set(normKey, { id: ex.id, detailUrl: href });
          }
          continue;
        }
        if (cleanName.length < 4) continue;

        existingNames.add(normKey);

        const addrMatch = inner.match(/<span>(.*?)<\/span>/);
        const addr = addrMatch ? addrMatch[1].trim() : 'Brasília, DF';
        let bairro = 'Brasília';
        if (addr.includes('•')) {
          const part = addr.split('•')[0];
          if (part.includes('-')) {
            bairro = part.split('-').pop()?.trim() || 'Brasília';
          }
        }

        const { decisor, email } = inferDecisor(cleanName);

        candidates.push({
          name: cleanName,
          bairro,
          detailUrl: href,
          decisor,
          email,
        });

        if (candidates.length >= count) break;
      }

      const cursorMatch = [...rawHtml.matchAll(/after=([0-9]+)/g)];
      if (cursorMatch.length > 0) {
        currentUrl = `${baseUrl}?after=${cursorMatch[cursorMatch.length - 1][1]}`;
      } else {
        break;
      }
    }

    // Atualiza contatos de leads existentes que estavam sem telefone
    let updatedCount = 0;
    await Promise.all(
      [...missingPhoneByName.values()].map(async ({ id, detailUrl }) => {
        const phone = await fetchPhone(detailUrl);
        if (!phone) return;
        const { data: upd } = await supabase
          .from('leads_escolares')
          .update({ telefone_escola: phone })
          .eq('id', id)
          .select('id');
        if (upd && upd.length > 0) updatedCount++;
      })
    );

    if (candidates.length === 0) {
      return {
        success: true,
        insertedCount: 0,
        newLeads: [],
        message:
          updatedCount > 0
            ? `Nenhum lead novo, mas ${updatedCount} contato(s) existente(s) foram atualizados com telefone.`
            : 'Todos os leads encontrados já constam no CRM!',
      };
    }

    // Enriquecimento concorrente dos telefones e contatos
    const enriched = await Promise.all(
      candidates.map(async (item) => {
        const phone = await fetchPhone(item.detailUrl);
        return {
          nome_escola: item.name,
          cidade: 'Brasília',
          telefone_escola: phone,
          email_escola: item.email,
          nome_decisor: item.decisor,
          email_decisor: null,
          status: 'novo' as const,
          ultima_interacao: null,
        };
      })
    );

    // Salva no Supabase via cliente do usuário autenticado
    const { data: inserted, error: insertError } = await supabase
      .from('leads_escolares')
      .insert(enriched)
      .select();

    if (insertError) {
      console.error('Erro ao gravar leads prospectados no Supabase:', insertError);
      return {
        success: false,
        insertedCount: 0,
        newLeads: [],
        message: `Erro no Supabase: ${insertError.message}`,
      };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }

    return {
      success: true,
      insertedCount: (inserted || []).length,
      newLeads: (inserted as LeadEscolar[]) || [],
      message: `${(inserted || []).length} novos leads escolares de Brasília/DF capturados e qualificados com sucesso!`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Erro no runAgentScout:', errorMsg);
    return {
      success: false,
      insertedCount: 0,
      newLeads: [],
      message: `Erro na execução do agente: ${errorMsg}`,
    };
  }
}

export async function sendLeadEmailDirect(leadId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  simulated?: boolean;
}> {
  await requireUser();
  const supabase = await createServerSupabaseClient();

  try {
    const { data: lead, error: fetchError } = await supabase
      .from('leads_escolares')
      .select('*')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return { success: false, error: 'Lead não encontrado.' };
    }

    const recipient = pickLeadEmail(lead);
    if (!recipient) {
      return {
        success: false,
        error:
          'Lead sem e-mail válido. Cadastre o e-mail real da escola (editar lead). E-mails gerados automaticamente não são aceitos.',
      };
    }

    const { subject, text, html } = generateLeadEmailContent({
      nome_escola: lead.nome_escola,
      nome_decisor: lead.nome_decisor,
    });

    const transporter = getEmailTransporter();
    if (!transporter) {
      return {
        success: false,
        error: 'GMAIL_APP_PASSWORD não configurada — nenhum e-mail foi enviado.',
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

    const marked = await markContactSent(leadId);
    if (!marked.success) {
      return {
        success: true,
        message: `E-mail enviado para ${recipient}, mas falhou ao atualizar o status: ${marked.error}`,
      };
    }

    return {
      success: true,
      simulated: false,
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
