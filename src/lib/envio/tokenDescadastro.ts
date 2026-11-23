import crypto from 'node:crypto';

export interface TokenDescadastroPayload {
  email: string;
  escolaId?: string | null;
  contatoId?: string | null;
  timestamp?: number;
}

function getUnsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('UNSUBSCRIBE_SECRET não configurada no ambiente.');
    }
    // Chave padrão determinística para ambiente de desenvolvimento / testes locais
    return 'chave-secreta-padrao-descadastro-littera-32bytes-min';
  }
  return secret;
}

/**
 * Gera um token assinado por HMAC-SHA256 contendo os dados do destinatário para descadastro seguro.
 * Formato: base64url(payload).base64url(assinatura)
 */
export function gerarTokenDescadastro(payload: TokenDescadastroPayload): string {
  const secret = getUnsubscribeSecret();
  const dadosNormalizados: TokenDescadastroPayload = {
    email: payload.email.trim().toLowerCase(),
    escolaId: payload.escolaId || null,
    contatoId: payload.contatoId || null,
    timestamp: payload.timestamp || Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(dadosNormalizados), 'utf-8').toString('base64url');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadB64);
  const assinaturaB64 = hmac.digest('base64url');

  return `${payloadB64}.${assinaturaB64}`;
}

/**
 * Valida a integridade do token usando verificação em tempo constante (timingSafeEqual).
 * Retorna o payload decodificado se válido, ou null se adulterado/inválido.
 */
export function validarTokenDescadastro(token: string): TokenDescadastroPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const partes = token.split('.');
  if (partes.length !== 2) {
    return null;
  }

  const [payloadB64, assinaturaB64] = partes;
  if (!payloadB64 || !assinaturaB64) {
    return null;
  }

  const secret = getUnsubscribeSecret();

  // Recalcula a assinatura esperada
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadB64);
  const assinaturaEsperadaB64 = hmac.digest('base64url');

  const bufRecebida = Buffer.from(assinaturaB64, 'utf-8');
  const bufEsperada = Buffer.from(assinaturaEsperadaB64, 'utf-8');

  // Proteção contra timing attack
  if (bufRecebida.length !== bufEsperada.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(bufRecebida, bufEsperada)) {
    return null;
  }

  try {
    const rawJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const parsed = JSON.parse(rawJson) as TokenDescadastroPayload;

    if (!parsed || typeof parsed.email !== 'string' || !parsed.email.includes('@')) {
      return null;
    }

    return {
      email: parsed.email.trim().toLowerCase(),
      escolaId: parsed.escolaId || null,
      contatoId: parsed.contatoId || null,
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}
