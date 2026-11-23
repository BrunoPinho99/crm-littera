export interface VariaveisTemplate {
  primeiro_nome?: string | null;
  escola: string;
  cidade: string;
  cargo?: string | null;
  gancho?: string | null;
  link_agenda?: string;
  remetente?: string;
}

export interface RenderPassoOptions {
  assuntoTemplate: string;
  corpoTemplate: string;
  variaveis: VariaveisTemplate;
  usarIa?: boolean;
  ordemPasso: number; // 1 para toque 1 (max 90 palavras), 2..5 para demais (max 60 palavras)
}

export interface RenderResult {
  sucesso: boolean;
  assunto: string;
  corpoTexto: string;
  corpoHtml: string;
  totalPalavras: number;
  limitePalavras: number;
  erro?: string;
}

/**
 * Normaliza e capitaliza o primeiro nome de um contato
 */
export function extrairPrimeiroNome(nomeCompleto?: string | null): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return '';
  const primeiro = nomeCompleto.trim().split(/\s+/)[0];
  if (!primeiro) return '';
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

/**
 * Conta palavras em um texto excluindo pontuações puras
 */
export function contarPalavras(texto: string): number {
  if (!texto || !texto.trim()) return 0;
  // Divide por espaços em branco
  const tokens = texto
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^[-–—]+$/.test(t));
  return tokens.length;
}

/**
 * Reescreve a abertura do e-mail usando o gancho de personalização com Claude
 */
export async function reescreverAberturaComIa(
  gancho: string,
  nomeEscola: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return gancho.trim();
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: 0.2,
        system:
          'Você é um redator sênior de e-mails B2B para diretores e coordenadores de colégios particulares no Brasil. ' +
          'Sua única função é escrever UMA frase curta e natural (máximo 20 palavras) conectando o gancho real da escola à conversa. ' +
          'Nunca invente fatos, notas ou números não mencionados. Nunca use "Espero que este e-mail o encontre bem" ou saudações. ' +
          'Retorne apenas a frase, sem aspas.',
        messages: [
          {
            role: 'user',
            content: `Escola: ${nomeEscola}\nGancho real: ${gancho}\n\nEscreva a frase de conexão:`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`API Anthropic retornou status ${res.status}`);
      return gancho.trim();
    }

    const data = await res.json();
    const block = data.content?.[0];
    if (block && block.type === 'text' && block.text.trim()) {
      return block.text.trim();
    }
    return gancho.trim();
  } catch (err) {
    console.warn('Falha na chamada ao Claude para gancho, usando gancho original:', err);
    return gancho.trim();
  }
}

/**
 * Converte o texto simples em HTML estruturado com parágrafos e links
 */
export function formatarTextoParaHtml(texto: string): string {
  const paragrafos = texto.split(/\n\s*\n/);
  const htmlParagrafos = paragrafos.map((p) => {
    const limpo = p.trim().replace(/\n/g, '<br />');
    // Transforma links http/https em tags <a>
    const comLinks = limpo.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color: #2563eb; text-decoration: underline;" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return `<p style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${comLinks}</p>`;
  });

  return `<div style="max-width: 600px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">\n${htmlParagrafos.join('\n')}\n</div>`;
}

/**
 * Renderiza um template substituindo variáveis, chamando IA se solicitado,
 * e aplicando validações estritas de variáveis não preenchidas, marcadores e limites de palavras.
 */
