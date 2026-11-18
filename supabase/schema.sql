-- ==============================================================================
-- Schema do CRM Littera: Tabela de Leads Escolares
-- ==============================================================================

-- 1. Criação da tabela
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
    ultima_interacao TIMESTAMPTZ
);

-- 2. Índices para performance em buscas e filtros
CREATE INDEX IF NOT EXISTS idx_leads_escolares_status ON public.leads_escolares(status);
CREATE INDEX IF NOT EXISTS idx_leads_escolares_nome ON public.leads_escolares(nome_escola);
CREATE INDEX IF NOT EXISTS idx_leads_escolares_created_at ON public.leads_escolares(created_at DESC);

-- Opcional: Garante unicidade por nome e cidade para evitar duplicatas do scraper
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_escolares_unique_school 
    ON public.leads_escolares(lower(trim(nome_escola)), lower(trim(cidade)));

-- 3. Habilitação de RLS (Row Level Security)
ALTER TABLE public.leads_escolares ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Segurança (RLS)

-- Política de leitura (anon/authenticated podem ler leads no dashboard)
CREATE POLICY "Permitir leitura para todos os usuários autenticados e anon"
    ON public.leads_escolares
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Política de atualização (para alterar status ao clicar em 'Enviar E-mail')
CREATE POLICY "Permitir atualização para anon e authenticated"
    ON public.leads_escolares
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Política de inserção (usada pelo Agente/API ou Dashboard)
CREATE POLICY "Permitir inserção via anon e authenticated"
    ON public.leads_escolares
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
