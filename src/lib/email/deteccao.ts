import { DadosMensagemExtraida } from './gmailApi';

/**
 * Detecta se a mensagem é um Bounce (falha de entrega).
 */
export function detectarBounce(msg: DadosMensagemExtraida): { isBounce: boolean; emailFalho?: string } {
  const remetenteLower = msg.remetenteEmail.toLowerCase();
  const deLower = msg.de.toLowerCase();
  const assuntoLower = msg.assunto.toLowerCase();
  const corpoLower = msg.corpoTexto.toLowerCase();

  const remetentesBounce = ['mailer-daemon', 'postmaster', 'bounce', 'daemon@', 'no-reply@google.com'];
  const isRemetenteBounce = remetentesBounce.some(
    (b) => remetenteLower.includes(b) || deLower.includes(b)
  );

  const assuntosBounce = [
    'delivery status notification',
    'undelivered mail returned to sender',
    'mail delivery failed',
    'address not found',
    'failure notice',
    'returned mail',
    'could not be delivered',
  ];
  const isAssuntoBounce = assuntosBounce.some((a) => assuntoLower.includes(a));

  const corposBounce = [
    'the email account that you tried to reach does not exist',
    'address not found',
    'mx record not found',
    '550 5.1.1',
    '550 user not found',
    'mailbox unavailable',
    'delivery has failed to these recipients',
    'recipient address rejected',
  ];
  const isCorpoBounce = corposBounce.some((c) => corpoLower.includes(c));

  if (!isRemetenteBounce && !isAssuntoBounce && !isCorpoBounce && !msg.xFailedRecipients) {
    return { isBounce: false };
  }

  // Extrai o e-mail que falhou
  let emailFalho: string | undefined = msg.xFailedRecipients?.toLowerCase().trim();

  if (!emailFalho) {
    const regexEmailCorpo = /(?:was not delivered to|failed to deliver to|tried to reach|message to|for <|to <|to: <)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i;
    const match = msg.corpoTexto.match(regexEmailCorpo);
    if (match && match[1]) {
      emailFalho = match[1].toLowerCase().trim();
    }
  }

  return { isBounce: true, emailFalho };
}

/**
 * Detecta se a mensagem é uma resposta automática (Out of Office / Férias).
 */
export function detectarRespostaAutomatica(msg: DadosMensagemExtraida): {
  isAutoReply: boolean;
  dataRetorno?: string | null;
} {
  const autoSubmitted = (msg.autoSubmitted || '').toLowerCase();
  const hasAutoSubmitted = Boolean(autoSubmitted && autoSubmitted !== 'no');
  const hasXAutoreply = Boolean(msg.xAutoreply);
  const precedence = (msg.precedence || '').toLowerCase();
  const isPrecedenceAuto = precedence === 'auto_reply' || precedence === 'bulk';

  const assuntoLower = msg.assunto.toLowerCase();
  const termosAssunto = [
    'resposta automática',
    'resposta automatica',
    'automatic reply',
    'out of office',
    'estou ausente',
    'em férias',
    'em ferias',
    'ausência temporária',
    'ausencia temporaria',
    'fora do escritório',
    'fora do escritorio',
  ];
  const isAssuntoAuto = termosAssunto.some((t) => assuntoLower.includes(t));

  if (!hasAutoSubmitted && !hasXAutoreply && !isPrecedenceAuto && !isAssuntoAuto) {
    return { isAutoReply: false };
  }

  const dataRetorno = extrairDataRetornoTexto(msg.corpoTexto);

  return {
    isAutoReply: true,
    dataRetorno,
  };
}

/**
 * Extrai data de retorno no formato AAAA-MM-DD a partir do texto de resposta de ausência.
 */
export function extrairDataRetornoTexto(texto: string): string | null {
  const padrao1 = /(?:retorno|volta|atendimento normal|a partir de|retornarei)[^\d]{1,25}(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?/i;
  const match = texto.match(padrao1);

  if (match) {
    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const anoRaw = match[3];

    const hoje = new Date();
    let ano = anoRaw ? parseInt(anoRaw, 10) : hoje.getFullYear();
    if (ano < 100) ano += 2000;

    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      const dataParsed = new Date(ano, mes - 1, dia);
      if (!anoRaw && dataParsed < hoje) {
        dataParsed.setFullYear(ano + 1);
      }
      return dataParsed.toISOString().split('T')[0];
    }
  }

  return null;
}

/**
 * Calcula a próxima data útil para envio após ausência.
 */
export function calcularDataEnvioAposAusencia(dataRetornoStr?: string | null): string {
  const agora = new Date();
  let baseDate = new Date();

  if (dataRetornoStr) {
    const parsed = new Date(`${dataRetornoStr}T10:00:00-03:00`);
    if (!isNaN(parsed.getTime()) && parsed > agora) {
      baseDate = parsed;
    } else {
      baseDate.setDate(baseDate.getDate() + 5);
    }
  } else {
    baseDate.setDate(baseDate.getDate() + 7);
  }

  const diaSemana = baseDate.getDay();
  if (diaSemana === 0) {
    baseDate.setDate(baseDate.getDate() + 1);
  } else if (diaSemana === 6) {
    baseDate.setDate(baseDate.getDate() + 2);
  }

  baseDate.setHours(10, 30, 0, 0);
  return baseDate.toISOString();
}
