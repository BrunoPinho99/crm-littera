import { ClassificacaoResposta } from '@/types/database';

export interface ClassificacaoInput {
  ultimoEmailEnviado?: {
    assunto: string;
    corpo: string;
    data?: string;
  } | null;
  historicoContexto?: string | null;
  textoResposta: string;
  escolaNome?: string;
  contatoNome?: string | null;
  contatoCargo?: string | null;
}

export interface ClassificacaoOutput {
  classificacao: ClassificacaoResposta;
  confianca: number; // 0 a 1
  justificativa: string;
  data_retorno: string | null; // YYYY-MM-DD
  indicado_nome: string | null;
  indicado_email: string | null;
  rascunho_resposta: string | null;
}

const PROPOSTA_VALOR =
  'A Littera elimina o gargalo da correção manual de redações no Ensino Médio, entregando feedback alinhado às 5 competências do ENEM em segundos.';

const LINK_AGENDA = 'https://calendly.com/littera';

/**
 * Validação determinística estrita: garante que o e-mail indicado está literalmente contido no texto
 */
export function validarEmailIndicadoNoTexto(param1: string, param2?: string | null): boolean {
  if (!param1) return false;
  const isEmail = (s: string) => s.includes('@') && !s.includes(' ');

  let email = '';
  let texto = '';

  if (isEmail(param1)) {
    email = param1;
    texto = param2 || '';
  } else if (param2 && isEmail(param2)) {
    email = param2;
    texto = param1;
  } else {
    email = param2 || '';
    texto = param1;
  }

  if (!email.trim() || !texto.trim()) return false;
  return texto.toLowerCase().includes(email.trim().toLowerCase());
}

/**
 * Heurística de fallback caso o Claude não esteja disponível
 */
