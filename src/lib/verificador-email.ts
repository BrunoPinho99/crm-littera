import 'server-only';
import dns from 'dns/promises';
import { EmailStatus } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface ResultadoVerificacaoEmail {
  status: EmailStatus;
  sub_status: string | null;
  provedor: string;
  bruto: Record<string, unknown>;
  email_generico: boolean;
  custo_usd: number;
}

const DOMINIOS_DESCARTAVEIS = new Set([
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'throwawaymail.com', 'yopmail.com', 'trashmail.com', 'fakeinbox.com',
  'sharklasers.com', 'dispostable.com', 'burnermail.io', 'getairmail.com',
  'mohmal.com', 'crazymailing.com', 'temp-mail.org', 'nada.ltd'
]);

const DOMINIOS_GENERICOS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
  'bol.com.br', 'uol.com.br', 'icloud.com', 'live.com', 'proton.me',
  'protonmail.com', 'terra.com.br', 'ig.com.br'
]);

const REGEX_EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validarSintaxe(email: string): boolean {
  if (!email || email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [localPart] = parts;
  if (!localPart || localPart.length > 64) return false;
  if (email.includes('..')) return false;
  return REGEX_EMAIL.test(email);
}

export async function validarMx(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Executa a checagem com o provedor externo configurado (ZeroBounce, MillionVerifier ou NeverBounce).
 */
export async function verificarEmail(email: string): Promise<ResultadoVerificacaoEmail> {
  const emailLimpo = email.trim().toLowerCase();

  // 1. Checagem Sintática RFC
  if (!validarSintaxe(emailLimpo)) {
    return {
      status: 'invalido',
      sub_status: 'sintaxe_invalida',
      provedor: 'local',
      bruto: { motivo: 'Formato inválido de e-mail (RFC 5322)' },
      email_generico: false,
      custo_usd: 0,
    };
  }

  const domain = emailLimpo.split('@')[1];
  const emailGenerico = DOMINIOS_GENERICOS.has(domain);

  // 2. Checagem de Domínio Descartável
  if (DOMINIOS_DESCARTAVEIS.has(domain)) {
    return {
      status: 'invalido',
      sub_status: 'descartavel',
      provedor: 'local',
      bruto: { motivo: 'Domínio descartável/temporário' },
      email_generico: emailGenerico,
      custo_usd: 0,
    };
  }

  // 3. Checagem de Servidor MX
  const temMx = await validarMx(domain);
  if (!temMx) {
    return {
      status: 'invalido',
      sub_status: 'sem_mx',
      provedor: 'local',
      bruto: { motivo: 'Domínio não possui registro MX' },
      email_generico: emailGenerico,
      custo_usd: 0,
    };
  }

  const provedor = (process.env.EMAIL_VERIFIER || 'zerobounce').toLowerCase();
  const apiKey = (process.env.EMAIL_VERIFIER_API_KEY || '').trim();

  if (!apiKey) {
    return {
      status: 'desconhecido',
      sub_status: 'sem_chave_api',
      provedor: 'local',
      bruto: { aviso: 'EMAIL_VERIFIER_API_KEY não configurada' },
      email_generico: emailGenerico,
      custo_usd: 0,
    };
  }

  if (provedor === 'zerobounce') {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(emailLimpo)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await resp.json();

    if (data.error && (data.error.includes('credit') || data.error.includes('balance'))) {
      throw new Error(`ZeroBounce: Créditos esgotados (${data.error})`);
    }

    const zbStatus = (data.status || '').toLowerCase();
    let status: EmailStatus = 'desconhecido';
    if (zbStatus === 'valid') status = 'valido';
    else if (zbStatus === 'invalid') status = 'invalido';
    else if (zbStatus === 'catch-all') status = 'catch_all';
    else if (['spamtrap', 'abuse', 'do_not_mail'].includes(zbStatus)) status = 'arriscado';

    return {
      status,
      sub_status: data.sub_status || null,
      provedor: 'zerobounce',
      bruto: data,
      email_generico: emailGenerico,
      custo_usd: 0.0075,
    };
  }

  if (provedor === 'millionverifier') {
    const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(emailLimpo)}&timeout=10`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await resp.json();

    if (data.error || data.result === 'credit_error' || data.credits === 0) {
      throw new Error(`MillionVerifier: Créditos esgotados (${data.error || 'credit_error'})`);
    }

    const resCode = data.resultcode;
    const resStr = (data.result || '').toLowerCase();
    let status: EmailStatus = 'desconhecido';
    if (resCode === 1 || resStr === 'ok') status = 'valido';
    else if (resCode === 2 || resStr === 'bad') status = 'invalido';
    else if (resCode === 3 || resStr === 'catch_all') status = 'catch_all';
    else if ([5, 6].includes(resCode) || ['spamtrap', 'disposable'].includes(resStr)) status = 'arriscado';

    return {
      status,
      sub_status: data.subresult || null,
      provedor: 'millionverifier',
      bruto: data,
      email_generico: emailGenerico,
      custo_usd: 0.0035,
    };
  }

  if (provedor === 'neverbounce') {
    const url = `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(emailLimpo)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await resp.json();

    if (data.status === 'auth_failure' || (data.message && data.message.toLowerCase().includes('credit'))) {
      throw new Error(`NeverBounce: Falha de autenticação ou créditos esgotados (${data.message})`);
    }

    const nbResult = (data.result || '').toLowerCase();
    let status: EmailStatus = 'desconhecido';
    if (nbResult === 'valid') status = 'valido';
    else if (nbResult === 'invalid') status = 'invalido';
    else if (nbResult === 'catchall') status = 'catch_all';
    else if (nbResult === 'disposable') status = 'arriscado';

    return {
      status,
      sub_status: nbResult,
      provedor: 'neverbounce',
      bruto: data,
      email_generico: emailGenerico,
      custo_usd: 0.0080,
    };
  }

  throw new Error(`Provedor de e-mail não suportado: ${provedor}`);
}

/**
 * Verifica o e-mail consultando antes o cache de 90 dias em verificacoes_email.
 */
export async function verificarEmailComCache(
  email: string,
  forcar: boolean = false
): Promise<ResultadoVerificacaoEmail> {
  const emailLimpo = email.trim().toLowerCase();

  if (!forcar) {
    const limite90Dias = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabaseAdmin
      .from('verificacoes_email')
      .select('*')
      .eq('email', emailLimpo)
      .gte('verificado_em', limite90Dias)
      .maybeSingle();

    if (cached) {
      return {
        status: cached.status as EmailStatus,
        sub_status: cached.sub_status,
        provedor: cached.provedor,
        bruto: (cached.resposta as Record<string, unknown>) || {},
        email_generico: DOMINIOS_GENERICOS.has(emailLimpo.split('@')[1] || ''),
        custo_usd: 0,
      };
    }
  }

  // Executa nova verificação
  const resultado = await verificarEmail(emailLimpo);

  // Grava no cache
  await supabaseAdmin
    .from('verificacoes_email')
    .upsert({
      email: emailLimpo,
      status: resultado.status,
      sub_status: resultado.sub_status,
      provedor: resultado.provedor,
      resposta: resultado.bruto,
      verificado_em: new Date().toISOString(),
    });

  return resultado;
}
