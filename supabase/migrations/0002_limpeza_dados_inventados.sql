-- ==============================================================================
-- Migração 0002: Remoção de Dados Inventados, Simulações e Tabela de Execuções
-- ==============================================================================

-- 1. Adicionar colunas de revisão e auditoria em leads_escolares
ALTER TABLE public.leads_escolares
    ADD COLUMN IF NOT EXISTS precisa_revisao BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS observacao_revisao TEXT;

-- 2. Tabela de histórico e status real de execuções do agente SDR
CREATE TABLE IF NOT EXISTS public.agente_execucoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    finalizado_em TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('rodando', 'sucesso', 'erro')),
    leads_encontrados INT NOT NULL DEFAULT 0,
    leads_inseridos INT NOT NULL DEFAULT 0,
    mensagem TEXT
);

-- Habilitar RLS em agente_execucoes
ALTER TABLE public.agente_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agente_execucoes_select" ON public.agente_execucoes;
CREATE POLICY "agente_execucoes_select"
    ON public.agente_execucoes
    FOR SELECT
    TO authenticated
    USING (public.is_usuario_autorizado());

-- 3. Backup de segurança das linhas que serão afetadas
DROP TABLE IF EXISTS public.leads_escolares_backup_0002;

CREATE TABLE public.leads_escolares_backup_0002 AS
SELECT *
FROM public.leads_escolares
WHERE 
    lower(trim(nome_escola)) = lower('Colégio Teste Autônomo DF')
    OR email_escola ILIKE '%@educacao.df.br'
    OR email_escola ILIKE '%@escola.df.gov.br'
    OR email_escola ILIKE '%@ensino.com.br'
    OR email_escola ~* '^(contato|secretaria|diretoria|diretor)\.[a-z0-9]+@gmail\.com$'
    OR email_decisor ILIKE '%@educacao.df.br'
    OR email_decisor ILIKE '%@escola.df.gov.br'
    OR email_decisor ILIKE '%@ensino.com.br'
    OR email_decisor ~* '^(contato|secretaria|diretoria|diretor)\.[a-z0-9]+@gmail\.com$'
    OR nome_decisor ILIKE 'Coordenação Pedagógica%'
    OR nome_decisor ILIKE 'Direção / Coordenação%'
    OR nome_decisor ILIKE 'Direção Pedagógica%'
    OR nome_decisor ILIKE 'Diretor(a) Pedagógico(a)%'
    OR nome_decisor ILIKE 'Diretoria Pedagógica%'
    OR nome_decisor ILIKE 'Direção Geral%'
    OR nome_decisor ILIKE 'Equipe Pedagógica%'
    OR nome_decisor ILIKE '%(porte)%';

-- 4. Excluir lead de teste fictício
DELETE FROM public.leads_escolares
WHERE lower(trim(nome_escola)) = lower('Colégio Teste Autônomo DF');

-- 5. Anular e-mails fabricados pelo agente antigo e marcar para revisão
UPDATE public.leads_escolares
SET 
    email_escola = CASE 
        WHEN email_escola ILIKE '%@educacao.df.br' 
          OR email_escola ILIKE '%@escola.df.gov.br' 
          OR email_escola ILIKE '%@ensino.com.br' 
          OR email_escola ~* '^(contato|secretaria|diretoria|diretor)\.[a-z0-9]+@gmail\.com$' 
        THEN NULL 
        ELSE email_escola 
    END,
    email_decisor = CASE 
        WHEN email_decisor ILIKE '%@educacao.df.br' 
          OR email_decisor ILIKE '%@escola.df.gov.br' 
          OR email_decisor ILIKE '%@ensino.com.br' 
          OR email_decisor ~* '^(contato|secretaria|diretoria|diretor)\.[a-z0-9]+@gmail\.com$' 
        THEN NULL 
        ELSE email_decisor 
    END,
    precisa_revisao = true,
    observacao_revisao = CASE 
        WHEN observacao_revisao IS NULL OR observacao_revisao = '' 
        THEN 'E-mail gerado automaticamente pelo agente antigo, removido'
        ELSE observacao_revisao || '; E-mail gerado automaticamente pelo agente antigo, removido'
    END
WHERE 
    email_escola ILIKE '%@educacao.df.br'
    OR email_escola ILIKE '%@escola.df.gov.br'
    OR email_escola ILIKE '%@ensino.com.br'
    OR email_escola ~* '^(contato|secretaria|diretoria|diretor)\.[a-z0-9]+@gmail\.com$'
    OR email_decisor ILIKE '%@educacao.df.br'
    OR email_decisor ILIKE '%@escola.df.gov.br'
    OR email_decisor ILIKE '%@ensino.com.br'
    OR email_decisor ~* '^(contato|secretaria|diretoria|diretor)\.[a-z0-9]+@gmail\.com$';

-- 6. Anular nomes de decisores genéricos/inferidos e marcar para revisão
UPDATE public.leads_escolares
SET 
    nome_decisor = NULL,
    precisa_revisao = true,
    observacao_revisao = CASE 
        WHEN observacao_revisao IS NULL OR observacao_revisao = '' 
        THEN 'Decisor genérico suposto pelo agente antigo, removido'
        ELSE observacao_revisao || '; Decisor genérico suposto pelo agente antigo, removido'
    END
WHERE 
    nome_decisor ILIKE 'Coordenação Pedagógica%'
    OR nome_decisor ILIKE 'Direção / Coordenação%'
    OR nome_decisor ILIKE 'Direção Pedagógica%'
    OR nome_decisor ILIKE 'Diretor(a) Pedagógico(a)%'
    OR nome_decisor ILIKE 'Diretoria Pedagógica%'
    OR nome_decisor ILIKE 'Direção Geral%'
    OR nome_decisor ILIKE 'Equipe Pedagógica%'
    OR nome_decisor ILIKE '%(porte)%';
