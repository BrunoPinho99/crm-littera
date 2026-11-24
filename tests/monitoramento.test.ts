import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verificarAlertasSistema } from '@/lib/monitoramento/alertas';
import { verificarEProtegerEntregabilidadeCaixas } from '@/lib/monitoramento/entregabilidade';
import * as adminSupabase from '@/lib/supabase/admin';
import * as enviarEmailModule from '@/lib/envio/enviarEmail';

vi.mock('@/lib/supabase/admin');
vi.mock('@/lib/envio/enviarEmail');

describe('Monitoramento, Entregabilidade e Alertas (src/lib/monitoramento/)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Proteção de Entregabilidade (entregabilidade.ts)', () => {
    it('deve desativar automaticamente caixa com bounce > 3% e pelo menos 30 envios em 7 dias', async () => {
      const caixaComProblema = {
        id: 'cx-bounce-critico',
        email: 'risco@littera.com.br',
        nome: 'Caixa de Risco',
        ativo: true,
        motivo_desativacao: null,
      };

      const updateCaixaMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'caixas_envio') {
            return {
              select: vi.fn().mockResolvedValue({ data: [caixaComProblema], error: null }),
              update: updateCaixaMock,
            };
          }
          if (table === 'mensagens_enviadas') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: any) => {
                  if (col === 'status' && val === 'bounce') {
                    // 2 bounces em 40 envios = 5% bounce (> 3%)
                    return { gte: vi.fn().mockResolvedValue({ count: 2, error: null }) };
                  }
                  return {
                    gte: vi.fn().mockResolvedValue({ count: 40, error: null }),
                    eq: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({ count: 2, error: null }),
                    }),
                  };
                }),
              }),
            };
          }
          if (table === 'respostas_recebidas') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
                  }),
                  not: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({ count: 5, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'alertas_sistema') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                  not: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'alt-1' }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }),
      };
      (adminSupabase as any).supabaseAdmin = mockSupabase;
      vi.spyOn(adminSupabase, 'getAdminSupabase').mockReturnValue(mockSupabase as any);

      vi.spyOn(enviarEmailModule, 'enviarEmail').mockResolvedValue({
        sucesso: true,
        provedorMessageId: 'alerta-msg-id',
        rfcMessageId: '<alerta@littera>',
        provedorThreadId: 'th-alt',
        caixaEmail: 'sistema@littera.com.br',
      });

      const res = await verificarEProtegerEntregabilidadeCaixas(7);
      expect(res.caixasDesativadas).toContain('risco@littera.com.br');
      expect(updateCaixaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ativo: false,
          motivo_desativacao: expect.stringContaining('Taxa de bounce crítica'),
        })
      );
    });
  });

  describe('Registro de Rotinas (rotinas.ts)', () => {
    it('deve registrar início, fim e isolar exceções de rotinas', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation(() => {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'rotina-uuid-1' }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'rot-1', rotina: 'agente_diario', status: 'sucesso' },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }),
      };
      (adminSupabase as any).supabaseAdmin = mockSupabase;
      vi.spyOn(adminSupabase, 'getAdminSupabase').mockReturnValue(mockSupabase as any);

      const { executarRotinaComRegistro, consultarUltimasExecucoesRotinas } = await import(
        '@/lib/monitoramento/rotinas'
      );

      // Sucesso
      const resOk = await executarRotinaComRegistro('cron_sequencias', async () => {
        return { total: 10 };
      });
      expect(resOk.sucesso).toBe(true);
      expect(resOk.resultado).toEqual({ total: 10 });

      // Falha isolada
      const resFalha = await executarRotinaComRegistro('leitor_respostas', async () => {
        throw new Error('Falha simulada na Gmail API');
      });
      expect(resFalha.sucesso).toBe(false);
      expect(resFalha.erro).toContain('Falha simulada na Gmail API');

      // Consulta últimas execuções
      const ultimas = await consultarUltimasExecucoesRotinas();
      expect(ultimas.agente_diario?.status).toBe('sucesso');
    });
  });

  describe('Verificação de Alertas do Sistema (alertas.ts)', () => {
    it('deve disparar alerta quando o agente diário registrar status "erro"', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'agente_execucoes') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'exec-erro-1',
                        status: 'erro',
                        iniciado_em: new Date().toISOString(),
                        mensagem: 'Falha ao conectar com Anthropic API',
                      },
                      error: null,
                    }),
                  }),
                }),
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'alertas_sistema') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                  not: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Nenhum alerta enviado hoje
                      }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'alt-agente-1' }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          const chainDefault: any = {
            eq: vi.fn().mockImplementation(() => chainDefault),
            gte: vi.fn().mockImplementation(() => chainDefault),
            not: vi.fn().mockImplementation(() => chainDefault),
            limit: vi.fn().mockImplementation(() => chainDefault),
            is: vi.fn().mockImplementation(() => chainDefault),
            then: (resolve: any) => resolve({ count: 500, data: [], error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cron-1', finalizado_em: new Date().toISOString() }, error: null }),
          };
          return {
            select: vi.fn().mockReturnValue(chainDefault),
          };
        }),
      };
      (adminSupabase as any).supabaseAdmin = mockSupabase;
      vi.spyOn(adminSupabase, 'getAdminSupabase').mockReturnValue(mockSupabase as any);

      const mockEnviarEmail = vi.spyOn(enviarEmailModule, 'enviarEmail').mockResolvedValue({
        sucesso: true,
        provedorMessageId: 'alerta-msg-id',
        rfcMessageId: '<alerta@littera>',
        provedorThreadId: 'th-alt',
        caixaEmail: 'sistema@littera.com.br',
      });

      const res = await verificarAlertasSistema();
      expect(res.alertasGerados).toBeGreaterThanOrEqual(1);
      expect(res.detalhes.some((d) => d.tipo === 'agente_diario')).toBe(true);
      expect(mockEnviarEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          assunto: expect.stringContaining('Erro no Agente SDR Diário'),
          isTeste: true,
        })
      );
    });
  });
});
