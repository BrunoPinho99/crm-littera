import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lerRespostasDasCaixas, processarMensagemRecebida } from '@/lib/email/leitor';
import * as adminSupabase from '@/lib/supabase/admin';
import * as gmailApiModule from '@/lib/email/gmailApi';

vi.mock('@/lib/supabase/admin');
vi.mock('@/lib/email/gmailApi', async (importOriginal) => {
  const actual = await importOriginal<typeof gmailApiModule>();
  return {
    ...actual,
    obterAccessTokenGoogle: vi.fn(),
    listarMensagensRecentesGmail: vi.fn(),
    obterMensagemGmail: vi.fn(),
  };
});
vi.mock('@/lib/email/classificador');
vi.mock('@/lib/email/notificador');

describe('Leitor de Respostas (src/lib/email/leitor.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 0 caixas lidas se não houver caixas ativas', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    const res = await lerRespostasDasCaixas();
    expect(res.caixasLidas).toBe(0);
    expect(res.mensagensProcessadas).toBe(0);
    expect(res.erros).toEqual([]);
  });

  it('deve processar mensagem de bounce atualizando contato para inválido e cancelando fila', async () => {
    const caixaFake = {
      id: 'cx-1',
      email: 'comercial@littera.com.br',
      google_refresh_token: 'valid-token',
    };

    const msgDetalhada = {
      id: 'msg-bounce-1',
      threadId: 'th-1',
      labelIds: ['INBOX'],
      snippet: 'Delivery Status Notification (Failure)',
      internalDate: '1700000000000',
      payload: {
        headers: [
          { name: 'From', value: 'mailer-daemon@googlemail.com' },
          { name: 'To', value: 'comercial@littera.com.br' },
          { name: 'Subject', value: 'Delivery Status Notification (Failure)' },
        ],
        body: { data: Buffer.from('550 5.1.1 The email account that you tried to reach does not exist: falha@escola.com.br').toString('base64url') },
      },
    };

    const updateContatoMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'contatos') {
          const resultadoContato = {
            data: { id: 'cont-1', escola_id: 'esc-1', nome: 'Diretor', email: 'falha@escola.com.br' },
            error: null,
          };
          const chain: any = {
            eq: vi.fn().mockImplementation(() => chain),
            neq: vi.fn().mockImplementation(() => chain),
            limit: vi.fn().mockImplementation(() => chain),
            maybeSingle: vi.fn().mockResolvedValue(resultadoContato),
            single: vi.fn().mockResolvedValue(resultadoContato),
          };
          return {
            select: vi.fn().mockReturnValue(chain),
            update: updateContatoMock,
          };
        }
        if (table === 'escolas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'esc-1', nome: 'Escola Modelo' },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === 'fila_envios' || table === 'inscricoes') {
          const updateChain: any = {
            eq: vi.fn().mockImplementation(() => updateChain),
            in: vi.fn().mockImplementation(() => updateChain),
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
          return {
            update: vi.fn().mockReturnValue(updateChain),
          };
        }
        if (table === 'interacoes' || table === 'respostas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'item-1' }, error: null }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    const res = await processarMensagemRecebida(msgDetalhada as any, caixaFake as any);
    expect(res.processada).toBe(true);
    expect(res.classificacao).toBe('bounce');
    expect(updateContatoMock).toHaveBeenCalledWith(
      expect.objectContaining({ email_status: 'invalido' })
    );
  });

  it('deve isolar falhas entre caixas para que o erro de uma não interrompa as outras', async () => {
    const caixas = [
      { id: 'cx-1', email: 'erro@littera.com.br', google_refresh_token: 'bad-token' },
      { id: 'cx-2', email: 'sucesso@littera.com.br', google_refresh_token: 'ok-token' },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: caixas, error: null }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    vi.spyOn(gmailApiModule, 'obterAccessTokenGoogle').mockImplementation(async (cx: any) => {
      if (cx.email === 'erro@littera.com.br') {
        throw new Error('Google OAuth token revogado');
      }
      return 'valid-google-token';
    });

    vi.spyOn(gmailApiModule, 'listarMensagensRecentesGmail').mockResolvedValue([]);

    const resultado = await lerRespostasDasCaixas();
    expect(resultado.caixasLidas).toBe(2);
    expect(resultado.erros.length).toBe(1);
    expect(resultado.erros[0].caixaEmail).toBe('erro@littera.com.br');
    expect(resultado.erros[0].erro).toContain('Google OAuth token revogado');
  });
});
