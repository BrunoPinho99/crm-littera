import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classificarRespostaComClaude } from '@/lib/email/classificador';

describe('classificarRespostaComClaude (com Claude simulado)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-anthropic-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('deve classificar lead como "interessado" quando Claude retornar JSON válido', async () => {
    const mockResponse = {
      content: [
        {
          text: JSON.stringify({
            classificacao: 'interessado',
            confianca: 0.95,
            justificativa: 'Lead quer agendar demonstração para a próxima semana.',
            data_retorno: null,
            indicado_nome: null,
            indicado_email: null,
            rascunho_resposta: 'Olá! Excelente, podemos conversar...',
          }),
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const res = await classificarRespostaComClaude({
      escolaNome: 'Colégio Ábaco',
      contatoNome: 'Diretor Silva',
      contatoCargo: 'Diretor',
      textoResposta: 'Olá Bruno, temos interesse sim. Como podemos agendar uma conversa?',
    });

    expect(res.classificacao).toBe('interessado');
    expect(res.confianca).toBe(0.95);
    expect(res.justificativa).toBe('Lead quer agendar demonstração para a próxima semana.');
    expect(res.rascunho_resposta).toContain('Olá!');
  });

  it('deve aceitar indicação de contato quando o e-mail está textualmente na resposta', async () => {
    const mockResponse = {
      content: [
        {
          text: JSON.stringify({
            classificacao: 'indicou_outra_pessoa',
            confianca: 0.9,
            justificativa: 'Encaminhou para a coordenadora pedagógica.',
            data_retorno: null,
            indicado_nome: 'Profa. Cristina',
            indicado_email: 'cristina@colegioabaco.com.br',
            rascunho_resposta: 'Olá Cristina...',
          }),
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const res = await classificarRespostaComClaude({
      escolaNome: 'Colégio Ábaco',
      contatoNome: 'Diretor Silva',
      contatoCargo: 'Diretor',
      textoResposta: 'Favor falar com a Profa. Cristina pelo e-mail cristina@colegioabaco.com.br que cuida disso.',
    });

    expect(res.classificacao).toBe('indicou_outra_pessoa');
    expect(res.indicado_email).toBe('cristina@colegioabaco.com.br');
    expect(res.indicado_nome).toBe('Profa. Cristina');
  });

  it('deve REJEITAR e-mail alucinado que NÃO esteja literalmente no corpo da resposta', async () => {
    const mockResponse = {
      content: [
        {
          text: JSON.stringify({
            classificacao: 'indicou_outra_pessoa',
            confianca: 0.9,
            justificativa: 'Indicou outro contato.',
            data_retorno: null,
            indicado_nome: 'Marcos Coordenador',
            indicado_email: 'marcos.alucinado@colegioabaco.com.br', // NÃO existe no texto
            rascunho_resposta: 'Olá...',
          }),
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const res = await classificarRespostaComClaude({
      escolaNome: 'Colégio Ábaco',
      contatoNome: 'Diretor Silva',
      contatoCargo: 'Diretor',
      textoResposta: 'Fale com o Marcos da coordenação do ensino médio.', // Sem e-mail!
    });

    expect(res.indicado_email).toBeNull();
    expect(res.classificacao).toBe('outro'); // Ajustado para outro por segurança anti-alucinação
  });

  it('deve rebaixar para "outro" se a confiança for menor que 0.6', async () => {
    const mockResponse = {
      content: [
        {
          text: JSON.stringify({
            classificacao: 'interessado',
            confianca: 0.4, // Baixa confiança
            justificativa: 'Mensagem ambígua.',
            data_retorno: null,
            indicado_nome: null,
            indicado_email: null,
            rascunho_resposta: null,
          }),
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const res = await classificarRespostaComClaude({
      escolaNome: 'Colégio Ábaco',
      contatoNome: 'Diretor Silva',
      contatoCargo: 'Diretor',
      textoResposta: 'Talvez...',
    });

    expect(res.classificacao).toBe('outro');
  });

  it('deve realizar fallback para heurística determinística se o Claude retornar HTTP 500 ou JSON corrompido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as any);

    const res = await classificarRespostaComClaude({
      escolaNome: 'Colégio Ábaco',
      contatoNome: 'Diretor Silva',
      contatoCargo: 'Diretor',
      textoResposta: 'Por favor, retire meu e-mail da sua lista e não me envie mais mensagens.',
    });

    // Heurística deve detectar descadastro
    expect(res.classificacao).toBe('descadastro');
    expect(res.rascunho_resposta).toBeNull();
  });
});
