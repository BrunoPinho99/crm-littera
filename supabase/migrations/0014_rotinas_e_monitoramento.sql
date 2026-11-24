-- 0014_rotinas_e_monitoramento.sql
-- ETAPA 13: REGISTRO DE ROTINAS, MONITORAMENTO, ENTREGABILIDADE E ALERTAS
--
-- 1. Criação da tabela rotinas_execucoes
CREATE TABLE IF NOT EXISTS public.rotinas_execucoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotina TEXT NOT NULL CHECK (rotina IN ('agente_diario', 'cron_sequencias', 'leitor_respostas', 'agenda', 'verificacao_email')),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_em TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('rodando', 'sucesso', 'erro')),
    resumo JSONB DEFAULT '{}'::jsonb,
    erro TEXT
);

CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_rotina ON public.rotinas_execucoes (rotina, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_status ON public.rotinas_execucoes (status);
CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_iniciado ON public.rotinas_execucoes (iniciado_em DESC);

ALTER TABLE public.rotinas_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotinas_execucoes_auth_policy"
    ON public.rotinas_execucoes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 2. Criação da tabela alertas_sistema para monitoramento e prevenção de disparos duplicados
CREATE TABLE IF NOT EXISTS public.alertas_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    severidade TEXT NOT NULL CHECK (severidade IN ('info', 'aviso', 'erro', 'critico')),
    detalhes JSONB DEFAULT '{}'::jsonb,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvido_em TIMESTAMPTZ,
    ultimo_notificado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alertas_sistema_tipo_ativo ON public.alertas_sistema (tipo, ativo);
CREATE INDEX IF NOT EXISTS idx_alertas_sistema_criado ON public.alertas_sistema (criado_em DESC);

ALTER TABLE public.alertas_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_sistema_auth_policy"
    ON public.alertas_sistema FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());
