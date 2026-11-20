-- ==============================================================================
-- Migração 0003: Novo Modelo de Dados — Escolas, Contatos e Interações
-- ==============================================================================

-- 1. Habilita extensão unaccent para normalização textual
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper determinístico IMMUTABLE para permitir uso do unaccent em STORED GENERATED COLUMNS
-- Justificativa: unaccent() padrão no PostgreSQL depende de search_path e collation (STABLE).
-- Fornecer o dicionário explicitamente ('unaccent') garante imutabilidade estrita e deterministicidade.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent('unaccent', $1);
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- Função genérica de atualização de timestamp
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Tabela de Escolas (Unidade escolar)
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

-- Índices em escolas
CREATE UNIQUE INDEX IF NOT EXISTS idx_escolas_cnpj ON public.escolas (cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_escolas_chave_dedup ON public.escolas (chave_dedup);
CREATE INDEX IF NOT EXISTS idx_escolas_status_funil ON public.escolas (status_funil);

-- Trigger de atualização de timestamp em escolas
DROP TRIGGER IF EXISTS trigger_escolas_atualizado_em ON public.escolas;
CREATE TRIGGER trigger_escolas_atualizado_em
    BEFORE UPDATE ON public.escolas
    FOR EACH ROW
    EXECUTE FUNCTION public.set_atualizado_em();

-- 3. Tabela de Contatos (Decisores de uma escola)
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

-- Índices em contatos
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_escola_email ON public.contatos (escola_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_escola_principal ON public.contatos (escola_id) WHERE principal = true;
CREATE INDEX IF NOT EXISTS idx_contatos_escola_id ON public.contatos (escola_id);

-- Trigger de atualização de timestamp em contatos
DROP TRIGGER IF EXISTS trigger_contatos_atualizado_em ON public.contatos;
CREATE TRIGGER trigger_contatos_atualizado_em
    BEFORE UPDATE ON public.contatos
    FOR EACH ROW
    EXECUTE FUNCTION public.set_atualizado_em();

-- 4. Tabela de Interações (Eventos da jornada do funil)
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

-- Índice cronológico de interações por escola
CREATE INDEX IF NOT EXISTS idx_interacoes_escola_criado_em ON public.interacoes (escola_id, criado_em DESC);

-- 5. Configuração de Row Level Security (RLS)
ALTER TABLE public.escolas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escolas_auth_policy" ON public.escolas;
CREATE POLICY "escolas_auth_policy"
    ON public.escolas FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

DROP POLICY IF EXISTS "contatos_auth_policy" ON public.contatos;
CREATE POLICY "contatos_auth_policy"
    ON public.contatos FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

DROP POLICY IF EXISTS "interacoes_auth_policy" ON public.interacoes;
CREATE POLICY "interacoes_auth_policy"
    ON public.interacoes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- 6. Migração dos dados legados de leads_escolares para escolas e contatos
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'leads_escolares'
    ) THEN
        -- Copia os leads para a tabela de escolas
        INSERT INTO public.escolas (
            id,
            nome,
            cidade,
            uf,
            telefone,
            email_geral,
            status_funil,
            status_qualificacao,
            precisa_revisao,
            observacao_revisao,
            fonte,
            ultima_interacao,
            criado_em,
            atualizado_em
        )
        SELECT DISTINCT ON (
            lower(regexp_replace(public.immutable_unaccent(trim(l.nome_escola)), '[^a-zA-Z0-9]', '', 'g')) || '_' ||
            lower(regexp_replace(public.immutable_unaccent(trim(l.cidade)), '[^a-zA-Z0-9]', '', 'g')) || '_' ||
            CASE 
                WHEN trim(l.cidade) IN ('Luziânia', 'Formosa', 'Valparaíso de Goiás', 'Novo Gama') THEN 'go'
                ELSE 'df'
            END
        )
            l.id,
            trim(l.nome_escola) as nome,
            trim(l.cidade) as cidade,
            CASE 
                WHEN trim(l.cidade) IN ('Luziânia', 'Formosa', 'Valparaíso de Goiás', 'Novo Gama') THEN 'GO'
                ELSE 'DF'
            END as uf,
            l.telefone_escola as telefone,
            l.email_escola as email_geral,
            CASE l.status
                WHEN 'novo' THEN 'novo'
                WHEN 'contato_enviado' THEN 'contato_enviado'
                WHEN 'respondido' THEN 'respondido'
                WHEN 'reuniao_agendada' THEN 'reuniao_agendada'
                ELSE 'novo'
            END as status_funil,
            'bruto' as status_qualificacao,
            COALESCE(l.precisa_revisao, false) as precisa_revisao,
            l.observacao_revisao,
            'legado_qualotelefone' as fonte,
            l.ultima_interacao,
            COALESCE(l.created_at, now()) as criado_em,
            now() as atualizado_em
        FROM public.leads_escolares l
        WHERE l.nome_escola IS NOT NULL AND trim(l.nome_escola) != ''
        ON CONFLICT (chave_dedup) DO NOTHING;

        -- Copia os decisores identificados para contatos
        INSERT INTO public.contatos (
            escola_id,
            nome,
            cargo,
            tipo,
            email,
            email_status,
            telefone,
            fonte,
            principal,
            descadastrado,
            criado_em,
            atualizado_em
        )
        SELECT 
            e.id as escola_id,
            l.nome_decisor as nome,
            NULL as cargo,
            'outro' as tipo,
            l.email_decisor as email,
            'nao_verificado' as email_status,
            NULL as telefone,
            'manual' as fonte,
            true as principal,
            false as descadastrado,
            COALESCE(l.created_at, now()) as criado_em,
            now() as atualizado_em
        FROM public.leads_escolares l
        JOIN public.escolas e ON e.id = l.id
        WHERE (l.nome_decisor IS NOT NULL AND trim(l.nome_decisor) != '')
           OR (l.email_decisor IS NOT NULL AND trim(l.email_decisor) != '')
        ON CONFLICT (escola_id) WHERE principal = true DO NOTHING;

        -- 7. Renomear tabela legada para preservação histórica
        ALTER TABLE public.leads_escolares RENAME TO leads_escolares_legado;
    END IF;
END $$;

-- ==============================================================================
-- Consultas de Conferência Pós-Migração
-- ==============================================================================
-- 1. Total de registros na tabela legada:
-- SELECT count(*) AS total_legado FROM public.leads_escolares_legado;

-- 2. Total de escolas migradas com a fonte original:
-- SELECT count(*) AS total_escolas_legado FROM public.escolas WHERE fonte = 'legado_qualotelefone';

-- 3. Total de contatos principais criados na migração:
-- SELECT count(*) AS total_contatos_migrados FROM public.contatos WHERE fonte = 'manual' AND principal = true;

-- 4. Validação de integridade (deve ser 0):
-- SELECT count(*) AS contatos_sem_escola FROM public.contatos c LEFT JOIN public.escolas e ON e.id = c.escola_id WHERE e.id IS NULL;
