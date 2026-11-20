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
    site TEXT,
    dominio TEXT,
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

-- 5. Tabela de Interações (Jornada do Funil)
CREATE TABLE IF NOT EXISTS public.interacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
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
    metadata JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interacoes_escola_criado_em ON public.interacoes (escola_id, criado_em DESC);

ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interacoes_auth_policy"
    ON public.interacoes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

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
