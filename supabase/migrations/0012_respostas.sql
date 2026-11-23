-- 0012_respostas.sql
-- ETAPA 11: DETECÇÃO E CLASSIFICAÇÃO DE RESPOSTAS E LEMBRETES

-- 1. Campos de controle de leitura em caixas_envio
ALTER TABLE public.caixas_envio
    ADD COLUMN IF NOT EXISTS ultimo_history_id TEXT,
    ADD COLUMN IF NOT EXISTS ultima_leitura_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- 2. Tabela de Respostas Recebidas
CREATE TABLE IF NOT EXISTS public.respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interacao_id UUID REFERENCES public.interacoes(id) ON DELETE SET NULL,
    inscricao_id UUID REFERENCES public.inscricoes(id) ON DELETE SET NULL,
    escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    caixa_envio_id UUID REFERENCES public.caixas_envio(id) ON DELETE SET NULL,
    de_email TEXT NOT NULL,
    assunto TEXT NOT NULL,
    corpo_texto TEXT NOT NULL,
    recebido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    provedor_message_id TEXT UNIQUE,
    provedor_thread_id TEXT,
    classificacao TEXT CHECK (classificacao IN (
        'interessado',
        'mais_informacoes',
        'agora_nao',
        'indicou_outra_pessoa',
        'sem_interesse',
        'descadastro',
        'resposta_automatica',
        'bounce',
        'outro'
    )),
    confianca NUMERIC CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 1)),
    justificativa TEXT,
    data_retorno DATE,
    indicado_nome TEXT,
    indicado_email TEXT,
    rascunho_resposta TEXT,
    tratada BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_respostas_escola_id ON public.respostas (escola_id);
CREATE INDEX IF NOT EXISTS idx_respostas_inscricao_id ON public.respostas (inscricao_id);
CREATE INDEX IF NOT EXISTS idx_respostas_tratada ON public.respostas (tratada);
CREATE INDEX IF NOT EXISTS idx_respostas_provedor_message_id ON public.respostas (provedor_message_id);

ALTER TABLE public.respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "respostas_auth_policy"
    ON public.respostas FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 3. Tabela de Lembretes de Retorno
CREATE TABLE IF NOT EXISTS public.lembretes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    data DATE NOT NULL,
    texto TEXT NOT NULL,
    concluido BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lembretes_data_concluido ON public.lembretes (data, concluido);
CREATE INDEX IF NOT EXISTS idx_lembretes_escola_id ON public.lembretes (escola_id);

ALTER TABLE public.lembretes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lembretes_auth_policy"
    ON public.lembretes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 4. Atualização da restrição de checagem de contatos.fonte para incluir 'resposta'
ALTER TABLE public.contatos DROP CONSTRAINT IF EXISTS contatos_fonte_check;
ALTER TABLE public.contatos ADD CONSTRAINT contatos_fonte_check
    CHECK (fonte IN ('qsa', 'site', 'hunter', 'snov', 'apollo', 'manual', 'receita', 'resposta'));
