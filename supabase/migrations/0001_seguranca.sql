-- ==============================================================================
-- Migração 0001: Segurança, Autenticação e RLS Estrito
-- ==============================================================================

-- 1. Criação da tabela de usuários autorizados
CREATE TABLE IF NOT EXISTS public.usuarios_autorizados (
    email TEXT PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserção de exemplo para o administrador inicial
-- IMPORTANTE: Substitua 'SEU_EMAIL_AQUI' pelo seu e-mail real no Supabase Auth antes de rodar
INSERT INTO public.usuarios_autorizados (email)
VALUES ('SEU_EMAIL_AQUI')
ON CONFLICT (email) DO NOTHING;

-- Habilita RLS em usuarios_autorizados
ALTER TABLE public.usuarios_autorizados ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas de usuarios_autorizados (se existirem)
DROP POLICY IF EXISTS "usuarios_autorizados_select_proprio" ON public.usuarios_autorizados;
DROP POLICY IF EXISTS "Permitir leitura apenas do proprio email" ON public.usuarios_autorizados;

-- Permite leitura em usuarios_autorizados apenas ao próprio e-mail autenticado
CREATE POLICY "usuarios_autorizados_select_proprio"
    ON public.usuarios_autorizados
    FOR SELECT
    TO authenticated
    USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- 2. Função de validação de autorização (SECURITY DEFINER)
-- Retorna true apenas se o e-mail do token JWT existir em usuarios_autorizados
CREATE OR REPLACE FUNCTION public.is_usuario_autorizado()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_autorizados
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 3. Limpeza de todas as políticas antigas e permissivas de leads_escolares
DROP POLICY IF EXISTS "Permitir leitura para todos os usuários autenticados e anon" ON public.leads_escolares;
DROP POLICY IF EXISTS "Permitir atualização para anon e authenticated" ON public.leads_escolares;
DROP POLICY IF EXISTS "Permitir inserção via anon e authenticated" ON public.leads_escolares;
DROP POLICY IF EXISTS "Permitir exclusão para anon e authenticated" ON public.leads_escolares;
DROP POLICY IF EXISTS "leads_escolares_select" ON public.leads_escolares;
DROP POLICY IF EXISTS "leads_escolares_insert" ON public.leads_escolares;
DROP POLICY IF EXISTS "leads_escolares_update" ON public.leads_escolares;
DROP POLICY IF EXISTS "leads_escolares_delete" ON public.leads_escolares;

-- 4. Habilitação estrita de RLS em leads_escolares
ALTER TABLE public.leads_escolares ENABLE ROW LEVEL SECURITY;

-- 5. Novas políticas: apenas usuários autenticados E constantes em usuarios_autorizados
CREATE POLICY "leads_escolares_select"
    ON public.leads_escolares
    FOR SELECT
    TO authenticated
    USING (public.is_usuario_autorizado());

CREATE POLICY "leads_escolares_insert"
    ON public.leads_escolares
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_usuario_autorizado());

CREATE POLICY "leads_escolares_update"
    ON public.leads_escolares
    FOR UPDATE
    TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

CREATE POLICY "leads_escolares_delete"
    ON public.leads_escolares
    FOR DELETE
    TO authenticated
    USING (public.is_usuario_autorizado());

-- NOTA: O papel anon NÃO possui nenhuma política (acesso totalmente bloqueado por padrão).
