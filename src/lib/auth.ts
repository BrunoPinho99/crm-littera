import { createClient } from '@/lib/supabase/server';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Valida a sessão do usuário no Supabase Auth e garante que seu e-mail
 * está presente na tabela public.usuarios_autorizados.
 *
 * Deve ser invocada na primeira linha de cada Server Action.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    throw new Error('Não autenticado: faça login para acessar esta funcionalidade.');
  }

  const normalizedEmail = user.email.toLowerCase().trim();

  const { data: authorizedUser, error: checkError } = await supabase
    .from('usuarios_autorizados')
    .select('email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (checkError) {
    console.error('Erro ao verificar permissão em usuarios_autorizados:', checkError);
    throw new Error('Erro ao validar permissões de acesso do usuário.');
  }

  if (!authorizedUser) {
    throw new Error(
      `Acesso negado: o e-mail "${user.email}" não está na lista de usuários autorizados do CRM.`
    );
  }

  return {
    id: user.id,
    email: user.email,
  };
}
