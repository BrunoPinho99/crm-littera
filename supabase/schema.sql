-- ==============================================================================
-- Schema Consolidado do CRM Littera
-- ==============================================================================

-- 1. Tabela de Usuários Autorizados
CREATE TABLE IF NOT EXISTS public.usuarios_autorizados (
    email TEXT PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserção de exemplo para o operador inicial (substitua pelo seu e-mail real)
INSERT INTO public.usuarios_autorizados (email)
VALUES ('SEU_EMAIL_AQUI')
ON CONFLICT (email) DO NOTHING;

-- RLS para usuarios_autorizados (somente leitura do próprio e-mail)
ALTER TABLE public.usuarios_autorizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_autorizados_select_proprio"
    ON public.usuarios_autorizados
    FOR SELECT
    TO authenticated
    USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- 2. Função SECURITY DEFINER para verificar se o usuário autenticado está autorizado
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

-- 3. Tabela de Leads Escolares
CREATE TABLE IF NOT EXISTS public.leads_escolares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    nome_escola TEXT NOT NULL,
    cidade TEXT NOT NULL DEFAULT 'Brasília',
    telefone_escola TEXT,
    email_escola TEXT,
    nome_decisor TEXT,
    email_decisor TEXT,
    status TEXT NOT NULL DEFAULT 'novo' 
        CHECK (status IN ('novo', 'contato_enviado', 'respondido', 'reuniao_agendada')),
    ultima_interacao TIMESTAMPTZ,
    precisa_revisao BOOLEAN NOT NULL DEFAULT false,
    observacao_revisao TEXT
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_leads_escolares_status ON public.leads_escolares(status);
CREATE INDEX IF NOT EXISTS idx_leads_escolares_nome ON public.leads_escolares(nome_escola);
CREATE INDEX IF NOT EXISTS idx_leads_escolares_created_at ON public.leads_escolares(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_escolares_precisa_revisao ON public.leads_escolares(precisa_revisao);

-- Unicidade por nome e cidade para evitar duplicatas de prospecção
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_escolares_unique_school 
    ON public.leads_escolares(lower(trim(nome_escola)), lower(trim(cidade)));

-- 4. Habilitação de RLS em leads_escolares
ALTER TABLE public.leads_escolares ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS estritas: apenas usuários autenticados autorizados
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

-- 5. Tabela de Execuções Reais do Agente SDR
CREATE TABLE IF NOT EXISTS public.agente_execucoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    finalizado_em TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('rodando', 'sucesso', 'erro')),
    leads_encontrados INT NOT NULL DEFAULT 0,
    leads_inseridos INT NOT NULL DEFAULT 0,
    mensagem TEXT
);

ALTER TABLE public.agente_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agente_execucoes_select"
    ON public.agente_execucoes
    FOR SELECT
    TO authenticated
    USING (public.is_usuario_autorizado());
