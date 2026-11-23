-- ==============================================================================
-- Schema Consolidado do CRM Littera (Etapa 2)
-- ==============================================================================

-- 1. Habilita extensão unaccent
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE para uso de unaccent em colunas calculadas STORED
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent('unaccent', $1);
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- Função utilitária para atualizar atualizado_em
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Tabela de Usuários Autorizados
CREATE TABLE IF NOT EXISTS public.usuarios_autorizados (
    email TEXT PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.usuarios_autorizados (email)
VALUES ('SEU_EMAIL_AQUI')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.usuarios_autorizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_autorizados_select_proprio"
    ON public.usuarios_autorizados
    FOR SELECT
    TO authenticated
    USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- Função SECURITY DEFINER para verificar se o usuário autenticado está autorizado
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

-- 3. Tabela de Escolas (Unidade Escolar)
CREATE TABLE IF NOT EXISTS public.escolas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_inep TEXT UNIQUE,
    cnpj TEXT,
    nome TEXT NOT NULL,
    razao_social TEXT,
    nome_fantasia TEXT,
    cidade TEXT NOT NULL,
    uf CHAR(2) NOT NULL,
    bairro TEXT,
    endereco TEXT,
    cep TEXT,
    telefone TEXT,
    email_geral TEXT,
    email_geral_status TEXT NOT NULL DEFAULT 'nao_verificado'
        CHECK (email_geral_status IN ('nao_verificado', 'valido', 'invalido', 'arriscado', 'catch_all', 'desconhecido')),
    email_geral_verificado_em TIMESTAMPTZ,
    site TEXT,
    dominio TEXT,
    google_place_id TEXT,
    google_rating NUMERIC,
    google_avaliacoes INT,
    site_verificado_em TIMESTAMPTZ,
    matriculas_em INT,
    matriculas_total INT,
    oferece_ensino_medio BOOLEAN,
    porte_receita TEXT,
    capital_social NUMERIC,
    situacao_cadastral TEXT,
    chave_dedup TEXT GENERATED ALWAYS AS (
        lower(regexp_replace(public.immutable_unaccent(trim(nome)), '[^a-zA-Z0-9]', '', 'g')) || '_' ||
        lower(regexp_replace(public.immutable_unaccent(trim(cidade)), '[^a-zA-Z0-9]', '', 'g')) || '_' ||
        lower(trim(uf))
    ) STORED,
    score INT,
    score_detalhes JSONB,
    status_qualificacao TEXT NOT NULL DEFAULT 'bruto' 
        CHECK (status_qualificacao IN ('bruto', 'enriquecido', 'qualificado', 'descartado')),
    motivo_descarte TEXT,
    status_funil TEXT NOT NULL DEFAULT 'novo' 
        CHECK (status_funil IN ('novo', 'em_sequencia', 'contato_enviado', 'respondido', 'reuniao_agendada', 'sem_interesse', 'descadastrado')),
    entregue_em DATE,
    ultima_interacao TIMESTAMPTZ,
    precisa_revisao BOOLEAN DEFAULT false,
    observacao_revisao TEXT,
    fonte TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escolas_cnpj ON public.escolas (cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_escolas_chave_dedup ON public.escolas (chave_dedup);
CREATE INDEX IF NOT EXISTS idx_escolas_status_funil ON public.escolas (status_funil);

DROP TRIGGER IF EXISTS trigger_escolas_atualizado_em ON public.escolas;
CREATE TRIGGER trigger_escolas_atualizado_em
    BEFORE UPDATE ON public.escolas
    FOR EACH ROW
    EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.escolas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escolas_auth_policy"
    ON public.escolas FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 4. Tabela de Contatos (Decisores de uma Escola)
CREATE TABLE IF NOT EXISTS public.contatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
    nome TEXT,
    cargo TEXT,
    tipo TEXT CHECK (tipo IS NULL OR tipo IN ('mantenedor', 'diretor_geral', 'diretor_pedagogico', 'coordenador_em', 'secretaria', 'outro')),
    email TEXT,
    email_status TEXT NOT NULL DEFAULT 'nao_verificado' 
        CHECK (email_status IN ('nao_verificado', 'valido', 'invalido', 'arriscado', 'catch_all', 'desconhecido')),
    email_verificado_em TIMESTAMPTZ,
    telefone TEXT,
    linkedin_url TEXT,
    fonte TEXT NOT NULL 
        CHECK (fonte IN ('qsa', 'site', 'hunter', 'snov', 'apollo', 'manual', 'receita')),
    fonte_url TEXT,
    confianca INT CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 100)),
    evidencia TEXT,
    custo JSONB,
    principal BOOLEAN DEFAULT false,
    descadastrado BOOLEAN DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_escola_email ON public.contatos (escola_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_escola_principal ON public.contatos (escola_id) WHERE principal = true;
CREATE INDEX IF NOT EXISTS idx_contatos_escola_id ON public.contatos (escola_id);

DROP TRIGGER IF EXISTS trigger_contatos_atualizado_em ON public.contatos;
CREATE TRIGGER trigger_contatos_atualizado_em
    BEFORE UPDATE ON public.contatos
    FOR EACH ROW
    EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contatos_auth_policy"
    ON public.contatos FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 5. Tabela de Caixas de Envio (Etapa 9)
CREATE TABLE IF NOT EXISTS public.caixas_envio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    nome_remetente TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    limite_diario_inicial INT NOT NULL DEFAULT 10,
    incremento_semanal INT NOT NULL DEFAULT 5,
    limite_diario_maximo INT NOT NULL DEFAULT 50,
    aquecimento_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    enviados_hoje INT NOT NULL DEFAULT 0,
    data_contador DATE NOT NULL DEFAULT CURRENT_DATE,
    assinatura_html TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.caixas_envio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caixas_envio_auth_policy"
    ON public.caixas_envio FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 6. Tabela de Interações (Jornada do Funil)
CREATE TABLE IF NOT EXISTS public.interacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escola_id UUID REFERENCES public.escolas(id) ON DELETE CASCADE,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    caixa_envio_id UUID REFERENCES public.caixas_envio(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN (
        'email_enviado',
        'email_respondido',
        'email_bounce',
        'email_aberto',
        'descadastro',
        'whatsapp',
        'ligacao',
        'reuniao_agendada',
        'reuniao_realizada',
        'nota',
        'mudanca_status'
    )),
    assunto TEXT,
    conteudo TEXT,
    provedor_message_id TEXT,
    provedor_thread_id TEXT,
    rfc_message_id TEXT,
    metadata JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interacoes_escola_criado_em ON public.interacoes (escola_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_interacoes_provedor_thread_id ON public.interacoes (provedor_thread_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_rfc_message_id ON public.interacoes (rfc_message_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_caixa_envio_id ON public.interacoes (caixa_envio_id);

ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interacoes_auth_policy"
    ON public.interacoes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 7. Tabela de Descadastros (Etapa 9)
CREATE TABLE IF NOT EXISTS public.descadastros (
    email TEXT PRIMARY KEY,
    escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    motivo TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.descadastros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "descadastros_auth_policy"
    ON public.descadastros FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

CREATE OR REPLACE FUNCTION public.trg_processar_descadastro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.contato_id IS NOT NULL THEN
        UPDATE public.contatos
        SET descadastrado = true, atualizado_em = now()
        WHERE id = NEW.contato_id;
    END IF;

    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
        UPDATE public.contatos
        SET descadastrado = true, atualizado_em = now()
        WHERE lower(trim(email)) = lower(trim(NEW.email));
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_after_insert_descadastro ON public.descadastros;
CREATE TRIGGER trigger_after_insert_descadastro
    AFTER INSERT ON public.descadastros
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_processar_descadastro();

-- 6. Tabela de Execuções Reais do Agente SDR
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

-- 7. Tabela de Cache de Consultas CNPJ (Etapa 4)
CREATE TABLE IF NOT EXISTS public.cache_cnpj (
    cnpj TEXT PRIMARY KEY,
    fonte TEXT NOT NULL,
    payload JSONB NOT NULL,
    consultado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cache_cnpj ENABLE ROW LEVEL SECURITY;
-- Sem políticas para anon e authenticated: exclusivo para service_role (rotinas de enriquecimento)

-- 8. Tabela de Custos Detalhados do Agente SDR (Etapa 5)
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

CREATE POLICY "custos_agente_auth_policy"
    ON public.custos_agente FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 9. Tabela de Cache de Verificações de E-mail (Etapa 6)
CREATE TABLE IF NOT EXISTS public.verificacoes_email (
    email TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('valido', 'invalido', 'arriscado', 'catch_all', 'desconhecido')),
    sub_status TEXT,
    provedor TEXT NOT NULL,
    resposta JSONB,
    verificado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.verificacoes_email ENABLE ROW LEVEL SECURITY;
-- Sem políticas para anon e authenticated: exclusivo para service_role (cache de verificação)

CREATE INDEX IF NOT EXISTS idx_verificacoes_email_verificado_em ON public.verificacoes_email (verificado_em);
CREATE INDEX IF NOT EXISTS idx_escolas_email_geral_status ON public.escolas (email_geral_status);
CREATE INDEX IF NOT EXISTS idx_contatos_email_status ON public.contatos (email_status);

-- 10. Configuração de Score e Qualificação Automática (Etapa 7)
CREATE TABLE IF NOT EXISTS public.config_score (
    chave TEXT PRIMARY KEY,
    valor NUMERIC,
    valor_texto TEXT,
    descricao TEXT
);

ALTER TABLE public.config_score ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_score_select_policy" ON public.config_score;
CREATE POLICY "config_score_select_policy"
    ON public.config_score FOR SELECT
    TO authenticated
    USING (public.is_usuario_autorizado());

DROP POLICY IF EXISTS "config_score_update_policy" ON public.config_score;
CREATE POLICY "config_score_update_policy"
    ON public.config_score FOR ALL
    TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

CREATE TABLE IF NOT EXISTS public.config_envio (
    chave TEXT PRIMARY KEY,
    valor_bool BOOLEAN NOT NULL DEFAULT false,
    descricao TEXT
);

ALTER TABLE public.config_envio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_envio_select_policy" ON public.config_envio;
CREATE POLICY "config_envio_select_policy"
    ON public.config_envio FOR SELECT
    TO authenticated
    USING (public.is_usuario_autorizado());

DROP POLICY IF EXISTS "config_envio_all_policy" ON public.config_envio;
CREATE POLICY "config_envio_all_policy"
    ON public.config_envio FOR ALL
    TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 11. Controle de Lotes Diários e Personalização do Agente SDR (Etapa 8)
ALTER TABLE public.agente_execucoes
    ADD COLUMN IF NOT EXISTS etapa_atual TEXT,
    ADD COLUMN IF NOT EXISTS detalhes JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS custo_total_usd NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gatilho TEXT CHECK (gatilho IN ('agendado', 'manual'));

CREATE TABLE IF NOT EXISTS public.lotes_diarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data DATE NOT NULL UNIQUE DEFAULT (timezone('America/Sao_Paulo'::text, now()))::date,
    execucao_id UUID REFERENCES public.agente_execucoes(id) ON DELETE SET NULL,
    quantidade INT NOT NULL DEFAULT 0,
    motivo_incompleto TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

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

ALTER TABLE public.escolas
    ADD COLUMN IF NOT EXISTS resumo_pesquisa TEXT,
    ADD COLUMN IF NOT EXISTS gancho_personalizacao TEXT,
    ADD COLUMN IF NOT EXISTS fontes_pesquisa JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS entregue_lote_id UUID REFERENCES public.lotes_diarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_escolas_entregue_lote_id ON public.escolas (entregue_lote_id);
CREATE INDEX IF NOT EXISTS idx_escolas_entregue_em ON public.escolas (entregue_em);
CREATE INDEX IF NOT EXISTS idx_lotes_diarios_data ON public.lotes_diarios (data);

-- 12. Tabelas do Motor de Sequência de E-mails (Etapa 10)
CREATE TABLE IF NOT EXISTS public.sequencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT true,
    modo_aprovacao BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sequencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequencias_auth_policy"
    ON public.sequencias FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

CREATE TABLE IF NOT EXISTS public.sequencia_passos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequencia_id UUID NOT NULL REFERENCES public.sequencias(id) ON DELETE CASCADE,
    ordem INT NOT NULL,
    dias_apos_anterior INT NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL CHECK (tipo IN ('email_novo', 'email_resposta', 'email_outro_contato')),
    assunto_template TEXT NOT NULL,
    corpo_template TEXT NOT NULL,
    usar_ia BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sequencia_passos_ordem UNIQUE (sequencia_id, ordem)
);

ALTER TABLE public.sequencia_passos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequencia_passos_auth_policy"
    ON public.sequencia_passos FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

CREATE TABLE IF NOT EXISTS public.inscricoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    sequencia_id UUID NOT NULL REFERENCES public.sequencias(id) ON DELETE RESTRICT,
    caixa_envio_id UUID REFERENCES public.caixas_envio(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN (
        'ativa',
        'pausada',
        'concluida',
        'respondida',
        'reuniao',
        'cancelada',
        'bounce',
        'descadastrada'
    )),
    passo_atual INT NOT NULL DEFAULT 0,
    proximo_envio_em TIMESTAMPTZ,
    thread_id TEXT,
    rfc_message_id_inicial TEXT,
    ultimo_rfc_message_id TEXT,
    motivo_fim TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inscricoes_escola_ativa
    ON public.inscricoes (escola_id)
    WHERE status IN ('ativa', 'pausada');

CREATE INDEX IF NOT EXISTS idx_inscricoes_proximo_envio
    ON public.inscricoes (status, proximo_envio_em)
    WHERE status = 'ativa';

ALTER TABLE public.inscricoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inscricoes_auth_policy"
    ON public.inscricoes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

DROP TRIGGER IF EXISTS trigger_inscricoes_atualizado_em ON public.inscricoes;
CREATE TRIGGER trigger_inscricoes_atualizado_em
    BEFORE UPDATE ON public.inscricoes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_atualizado_em();

CREATE TABLE IF NOT EXISTS public.fila_envios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inscricao_id UUID NOT NULL REFERENCES public.inscricoes(id) ON DELETE CASCADE,
    passo_id UUID REFERENCES public.sequencia_passos(id) ON DELETE SET NULL,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    para TEXT NOT NULL,
    assunto TEXT NOT NULL,
    corpo_html TEXT NOT NULL,
    corpo_texto TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando_aprovacao' CHECK (status IN (
        'aguardando_aprovacao',
        'aprovado',
        'enviado',
        'erro',
        'descartado'
    )),
    agendado_para TIMESTAMPTZ NOT NULL,
    enviado_em TIMESTAMPTZ,
    erro TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fila_envios_status_agendado
    ON public.fila_envios (status, agendado_para);

ALTER TABLE public.fila_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fila_envios_auth_policy"
    ON public.fila_envios FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

CREATE TABLE IF NOT EXISTS public.feriados (
    data DATE PRIMARY KEY,
    nome TEXT NOT NULL,
    abrangencia TEXT NOT NULL CHECK (abrangencia IN ('nacional', 'distrital', 'estadual'))
);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feriados_auth_policy"
    ON public.feriados FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());