export function classificarPorHeuristica(input: string | ClassificacaoInput): ClassificacaoOutput {
  const normalizedInput: ClassificacaoInput = typeof input === 'string'
    ? { textoResposta: input, escolaNome: 'escola' }
    : input;

  const textoOriginal = normalizedInput.textoResposta || '';
  const t = textoOriginal.toLowerCase();
  const escolaNome = normalizedInput.escolaNome || 'escola';

  // 1. Descadastro
  if (
    t.includes('descadastr') ||
    t.includes('remov') ||
    t.includes('tire meu e-mail') ||
    t.includes('tire meu email') ||
    t.includes('não quero receber') ||
    t.includes('nao quero receber') ||
    t.includes('não envie mais') ||
    t.includes('nao envie mais') ||
    t.includes('sair da lista') ||
    t.includes('unsubscribe')
  ) {
    return {
      classificacao: 'descadastro',
      confianca: 0.95,
      justificativa: 'Lead solicitou remoção da lista de envio.',
      data_retorno: null,
      indicado_nome: null,
      indicado_email: null,
      rascunho_resposta: null,
    };
  }

  // 2. Sem interesse
  if (
    t.includes('não tenho interesse') ||
    t.includes('nao temos interesse') ||
    t.includes('não temos interesse') ||
    t.includes('sem interesse') ||
    t.includes('já utilizamos outro') ||
    t.includes('já temos solução')
  ) {
    return {
      classificacao: 'sem_interesse',
      confianca: 0.9,
      justificativa: 'Lead declarou ausência de interesse no momento.',
      data_retorno: null,
      indicado_nome: null,
      indicado_email: null,
      rascunho_resposta: null,
    };
  }

  // 3. Indicou outra pessoa (procura e-mail no texto)
  const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const matchEmail = textoOriginal.match(regexEmail);
  if (
    (t.includes('falar com') || t.includes('procure') || t.includes('contato de') || t.includes('indico')) &&
    matchEmail
  ) {
    return {
      classificacao: 'indicou_outra_pessoa',
      confianca: 0.85,
      justificativa: `Lead indicou outro contato da instituição: ${matchEmail[0]}`,
      data_retorno: null,
      indicado_nome: null,
      indicado_email: matchEmail[0],
      rascunho_resposta: `Olá! Recebi seu contato por indicação da equipe da ${escolaNome}. Podemos conversar 15 minutos nesta semana sobre o projeto de redação do Ensino Médio?\n\n${LINK_AGENDA}\n\nBruno Pinho — Fundador, Littera`,
    };
  }

  // 4. Agora não
  if (
    t.includes('agora não') ||
    t.includes('no momento não') ||
    t.includes('próximo semestre') ||
    t.includes('proximo semestre') ||
    t.includes('retorne mais tarde') ||
    t.includes('fale comigo em')
  ) {
    return {
      classificacao: 'agora_nao',
      confianca: 0.8,
      justificativa: 'Lead pediu para retomar o contato futuramente.',
      data_retorno: null,
      indicado_nome: null,
      indicado_email: null,
      rascunho_resposta: null,
    };
  }

  // 5. Interessado / Quer reunião
  if (
    t.includes('tenho interesse') ||
    t.includes('vamos conversar') ||
    t.includes('podemos conversar') ||
    t.includes('pode ligar') ||
    t.includes('agendar') ||
    t.includes('quinta') ||
    t.includes('sexta') ||
    t.includes('horário')
  ) {
    return {
      classificacao: 'interessado',
      confianca: 0.9,
      justificativa: 'Lead demonstrou interesse claro em conversar.',
      data_retorno: null,
      indicado_nome: null,
      indicado_email: null,
      rascunho_resposta: `Olá! Excelente, será um prazer conversar sobre a preparação de redação da ${escolaNome}.\n\nVocê pode escolher o melhor horário diretamente na minha agenda:\n${LINK_AGENDA}\n\nSe preferir, fico disponível nesta quinta às 10h ou sexta às 15h.\n\nUm abraço,\nBruno Pinho — Fundador, Littera`,
    };
  }

  // 6. Mais informações
  if (
    t.includes('mais informações') ||
    t.includes('como funciona') ||
    t.includes('enviar material') ||
    t.includes('apresentação') ||
    t.includes('valores') ||
    t.includes('preço')
  ) {
    return {
      classificacao: 'mais_informacoes',
      confianca: 0.85,
      justificativa: 'Lead solicitou maiores detalhes sobre funcionamento e proposta.',
      data_retorno: null,
      indicado_nome: null,
      indicado_email: null,
      rascunho_resposta: `Olá! ${PROPOSTA_VALOR}\n\nPosso enviar uma apresentação detalhada ou demonstrar o sistema em 15 minutos:\n${LINK_AGENDA}\n\nUm abraço,\nBruno Pinho — Fundador, Littera`,
    };
  }

  return {
    classificacao: 'outro',
    confianca: 0.5,
    justificativa: 'Mensagem requer análise manual pelo operador.',
    data_retorno: null,
    indicado_nome: null,
    indicado_email: null,
    rascunho_resposta: null,
  };
}

/**
 * Classifica a resposta do lead utilizando a API do Claude com saída estruturada em JSON
 */
