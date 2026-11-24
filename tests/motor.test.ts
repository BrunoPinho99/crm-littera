import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executarMotorSequencias } from '@/lib/sequencias/motor';
import * as janelasModule from '@/lib/sequencias/janelas';
import * as adminSupabase from '@/lib/supabase/admin';

vi.mock('@/lib/supabase/admin');
vi.mock('@/actions/sequencias', () => ({
  carregarFeriadosSet: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock('@/lib/sequencias/janelas', async (importOriginal) => {
  const actual = await importOriginal<typeof janelasModule>();
  return {
    ...actual,
    estaNaJanelaDeEnvio: vi.fn(),
  };
});

describe('executarMotorSequencias (src/lib/sequencias/motor.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve encerrar imediatamente se fora da janela comercial e forcarJanela não estiver ativo', async () => {
    vi.mocked(janelasModule.estaNaJanelaDeEnvio).mockReturnValue(false);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    const res = await executarMotorSequencias({ forcarJanela: false });
    expect(res.executou).toBe(false);
    expect(res.motivo).toBe('fora_da_janela_comercial');
    expect(res.enviosRealizados).toBe(0);
  });

  it('deve ignorar janela e prosseguir se forcarJanela = true', async () => {
    vi.mocked(janelasModule.estaNaJanelaDeEnvio).mockReturnValue(false);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === 'obter_inscricoes_para_processar') {
          return Promise.resolve({ data: [], error: null });
        }
        if (fn === 'obter_fila_envio_para_disparar') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    const res = await executarMotorSequencias({ forcarJanela: true });
    expect(res.executou).toBe(true);
    expect(res.inscricoesProcessadas).toBe(0);
    expect(res.enviosRealizados).toBe(0);
  });

  it('deve cancelar inscrição ativa se o funil da escola estiver em status terminal (ex: respondido)', async () => {
    vi.mocked(janelasModule.estaNaJanelaDeEnvio).mockReturnValue(true);

    const inscricaoFake = {
      id: 'insc-1',
      escola_id: 'esc-1',
      contato_id: 'cont-1',
      sequencia_id: 'seq-1',
      passo_atual: 1,
      status: 'ativa',
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'escolas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'esc-1', status_funil: 'respondido' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'sequencias') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'seq-1', total_passos: 3 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'contatos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'cont-1', email: 'contato@escola.com.br', descadastrado: false },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'inscricoes') {
          return {
            update: updateMock,
          };
        }
        if (table === 'fila_envios') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === 'obter_inscricoes_para_processar') {
          return Promise.resolve({ data: [inscricaoFake], error: null });
        }
        if (fn === 'obter_fila_envio_para_disparar') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }),
    };
    (adminSupabase as any).supabaseAdmin = mockSupabase;

    const res = await executarMotorSequencias({ forcarJanela: true });
    expect(res.executou).toBe(true);
    expect(res.inscricoesProcessadas).toBe(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelada',
        motivo_cancelamento: 'escola_status_respondido',
      })
    );
  });
});
