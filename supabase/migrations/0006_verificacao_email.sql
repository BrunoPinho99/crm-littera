-- 0006_verificacao_email.sql
-- Adiciona email_geral_status e email_geral_verificado_em em escolas
ALTER TABLE public.escolas
    ADD COLUMN IF NOT EXISTS email_geral_status TEXT NOT NULL DEFAULT 'nao_verificado'
        CHECK (email_geral_status IN ('nao_verificado', 'valido', 'invalido', 'arriscado', 'catch_all', 'desconhecido')),
    ADD COLUMN IF NOT EXISTS email_geral_verificado_em TIMESTAMPTZ;

-- Tabela de cache durável de verificações de e-mail
CREATE TABLE IF NOT EXISTS public.verificacoes_email (
    email TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('valido', 'invalido', 'arriscado', 'catch_all', 'desconhecido')),
    sub_status TEXT,
    provedor TEXT NOT NULL,
    resposta JSONB,
    verificado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS habilitado sem políticas públicas (apenas service_role tem acesso direto)
ALTER TABLE public.verificacoes_email ENABLE ROW LEVEL SECURITY;

-- Índices de suporte para busca rápida por status e expiração de cache
CREATE INDEX IF NOT EXISTS idx_verificacoes_email_verificado_em ON public.verificacoes_email (verificado_em);
CREATE INDEX IF NOT EXISTS idx_escolas_email_geral_status ON public.escolas (email_geral_status);
CREATE INDEX IF NOT EXISTS idx_contatos_email_status ON public.contatos (email_status);
