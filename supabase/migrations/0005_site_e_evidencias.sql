-- ==============================================================================
-- Migração 0005: Descoberta de Decisores no Site, Evidências e Custos do Agente
-- ==============================================================================

-- 1. Campos de Google Places e status de verificação em escolas
ALTER TABLE public.escolas
    ADD COLUMN IF NOT EXISTS google_place_id TEXT,
    ADD COLUMN IF NOT EXISTS google_rating NUMERIC,
    ADD COLUMN IF NOT EXISTS google_avaliacoes INT,
    ADD COLUMN IF NOT EXISTS site_verificado_em TIMESTAMPTZ;

-- 2. Campos de evidência literal e metadados de custo em contatos
ALTER TABLE public.contatos
    ADD COLUMN IF NOT EXISTS evidencia TEXT,
    ADD COLUMN IF NOT EXISTS custo JSONB;

-- 3. Atualizar restrição CHECK de fonte em contatos garantindo 'site' e 'hunter'
DO $$
BEGIN
    ALTER TABLE public.contatos DROP CONSTRAINT IF EXISTS contatos_fonte_check;
    ALTER TABLE public.contatos ADD CONSTRAINT contatos_fonte_check 
        CHECK (fonte IN ('qsa', 'site', 'hunter', 'snov', 'apollo', 'manual', 'receita'));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 4. Tabela de custos detalhados por serviço da execução do agente
CREATE TABLE IF NOT EXISTS public.custos_agente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execucao_id UUID REFERENCES public.agente_execucoes(id) ON DELETE SET NULL,
    escola_id UUID REFERENCES public.escolas(id) ON DELETE CASCADE,
    servico TEXT NOT NULL,
    unidades NUMERIC NOT NULL DEFAULT 1,
    custo_estimado_usd NUMERIC NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custos_agente_execucao ON public.custos_agente (execucao_id);
CREATE INDEX IF NOT EXISTS idx_custos_agente_escola ON public.custos_agente (escola_id);

ALTER TABLE public.custos_agente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custos_agente_auth_policy" ON public.custos_agente;
CREATE POLICY "custos_agente_auth_policy"
    ON public.custos_agente FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());
