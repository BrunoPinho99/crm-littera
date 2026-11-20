const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Padrão de e-mails INVENTADOS por versões antigas do agente (ex: secretaria.colegioema@educacao.df.br).
// Esses endereços não existem de verdade e nunca devem ser usados em disparos.
const FAKE_GENERATED_RE =
  /^(secretaria|diretoria|diretor|contato)\.[a-z0-9]+@(educacao\.df\.br|escola\.df\.gov\.br|ensino\.com\.br|gmail\.com)$/i;

export function isValidEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.trim();
  return EMAIL_RE.test(e) && !FAKE_GENERATED_RE.test(e);
}

/** Retorna o melhor e-mail utilizável do lead (decisor primeiro, depois escola). */
export function pickLeadEmail(lead: {
  email_decisor?: string | null;
  email_escola?: string | null;
}): string | null {
  if (isValidEmail(lead.email_decisor)) return lead.email_decisor!.trim();
  if (isValidEmail(lead.email_escola)) return lead.email_escola!.trim();
  return null;
}

/** Telefone fixo brasileiro: 8 dígitos começando em 2-5 (após o DDD). */
export function isLandline(phone?: string | null): boolean {
  if (!phone) return false;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10) return /^[2-5]/.test(d.slice(2));
  if (d.length === 8) return /^[2-5]/.test(d);
  return false;
}
