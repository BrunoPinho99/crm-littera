-- ==============================================================================
-- Migração 0004: Tabela de Cache de Consultas CNPJ (BrasilAPI e OpenCNPJ)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cache_cnpj (
    cnpj TEXT PRIMARY KEY,
    fonte TEXT NOT NULL,
    payload JSONB NOT NULL,
    consultado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS habilitado: sem políticas para anon ou authenticated (apenas service_role acessa)
ALTER TABLE public.cache_cnpj ENABLE ROW LEVEL SECURITY;
