-- 0008_agente_diario.sql
-- Etapa 8: Agente SDR diário de 20 leads qualificados e controle de lotes diários

-- 1. Campos extras em agente_execucoes
ALTER TABLE public.agente_execucoes
    ADD COLUMN IF NOT EXISTS etapa_atual TEXT,
    ADD COLUMN IF NOT EXISTS detalhes JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS custo_total_usd NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gatilho TEXT CHECK (gatilho IN ('agendado', 'manual'));

-- 2. Tabela de lotes diários
CREATE TABLE IF NOT EXISTS public.lotes_diarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data DATE NOT NULL UNIQUE DEFAULT (timezone('America/Sao_Paulo'::text, now()))::date,
    execucao_id UUID REFERENCES public.agente_execucoes(id) ON DELETE SET NULL,
    quantidade INT NOT NULL DEFAULT 0,
    motivo_incompleto TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- RLS para lotes_diarios
ALTER TABLE public.lotes_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lotes_diarios_select" ON public.lotes_diarios;
CREATE POLICY "lotes_diarios_select"
    ON public.lotes_diarios
    FOR SELECT
    TO authenticated
    USING (public.is_usuario_autorizado());

DROP POLICY IF EXISTS "lotes_diarios_all_auth" ON public.lotes_diarios;
CREATE POLICY "lotes_diarios_all_auth"
    ON public.lotes_diarios
    FOR ALL
    TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 3. Campos extras em escolas para personalização e vinculação ao lote
ALTER TABLE public.escolas
    ADD COLUMN IF NOT EXISTS resumo_pesquisa TEXT,
    ADD COLUMN IF NOT EXISTS gancho_personalizacao TEXT,
    ADD COLUMN IF NOT EXISTS fontes_pesquisa JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS entregue_lote_id UUID REFERENCES public.lotes_diarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_escolas_entregue_lote_id ON public.escolas (entregue_lote_id);
CREATE INDEX IF NOT EXISTS idx_escolas_entregue_em ON public.escolas (entregue_em);
CREATE INDEX IF NOT EXISTS idx_lotes_diarios_data ON public.lotes_diarios (data);
