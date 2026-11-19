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

export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadEscolar['status']
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('leads_escolares')
      .update({
        status: newStatus,
        ultima_interacao: now,
      })
      .eq('id', leadId);

    if (error) {
      console.error('Erro ao atualizar status do lead:', error);
      return { success: false, error: error.message };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action updateLeadStatus:', err);
    return { success: false, error: 'Erro interno ao atualizar lead' };
  }
}

export async function createLead(leadData: Omit<LeadEscolar, 'id' | 'created_at' | 'ultima_interacao'>): Promise<{ success: boolean; data?: LeadEscolar; error?: string }> {
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

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true, data: data as LeadEscolar };
  } catch (err) {
    console.error('Erro na server action createLead:', err);
    return { success: false, error: 'Erro interno ao criar lead' };
  }
}

export async function updateLead(
  leadId: string,
  leadData: Partial<Omit<LeadEscolar, 'id' | 'created_at'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('leads_escolares')
      .update(leadData)
      .eq('id', leadId);

    if (error) {
      console.error('Erro ao atualizar lead:', error);
      return { success: false, error: error.message };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action updateLead:', err);
    return { success: false, error: 'Erro interno ao atualizar lead' };
  }
}

export async function deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('leads_escolares')
      .delete()
      .eq('id', leadId);

    if (error) {
      console.error('Erro ao excluir lead:', error);
      return { success: false, error: error.message };
    }

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action deleteLead:', err);
    return { success: false, error: 'Erro interno ao deletar lead' };
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

    try {
      revalidatePath('/');
    } catch {
      // revalidatePath pode falhar fora do contexto de requisição HTTP (ex: testes locais)
    }
    return { success: true };
  } catch (err) {
    console.error('Erro na server action markContactSent:', err);
    return { success: false, error: 'Erro interno ao atualizar lead' };
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
  const uppercaseWords = new Set(['ce', 'cei', 'cem', 'caas', 'df', 'jk', 'cmdp', 'cmdpii', 'sesi', 'senai', 'sesc', 'unb']);

  const formatted = words.map((w) => {
    const lw = w.toLowerCase().replace(/^[.,-]+|[.,-]+$/g, '');
    if (uppercaseWords.has(lw)) return lw.toUpperCase();
    if (lowercaseWords.has(lw)) return lw;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });

  return formatted.join(' ');
}

function inferDecisor(name: string): { decisor: string; email: string } {
  const norm = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const slug = norm.replace(/[^a-z0-9]/g, '').slice(0, 14);

  if (/infantil|baby|crianca|pequeno|creche|bercario/.test(norm)) {
    return {
      decisor: 'Direção Pedagógica da Educação Infantil',
      email: `diretoria.${slug}@educacao.df.br`,
    };
  }
  if (/vestibular|olimpico|aprovacao|curso|exito|alfa/.test(norm)) {
    return {
      decisor: 'Direção / Coordenação do Pré-Vestibular',
      email: `contato.${slug}@educacao.df.br`,
    };
  }
  return {
    decisor: 'Coordenação Pedagógica & Ensino Médio',
    email: `secretaria.${slug}@educacao.df.br`,
  };
}

export async function runAgentScout(count: number = 20): Promise<{
  success: boolean;
  insertedCount: number;
  newLeads: LeadEscolar[];
  message: string;
}> {
  try {
    const baseUrl = 'https://qualotelefone.com/df/brasilia/escolas-particulares';
    let currentUrl = baseUrl;
    const candidates: Array<{
      name: string;
      bairro: string;
      detailUrl: string;
      decisor: string;
      email: string;
    }> = [];

    // Busca nomes existentes no banco para não duplicar
    const { data: existingData } = await supabase
      .from('leads_escolares')
      .select('nome_escola');

    const existingNames = new Set(
      (existingData || []).map((item) =>
        item.nome_escola
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      )
    );

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

        if (existingNames.has(normKey) || cleanName.length < 4) {
          continue;
        }

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

    if (candidates.length === 0) {
      return {
        success: true,
        insertedCount: 0,
        newLeads: [],
        message: 'Todos os leads encontrados já constam no CRM!',
      };
    }

    // Enriquecimento concorrente dos telefones e contatos
    const enriched = await Promise.all(
      candidates.map(async (item) => {
        let phone: string | null = null;
        try {
          const detRes = await fetch(item.detailUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
            signal: AbortSignal.timeout(4000),
          });
          if (detRes.ok) {
            const h = await detRes.text();
            const tels = [...h.matchAll(/href=["']tel:([^"']+)["']/g)].map((m) => m[1]);
            const tel61 = tels.find((t) => t.startsWith('61'));
            const selected = tel61 || tels[0];
            if (selected) {
              phone = formatPhone(selected);
            }
          }
        } catch {
          // ignora falha de detalhe e mantém lead com email e decisor
        }

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

    // Salva no Supabase via REST / Client
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