export async function classificarRespostaComClaude(
  input: ClassificacaoInput
): Promise<ClassificacaoOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return classificarPorHeuristica(input);
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';

  const systemPrompt = `Você é o classificador sênior de respostas de e-mail de um CRM B2B de prospecção para escolas particulares (Littera).
Sua tarefa é analisar a resposta recebida de um decisor escolar e categorizá-la rigorosamente.

CATEGORIAS PERMITIDAS:
- 'interessado': Quer conversar, demonstrou interesse, pediu reunião ou perguntou horários.
- 'mais_informacoes': Pediu material, apresentação, detalhes de como funciona a plataforma de redação do ENEM ou dúvidas pedagógicas.
- 'agora_nao': Recusou no momento, mas deixou porta aberta ou citou período para retornar (ex: "próximo semestre", "mês que vem").
- 'indicou_outra_pessoa': Pediu para falar com outra pessoa e/ou forneceu o contato dela.
- 'sem_interesse': Recusou sem abertura para retorno futuro (ex: "não temos interesse", "já usamos outro sistema").
- 'descadastro': Pediu expressamente para remover da lista, cancelar envios ou não mandar mais e-mails.
- 'outro': Resposta ambígua, inconclusiva ou dúvida não relacionada.

REGRAS OBRIGATÓRIAS:
1. confianca: número float entre 0.0 e 1.0. Se for menor que 0.6, a classificação final DEVE ser 'outro'.
2. justificativa: UMA frase curta e objetiva em português justificando a decisão.
3. data_retorno: se o lead indicou data ou época no futuro, forneça em formato YYYY-MM-DD (estamos no ano letivo de 2026). Caso contrário, null.
4. indicado_nome: nome da pessoa indicada SOMENTE se estiver textualmente escrito na mensagem, senão null.
5. indicado_email: e-mail da pessoa indicada SOMENTE se estiver textualmente escrito na mensagem, senão null. NUNCA deduza ou invente e-mail.
6. rascunho_resposta:
   - Para 'interessado': proponha o link de agendamento ${LINK_AGENDA} e dê 2 opções de horários genéricos como alternativa (ex: quinta às 10h ou sexta às 15h).
   - Para 'mais_informacoes': responda de forma consultiva e objetiva com base no benefício de devolução rápida de redações no ENEM nas 5 competências sem sobrecarregar docentes, oferecendo o link da agenda.
   - Para 'indicou_outra_pessoa': rascunho amigável agradecendo a indicação e confirmando o contato com a pessoa indicada.
   - Para 'sem_interesse' e 'descadastro': deve ser null.
   - Para 'outro': rascunho educado pedindo esclarecimento ou null.
   - Nunca invente fatos, clientes ou recursos falsos.

RESPONDA EXCLUSIVAMENTE COM UM OBJETO JSON VÁLIDO no seguinte formato:
{
  "classificacao": "interessado" | "mais_informacoes" | "agora_nao" | "indicou_outra_pessoa" | "sem_interesse" | "descadastro" | "outro",
  "confianca": 0.95,
  "justificativa": "Texto da justificativa",
  "data_retorno": "YYYY-MM-DD" | null,
  "indicado_nome": "Nome" | null,
  "indicado_email": "email@escola.com.br" | null,
  "rascunho_resposta": "Texto do rascunho" | null
}`;

  const userContent = `DADOS DO CONTEXTO:
Escola: ${input.escolaNome}
Contato: ${input.contatoNome || 'Não informado'} (${input.contatoCargo || 'Não informado'})
Último e-mail enviado por nós:
Assunto: ${input.ultimoEmailEnviado?.assunto || 'Primeiro contato'}
Corpo: ${input.ultimoEmailEnviado?.corpo || 'Apresentação da Littera'}

RESPOSTA RECEBIDA DO LEAD:
"""
${input.textoResposta}
"""

Classifique a resposta e retorne o JSON estruturado:`;

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
        max_tokens: 600,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      console.warn(`Claude retornou status HTTP ${res.status}. Usando heurística.`);
      return classificarPorHeuristica(input);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text?.trim() || '';

    // Extrai o bloco JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('Claude não retornou JSON estruturado válido. Usando heurística.');
      return classificarPorHeuristica(input);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Aplicação das regras de segurança e validações obrigatórias
    let confianca = typeof parsed.confianca === 'number' ? parsed.confianca : 0.7;
    let classificacao: ClassificacaoResposta = parsed.classificacao || 'outro';

    // Regra: confiança abaixo de 0.6 vira 'outro'
    if (confianca < 0.6) {
      classificacao = 'outro';
    }

    let indicadoEmail = parsed.indicado_email?.trim() || null;
    let indicadoNome = parsed.indicado_nome?.trim() || null;

    // Regra estrita: indicado_email DEVE estar textualmente presente na resposta
    if (indicadoEmail && !validarEmailIndicadoNoTexto(input.textoResposta, indicadoEmail)) {
      console.warn(`E-mail indicado "${indicadoEmail}" não foi encontrado literalmente no texto da resposta. Rejeitado.`);
      indicadoEmail = null;
      indicadoNome = null;
      if (classificacao === 'indicou_outra_pessoa') {
        classificacao = 'outro';
        confianca = 0.5;
      }
    }

    let rascunho = parsed.rascunho_resposta?.trim() || null;
    if (['sem_interesse', 'descadastro'].includes(classificacao)) {
      rascunho = null;
    }

    return {
      classificacao,
      confianca,
      justificativa: parsed.justificativa?.trim() || 'Classificação via Claude.',
      data_retorno: parsed.data_retorno?.trim() || null,
      indicado_nome: indicadoNome,
      indicado_email: indicadoEmail,
      rascunho_resposta: rascunho,
    };
  } catch (err) {
    console.warn('Erro ao chamar Claude para classificação de resposta:', err);
    return classificarPorHeuristica(input);
  }
}