export async function renderizarPasso(options: RenderPassoOptions): Promise<RenderResult> {
  const { assuntoTemplate, corpoTemplate, variaveis, usarIa = false, ordemPasso } = options;

  const limitePalavras = ordemPasso === 1 ? 90 : 60;
  const linkAgenda = variaveis.link_agenda || 'https://calendly.com/littera';
  const remetente = variaveis.remetente || 'Bruno Pinho — Fundador, Littera (littera.app.br)';
  const primeiroNome = extrairPrimeiroNome(variaveis.primeiro_nome);

  let ganchoFinal = variaveis.gancho?.trim() || '';
  if (usarIa && ganchoFinal) {
    ganchoFinal = await reescreverAberturaComIa(ganchoFinal, variaveis.escola);
  }

  // Se não houver nome, ajusta a saudação no corpo se começar com "Olá, {{primeiro_nome}}"
  let corpoProcessado = corpoTemplate;
  if (!primeiroNome) {
    corpoProcessado = corpoProcessado.replace(
      /Olá,\s*\{\{primeiro_nome\}\}\.?/gi,
      `Olá, equipe da ${variaveis.escola}.`
    );
  }

  // Mapa de substituição
  const mapaVariaveis: Record<string, string> = {
    primeiro_nome: primeiroNome || `equipe da ${variaveis.escola}`,
    escola: variaveis.escola || '',
    cidade: variaveis.cidade || 'Brasília',
    cargo: variaveis.cargo || 'Direção Pedagógica',
    gancho: ganchoFinal,
    link_agenda: linkAgenda,
    remetente: remetente,
  };

  // Função de substituição regex
  const aplicarSubstituicao = (template: string): string => {
    let res = template;
    for (const [chave, valor] of Object.entries(mapaVariaveis)) {
      const reg = new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, 'gi');
      res = res.replace(reg, valor);
    }
    // Remove quebras extras se o gancho for vazio
    res = res.replace(/\n\s*\n\s*\n+/g, '\n\n');
    return res.trim();
  };

  const assuntoFinal = aplicarSubstituicao(assuntoTemplate);
  const corpoTextoFinal = aplicarSubstituicao(corpoProcessado);

  // 1. Validação: Assunto ou corpo vazios
  if (!assuntoFinal || !corpoTextoFinal) {
    return {
      sucesso: false,
      assunto: assuntoFinal,
      corpoTexto: corpoTextoFinal,
      corpoHtml: '',
      totalPalavras: 0,
      limitePalavras,
      erro: 'Assunto ou corpo do e-mail não podem ficar vazios.',
    };
  }

  // 2. Validação: Variáveis {{...}} pendentes
  const pendenciasVarAssunto = assuntoFinal.match(/\{\{([^}]+)\}\}/g);
  const pendenciasVarCorpo = corpoTextoFinal.match(/\{\{([^}]+)\}\}/g);
  const todasPendenciasVar = [
    ...(pendenciasVarAssunto || []),
    ...(pendenciasVarCorpo || []),
  ];

  if (todasPendenciasVar.length > 0) {
    return {
      sucesso: false,
      assunto: assuntoFinal,
      corpoTexto: corpoTextoFinal,
      corpoHtml: '',
      totalPalavras: contarPalavras(corpoTextoFinal),
      limitePalavras,
      erro: `Variáveis não preenchidas no modelo: ${todasPendenciasVar.join(', ')}`,
    };
  }

  // 3. Validação: Marcadores em colchetes pendentes (ex: [PROPOSTA DE VALOR], [MARCADOR])
  const marcadoresAssunto = assuntoFinal.match(/\[([A-Z0-9_\s–-]+)\]/g);
  const marcadoresCorpo = corpoTextoFinal.match(/\[([A-Z0-9_\s–-]+)\]/g);
  const todosMarcadores = [
    ...(marcadoresAssunto || []),
    ...(marcadoresCorpo || []),
  ];

  if (todosMarcadores.length > 0) {
    return {
      sucesso: false,
      assunto: assuntoFinal,
      corpoTexto: corpoTextoFinal,
      corpoHtml: '',
      totalPalavras: contarPalavras(corpoTextoFinal),
      limitePalavras,
      erro: `Marcadores não preenchidos no modelo: ${todosMarcadores.join(', ')}`,
    };
  }

  // 4. Validação: Limite estrito de palavras
  const totalPalavras = contarPalavras(corpoTextoFinal);
  if (totalPalavras > limitePalavras) {
    return {
      sucesso: false,
      assunto: assuntoFinal,
      corpoTexto: corpoTextoFinal,
      corpoHtml: '',
      totalPalavras,
      limitePalavras,
      erro: `Limite de concisão excedido: texto ultrapassa o limite de palavras para o Toque ${ordemPasso} (${totalPalavras} palavras, máximo permitido: ${limitePalavras}).`,
    };
  }

  const corpoHtml = formatarTextoParaHtml(corpoTextoFinal);

  return {
    sucesso: true,
    assunto: assuntoFinal,
    corpoTexto: corpoTextoFinal,
    corpoHtml,
    totalPalavras,
    limitePalavras,
  };
}
