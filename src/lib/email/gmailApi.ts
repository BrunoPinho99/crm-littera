import { CaixaEnvio } from '@/types/database';

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    size?: number;
    data?: string; // base64url
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessagePayload {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  raw?: string;
}

export interface DadosMensagemExtraida {
  provedorMessageId: string;
  provedorThreadId: string;
  de: string;
  remetenteEmail: string;
  para: string;
  assunto: string;
  data: string;
  recebidoEm: string;
  rfcMessageId: string | null;
  inReplyTo?: string;
  references: string[];
  autoSubmitted: string | null;
  xAutoreply: string | null;
  precedence: string | null;
  xFailedRecipients: string | null;
  headers: Record<string, string>;
  corpoTexto: string;
  corpoLimpo: string; // sem citações nem rodapés
  isEnviadoPorMim: boolean;
}

export function extrairEmailDeString(deOuPara: string): string {
  const match = deOuPara.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].trim().toLowerCase();
  }
  return deOuPara.trim().toLowerCase();
}

/**
 * Decodifica string codificada em Base64URL do Gmail para UTF-8
 */
export function decodificarBase64Url(base64UrlStr: string): string {
  try {
    const base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    const buff = Buffer.from(base64, 'base64');
    return buff.toString('utf-8');
  } catch (err) {
    console.warn('Erro ao decodificar base64url do Gmail:', err);
    return '';
  }
}

/**
 * Remove tags HTML simples caso o corpo venha apenas em HTML
 */
export function limparHtmlParaTexto(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .trim();
}

/**
 * Extrai texto recursivamente de uma árvore MIME do Gmail
 */
export function extrairCorpoDeParts(part?: GmailMessagePart): { texto: string; html: string } {
  if (!part) return { texto: '', html: '' };

  let texto = '';
  let html = '';

  if (part.body?.data) {
    const decodificado = decodificarBase64Url(part.body.data);
    if (part.mimeType === 'text/html') {
      html += decodificado;
    } else {
      texto += decodificado;
    }
  }

  if (part.parts && part.parts.length > 0) {
    for (const subPart of part.parts) {
      const res = extrairCorpoDeParts(subPart);
      if (res.texto) texto += (texto ? '\n' : '') + res.texto;
      if (res.html) html += (html ? '\n' : '') + res.html;
    }
  }

  return { texto, html };
}

/**
 * Remove citações do e-mail anterior, cabeçalhos de resposta e assinaturas
 * (ex: linhas "Em ... escreveu:", "On ... wrote:", blocos iniciados com >)
 */
export function extrairTextoNovoResposta(corpoTexto: string): string {
  if (!corpoTexto || !corpoTexto.trim()) return '';

  const linhas = corpoTexto.split(/\r?\n/);
  const linhasLimpas: string[] = [];

  for (const linha of linhas) {
    const trimmed = linha.trim();

    // 1. Linhas que começam com citação '>'
    if (trimmed.startsWith('>')) {
      continue;
    }

    // 2. Marcadores padrão de histórico de e-mail
    if (
      /^em\s+.+,\s+.+\s+escreveu:?$/i.test(trimmed) ||
      /^on\s+.+wrote:?$/i.test(trimmed) ||
      /^em\s+\d{1,2}\/\d{1,2}\/\d{2,4}.+escreveu:?$/i.test(trimmed) ||
      /^-----mensagem original-----/i.test(trimmed) ||
      /^-----original message-----/i.test(trimmed) ||
      /^de:\s+.+$/i.test(trimmed) ||
      /^from:\s+.+$/i.test(trimmed)
    ) {
      // Chegou ao histórico citado, encerra o texto novo da resposta
      break;
    }

    // 3. Separadores de assinatura comuns
    if (trimmed === '--' || trimmed === '---' || trimmed === '___') {
      break;
    }

    linhasLimpas.push(linha);
  }

  // Remove linhas vazias no final
  while (linhasLimpas.length > 0 && !linhasLimpas[linhasLimpas.length - 1].trim()) {
    linhasLimpas.pop();
  }

  const resultado = linhasLimpas.join('\n').trim();
  return resultado || corpoTexto.trim();
}

/**
 * Normaliza e extrai dados estruturados de um payload bruto da Gmail API
 */
