const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.trim();
  return EMAIL_RE.test(e);
}

/**
 * Retorna o melhor e-mail utilizável (contato principal primeiro, depois outros contatos, depois email_geral).
 */
export function pickLeadEmail(item?: {
  email_decisor?: string | null;
  email_escola?: string | null;
  email_geral?: string | null;
  contatos?: Array<{ email?: string | null; principal?: boolean }>;
} | null): string | null {
  if (!item) return null;

  // 1. Contato principal
  const principal = item.contatos?.find((c) => c.principal);
  if (principal && isValidEmail(principal.email)) return principal.email!.trim();

  // 2. Qualquer contato com e-mail
  const anyContact = item.contatos?.find((c) => isValidEmail(c.email));
  if (anyContact && isValidEmail(anyContact.email)) return anyContact.email!.trim();

  // 3. Legado email_decisor
  if (isValidEmail(item.email_decisor)) return item.email_decisor!.trim();

  // 4. E-mail geral da escola
  if (isValidEmail(item.email_geral)) return item.email_geral!.trim();
  if (isValidEmail(item.email_escola)) return item.email_escola!.trim();

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
