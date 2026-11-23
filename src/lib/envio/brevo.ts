import crypto from 'node:crypto';

export interface BrevoSender {
  name: string;
  email: string;
}

export interface BrevoRecipient {
  email: string;
  name?: string | null;
}

export interface BrevoEmailPayloadOptions {
  remetente: BrevoSender;
  destinatario: BrevoRecipient;
  assunto: string;
  conteudoHtml: string;
  conteudoTexto: string;
  unsubscribeUrl: string;
  assinaturaHtml?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  rfcMessageId?: string;
  razaoSocial?: string;
  endereco?: string;
}

export interface BrevoApiPayload {
  sender: {
    name: string;
    email: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  htmlContent: string;
  textContent: string;
  headers: Record<string, string>;
}

export interface BrevoEnvioResponse {
  sucesso: boolean;
  provedorMessageId: string;
  rfcMessageId: string;
  error?: string;
  detalhes?: unknown;
}

/**
 * Gera um RFC 5322 Message-ID único (<uuid@dominio>)
 */
export function gerarRfcMessageId(remetenteEmail: string): string {
  const dominio = remetenteEmail.split('@')[1]?.trim() || 'grupolittera.com.br';
  const uuid = crypto.randomUUID();
  return `<${uuid}@${dominio}>`;
}

/**
 * Monta o rodapé obrigatório em HTML com identificação institucional e link de descadastro
 */
export function montarRodapeHtml(razaoSocial: string, endereco: string, unsubscribeUrl: string): string {
  return `
<br />
<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.6; color: #64748b;">
  <p style="margin: 0 0 6px 0;">
    <strong>${razaoSocial}</strong> &bull; ${endereco}
  </p>
  <p style="margin: 0 0 8px 0;">
    Você recebeu esta mensagem porque seu contato profissional público foi identificado como responsável institucional ou pedagógico da escola.
  </p>
  <p style="margin: 0;">
    Caso não deseje mais receber nossas mensagens, <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">clique aqui para se descadastrar</a>.
  </p>
</div>`.trim();
}

/**
 * Monta o rodapé obrigatório em Texto Puro
 */
export function montarRodapeTexto(razaoSocial: string, endereco: string, unsubscribeUrl: string): string {
  return `
---
${razaoSocial} | ${endereco}
Você recebeu esta mensagem porque seu contato profissional público foi identificado como responsável institucional da escola.
Caso não deseje mais receber contatos, descadastre-se aqui: ${unsubscribeUrl}`.trim();
}

/**
 * Função pura que constrói o payload completo a ser enviado à Brevo API
 */
export function construirPayloadBrevo(options: BrevoEmailPayloadOptions): {
  payload: BrevoApiPayload;
  rfcMessageId: string;
} {
  const razaoSocial = options.razaoSocial || process.env.LITTERA_RAZAO_SOCIAL || 'Littera Educação e Tecnologia LTDA';
  const endereco = options.endereco || process.env.LITTERA_ENDERECO || 'Brasília - DF, Brasil';
  const rfcId = options.rfcMessageId || gerarRfcMessageId(options.remetente.email);

  const rodapeHtml = montarRodapeHtml(razaoSocial, endereco, options.unsubscribeUrl);
  const rodapeTexto = montarRodapeTexto(razaoSocial, endereco, options.unsubscribeUrl);

  let finalHtml = options.conteudoHtml;
  if (options.assinaturaHtml && options.assinaturaHtml.trim()) {
    finalHtml = `${finalHtml}\n<br />\n${options.assinaturaHtml.trim()}`;
  }
  finalHtml = `${finalHtml}\n${rodapeHtml}`;

  const finalTexto = `${options.conteudoTexto.trim()}\n\n${rodapeTexto}`;

  const headers: Record<string, string> = {
    'Message-ID': rfcId,
    'List-Unsubscribe': `<${options.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  if (options.inReplyTo) {
    headers['In-Reply-To'] = options.inReplyTo;
  }
  if (options.references) {
    headers['References'] = options.references;
  }

  const payload: BrevoApiPayload = {
    sender: {
      name: options.remetente.name,
      email: options.remetente.email,
    },
    to: [
      {
        email: options.destinatario.email,
        name: options.destinatario.name || undefined,
      },
    ],
    subject: options.assunto,
    htmlContent: finalHtml,
    textContent: finalTexto,
    headers,
  };

  return { payload, rfcMessageId: rfcId };
}

/**
 * Envia um e-mail transacional via API v3 do Brevo (POST https://api.brevo.com/v3/smtp/email)
 */
export async function enviarEmailViaBrevo(
  options: BrevoEmailPayloadOptions,
  apiKeyOverride?: string
): Promise<BrevoEnvioResponse> {
  const apiKey = apiKeyOverride || process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY não configurada no ambiente.');
  }

  const { payload, rfcMessageId } = construirPayloadBrevo(options);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Erro de autenticação Brevo API (${response.status}): Chave inválida ou expirada. Detalhes: ${errorDetail}`);
    }

    throw new Error(`Falha no envio via Brevo API (${response.status}): ${errorDetail}`);
  }

  const data = (await response.json()) as { messageId?: string };
  const provedorMessageId = data.messageId || rfcMessageId;

  return {
    sucesso: true,
    provedorMessageId,
    rfcMessageId,
  };
}