export function extrairDadosMensagemGmail(
  msg: GmailMessagePayload,
  emailCaixa?: string
): DadosMensagemExtraida {
  const headersList = msg.payload?.headers || [];
  const headersMap: Record<string, string> = {};
  for (const h of headersList) {
    headersMap[h.name.toLowerCase()] = h.value;
  }

  const de = headersMap['from'] || '';
  const para = headersMap['to'] || '';
  const assunto = headersMap['subject'] || '(sem assunto)';
  const data = headersMap['date'] || new Date().toISOString();
  const rfcMessageId = headersMap['message-id'] || null;
  const inReplyTo = headersMap['in-reply-to'] || null;
  const referencesRaw = headersMap['references'] || '';
  const autoSubmitted = headersMap['auto-submitted'] || null;
  const xFailedRecipients = headersMap['x-failed-recipients'] || null;

  const references = referencesRaw
    ? referencesRaw.split(/\s+/).filter((r) => r.startsWith('<') && r.endsWith('>'))
    : [];

  const { texto, html } = extrairCorpoDeParts(msg.payload);
  const corpoTextoFinal = texto.trim() || limparHtmlParaTexto(html);
  const corpoLimpo = extrairTextoNovoResposta(corpoTextoFinal);

  // Checa se a mensagem foi enviada pela própria caixa
  const caixaEmailNorm = (emailCaixa || '').trim().toLowerCase();
  const deEmailNorm = de.toLowerCase();
  const isEnviadoPorMim =
    (caixaEmailNorm && deEmailNorm.includes(caixaEmailNorm)) ||
    (msg.labelIds && msg.labelIds.includes('SENT')) ||
    false;

  const remetenteEmail = extrairEmailDeString(de);
  const xAutoreply = headersMap['x-autoreply'] || null;
  const precedence = headersMap['precedence'] || null;
  const recebidoEm = msg.internalDate
    ? new Date(parseInt(msg.internalDate, 10)).toISOString()
    : new Date().toISOString();

  return {
    provedorMessageId: msg.id,
    provedorThreadId: msg.threadId,
    de,
    remetenteEmail,
    para,
    assunto,
    data,
    recebidoEm,
    rfcMessageId,
    inReplyTo: inReplyTo || undefined,
    references,
    autoSubmitted,
    xAutoreply,
    precedence,
    xFailedRecipients,
    headers: headersMap,
    corpoTexto: corpoTextoFinal,
    corpoLimpo,
    isEnviadoPorMim,
  };
}

/**
 * Obtém Access Token via Refresh Token para a Caixa de Envio
 */
export async function obterAccessTokenGoogle(caixa: CaixaEnvio): Promise<string | null> {
  const refreshToken =
    caixa.google_refresh_token ||
    process.env.GOOGLE_REFRESH_TOKEN ||
    process.env.GMAIL_REFRESH_TOKEN;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return null;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.warn(`Erro ao renovar token do Google para ${caixa.email}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error('Falha ao comunicar com endpoint de tokens do Google:', err);
    return null;
  }
}

/**
 * Consulta users.getProfile na Gmail API
 */
export async function obterPerfilGmail(accessToken: string): Promise<{ historyId: string; emailAddress: string } | null> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Erro ao buscar perfil do Gmail:', err);
    return null;
  }
}

/**
 * Consulta users.history.list na Gmail API
 */
export async function listarHistoricoGmail(
  accessToken: string,
  startHistoryId: string
): Promise<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string; threadId: string } }> }>; historyId?: string } | { expirou: true }> {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404 || res.status === 410) {
      // historyId expirou
      return { expirou: true };
    }

    if (!res.ok) {
      console.warn(`Erro ao listar histórico do Gmail: HTTP ${res.status}`);
      return {};
    }

    return await res.json();
  } catch (err) {
    console.error('Falha ao listar histórico do Gmail:', err);
    return {};
  }
}

/**
 * Consulta users.messages.list (varredura de reserva)
 */
export async function listarMensagensRecentesGmail(
  accessToken: string,
  query: string = 'in:inbox newer_than:2d',
  maxResults: number = 20
): Promise<Array<{ id: string; threadId: string }>> {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    console.error('Falha ao listar mensagens recentes do Gmail:', err);
    return [];
  }
}

/**
 * Consulta users.messages.get com format=full
 */
export async function obterMensagemGmail(
  accessToken: string,
  messageId: string
): Promise<GmailMessagePayload | null> {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Falha ao obter mensagem ${messageId} do Gmail:`, err);
    return null;
  }
}
