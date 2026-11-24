import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enviarEmail } from '@/lib/envio/enviarEmail';
import * as adminSupabase from '@/lib/supabase/admin';
import * as brevoModule from '@/lib/envio/brevo';

vi.mock('@/lib/supabase/admin');
vi.mock('@/lib/envio/brevo');

describe('enviarEmail (src/lib/envio/enviarEmail.ts) - Bloqueios e Validações', () => {
  const caixaAtiva = {
    id: 'caixa-1',
    email: 'comercial@littera.com.br',
    nome: 'Littera Comercial',
    ativo: true,
    limite_diario_inicial: 20,
    incremento_semanal: 10,
    limite_diario_maximo: 50,
    aquecimento_inicio: '2026-01-01',
    enviados_hoje: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve bloquear disparo se não houver nenhuma caixa de envio ativa', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    await expect(
      enviarEmail({
        para: 'diretor@escola.com.br',
        assunto: 'Apresentação Littera',
        html: '<p>Olá</p>',
        texto: 'Olá',
      })
    ).rejects.toThrow('Nenhuma caixa de envio ativa encontrada para realizar o disparo.');
  });

  it('deve bloquear disparo se o limite diário de aquecimento da caixa tiver sido atingido', async () => {
    const caixaEsgotada = { ...caixaAtiva, enviados_hoje: 50, limite_diario_maximo: 50 };
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'caixas_envio') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [caixaEsgotada],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    await expect(
      enviarEmail({
        para: 'diretor@escola.com.br',
        assunto: 'Apresentação Littera',
        html: '<p>Olá</p>',
        texto: 'Olá',
      })
    ).rejects.toThrow(/Limite diário de aquecimento atingido/);
  });

  it('deve bloquear envio se o contato estiver descadastrado', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'caixas_envio') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [caixaAtiva], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'descadastros') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'contatos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { descadastrado: true, email_status: 'valido' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    await expect(
      enviarEmail({
        para: 'diretor@escola.com.br',
        contatoId: 'contato-descadastrado-1',
        assunto: 'Apresentação Littera',
        html: '<p>Olá</p>',
        texto: 'Olá',
      })
    ).rejects.toThrow(/O contato está marcado como descadastrado/);
  });

  it('deve bloquear envio se a escola tiver status sem_interesse ou descadastrado', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'caixas_envio') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [caixaAtiva], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'descadastros') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'escolas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { status_funil: 'sem_interesse' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    await expect(
      enviarEmail({
        para: 'diretor@escola.com.br',
        escolaId: 'esc-sem-interesse',
        assunto: 'Apresentação Littera',
        html: '<p>Olá</p>',
        texto: 'Olá',
      })
    ).rejects.toThrow(/A escola está marcada como sem interesse/);
  });

  it('deve permitir envio com isTeste = true mesmo sem contatoId comercial', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'caixas_envio') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [caixaAtiva], error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === 'mensagens_enviadas' || table === 'interacoes') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    vi.spyOn(brevoModule, 'enviarEmailViaBrevo').mockResolvedValue({
      sucesso: true,
      provedorMessageId: '<brevo-msg-123@smtp-relay.mailin.fr>',
      rfcMessageId: '<rfc-test-123@littera.com.br>',
    });

    const res = await enviarEmail({
      para: 'admin@littera.com.br',
      assunto: 'Teste de Alerta',
      html: '<p>Teste</p>',
      texto: 'Teste',
      isTeste: true,
    });

    expect(res.sucesso).toBe(true);
    expect(res.provedorMessageId).toBe('<brevo-msg-123@smtp-relay.mailin.fr>');
    expect(res.caixaEmail).toBe(caixaAtiva.email);
  });
});
