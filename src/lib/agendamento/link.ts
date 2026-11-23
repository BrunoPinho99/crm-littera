import { Escola, Contato } from '@/types/database';

/**
 * Monta o link personalizado de agendamento de reunião.
 * 
 * - Opção A (Cal.com): utiliza CALCOM_EVENT_URL com pré-preenchimento
 *   de 'name', 'email' e metadados 'metadata[escola_id]' e 'metadata[contato_id]'.
 * - Opção B (Google Agenda): utiliza GOOGLE_AGENDA_URL limpa, sem parâmetros.
 */
export function linkAgenda(
  escola?: Partial<Escola> | null,
  contato?: Partial<Contato> | null
): string {
  const calcomBase = process.env.CALCOM_EVENT_URL;
  const googleBase = process.env.GOOGLE_AGENDA_URL;

  // Se estiver configurado explicitamente para Google Agenda
  if (googleBase && !calcomBase) {
    return googleBase;
  }

  // Padrão: Cal.com
  const baseUrl = calcomBase || 'https://cal.com/littera/conversa-30min';

  try {
    const url = new URL(baseUrl);

    if (contato?.nome && contato.nome.trim()) {
      url.searchParams.set('name', contato.nome.trim());
    }

    if (contato?.email && contato.email.trim()) {
      url.searchParams.set('email', contato.email.trim().toLowerCase());
    }

    if (escola?.id) {
      url.searchParams.set('metadata[escola_id]', escola.id);
    }

    if (contato?.id) {
      url.searchParams.set('metadata[contato_id]', contato.id);
    }

    return url.toString();
  } catch {
    // Fallback caso a URL seja relativa ou malformada
    const params = new URLSearchParams();
    if (contato?.nome && contato.nome.trim()) params.set('name', contato.nome.trim());
    if (contato?.email && contato.email.trim()) params.set('email', contato.email.trim().toLowerCase());
    if (escola?.id) params.set('metadata[escola_id]', escola.id);
    if (contato?.id) params.set('metadata[contato_id]', contato.id);

    const qs = params.toString();
    if (!qs) return baseUrl;
    return baseUrl.includes('?') ? `${baseUrl}&${qs}` : `${baseUrl}?${qs}`;
  }
}
