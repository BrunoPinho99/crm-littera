import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireUser } from '@/lib/auth';
import * as serverSupabase from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server');

describe('requireUser (src/lib/auth.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve lançar erro se o usuário não estiver autenticado na sessão (getUser retorna erro ou null)', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('Sessão expirada'),
        }),
      },
    };
    vi.spyOn(serverSupabase, 'createClient').mockResolvedValue(mockSupabase as any);

    await expect(requireUser()).rejects.toThrow(
      'Não autenticado: faça login para acessar esta funcionalidade.'
    );
  });

  it('deve lançar erro se o e-mail do usuário não estiver na tabela usuarios_autorizados', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr-123', email: 'invasor@hacker.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    };
    vi.spyOn(serverSupabase, 'createClient').mockResolvedValue(mockSupabase as any);

    await expect(requireUser()).rejects.toThrow(
      'Acesso negado: o e-mail "invasor@hacker.com" não está na lista de usuários autorizados do CRM.'
    );
  });

  it('deve lançar erro genérico se a consulta a usuarios_autorizados falhar no banco', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr-123', email: 'bruno@grupolittera.com.br' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Falha de conexão com PostgreSQL'),
            }),
          }),
        }),
      }),
    };
    vi.spyOn(serverSupabase, 'createClient').mockResolvedValue(mockSupabase as any);

    await expect(requireUser()).rejects.toThrow(
      'Erro ao validar permissões de acesso do usuário.'
    );
  });

  it('deve retornar o usuário autenticado com id e e-mail quando autorizado', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr-456', email: 'bruno@grupolittera.com.br' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { email: 'bruno@grupolittera.com.br' },
              error: null,
            }),
          }),
        }),
      }),
    };
    vi.spyOn(serverSupabase, 'createClient').mockResolvedValue(mockSupabase as any);

    const user = await requireUser();
    expect(user).toEqual({
      id: 'usr-456',
      email: 'bruno@grupolittera.com.br',
    });
  });
});
