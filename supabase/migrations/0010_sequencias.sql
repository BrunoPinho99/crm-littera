-- 0010_sequencias.sql
-- Motor de Sequência de E-mails, Cadências Multitoques e Fila de Aprovação

-- 1. Tabela de Sequências
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

-- 2. Tabela de Passos da Sequência
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

-- 3. Tabela de Inscrições de Escolas em Sequências
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

-- Garantir no máximo uma inscrição ativa ou pausada por escola
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

-- 4. Tabela de Fila de Envios (Modo de Aprovação e Despacho)
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

-- 5. Tabela de Feriados Nacionais e Distritais (DF)
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

-- População de feriados de 2026 e 2027 (Nacionais e DF)
INSERT INTO public.feriados (data, nome, abrangencia) VALUES
    -- 2026
    ('2026-01-01', 'Confraternização Universal', 'nacional'),
    ('2026-02-16', 'Carnaval (segunda-feira)', 'nacional'),
    ('2026-02-17', 'Carnaval (terça-feira)', 'nacional'),
    ('2026-04-03', 'Sexta-feira Santa', 'nacional'),
    ('2026-04-21', 'Tiradentes e Aniversário de Brasília', 'distrital'),
    ('2026-05-01', 'Dia do Trabalho', 'nacional'),
    ('2026-06-04', 'Corpus Christi', 'nacional'),
    ('2026-09-07', 'Independência do Brasil', 'nacional'),
    ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
    ('2026-11-02', 'Finados', 'nacional'),
    ('2026-11-15', 'Proclamação da República', 'nacional'),
    ('2026-11-20', 'Dia da Consciência Negra', 'nacional'),
    ('2026-11-30', 'Dia do Evangélico (DF)', 'distrital'),
    ('2026-12-25', 'Natal', 'nacional'),
    -- 2027
    ('2027-01-01', 'Confraternização Universal', 'nacional'),
    ('2027-02-08', 'Carnaval (segunda-feira)', 'nacional'),
    ('2027-02-09', 'Carnaval (terça-feira)', 'nacional'),
    ('2027-03-26', 'Sexta-feira Santa', 'nacional'),
    ('2027-04-21', 'Tiradentes e Aniversário de Brasília', 'distrital'),
    ('2027-05-01', 'Dia do Trabalho', 'nacional'),
    ('2027-05-27', 'Corpus Christi', 'nacional'),
    ('2027-09-07', 'Independência do Brasil', 'nacional'),
    ('2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
    ('2027-11-02', 'Finados', 'nacional'),
    ('2027-11-15', 'Proclamação da República', 'nacional'),
    ('2027-11-20', 'Dia da Consciência Negra', 'nacional'),
    ('2027-11-30', 'Dia do Evangélico (DF)', 'distrital'),
    ('2027-12-25', 'Natal', 'nacional')
ON CONFLICT (data) DO UPDATE SET nome = EXCLUDED.nome, abrangencia = EXCLUDED.abrangencia;

-- 6. Configuração opcional de auto-inscrição do lote diário
INSERT INTO public.config_envio (chave, valor_bool, descricao)
VALUES ('auto_inscrever_lote', false, 'Inscrever automaticamente escolas qualificadas do lote diário na sequência padrão')
ON CONFLICT (chave) DO NOTHING;

-- 7. Funções de Concorrência e Idempotência (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.obter_inscricoes_para_processar(p_limite INT DEFAULT 10)
RETURNS SETOF public.inscricoes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.inscricoes
    WHERE status = 'ativa'
      AND (proximo_envio_em IS NULL OR proximo_envio_em <= now())
    ORDER BY proximo_envio_em ASC NULLS FIRST
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED;
END;
$$;

CREATE OR REPLACE FUNCTION public.obter_fila_envios_aprovados_para_envio(p_limite INT DEFAULT 10)
RETURNS SETOF public.fila_envios
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.fila_envios
    WHERE status = 'aprovado'
      AND agendado_para <= now()
    ORDER BY agendado_para ASC
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED;
END;
$$;

-- 8. Seed da Sequência Padrão (5 toques em 14 dias)
DO $$
DECLARE
    v_seq_id UUID;
BEGIN
    -- Insere ou busca sequência padrão
    INSERT INTO public.sequencias (nome, ativa, modo_aprovacao)
    VALUES ('Sequência Padrão - 5 Toques (14 dias)', true, true)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_seq_id
    FROM public.sequencias
    WHERE nome = 'Sequência Padrão - 5 Toques (14 dias)'
    LIMIT 1;

    -- Toque 1: Dia 0 (email_novo, usar_ia = true)
    INSERT INTO public.sequencia_passos (sequencia_id, ordem, dias_apos_anterior, tipo, assunto_template, corpo_template, usar_ia, ativo)
    VALUES (
        v_seq_id,
        1,
        0,
        'email_novo',
        'redações do ensino médio na {{escola}}',
        'Olá, {{primeiro_nome}}.\n\n{{gancho}}\n\nCriamos a Littera para resolver um gargalo comum nas escolas de {{cidade}}: o tempo da equipe na correção manual de redações.\n\nNossa plataforma entrega devolutivas alinhadas às 5 competências do ENEM em segundos, permitindo que os alunos treinem toda semana sem sobrecarregar seus professores de redação.\n\nTeria 15 minutos nesta semana para conversarmos sobre a preparação do Ensino Médio da {{escola}}?\n\n{{link_agenda}}\n\n{{remetente}}',
        true,
        true
    ) ON CONFLICT (sequencia_id, ordem) DO UPDATE SET
        dias_apos_anterior = EXCLUDED.dias_apos_anterior,
        tipo = EXCLUDED.tipo,
        assunto_template = EXCLUDED.assunto_template,
        corpo_template = EXCLUDED.corpo_template,
        usar_ia = EXCLUDED.usar_ia,
        ativo = EXCLUDED.ativo;

    -- Toque 2: Dia 3 (email_resposta)
    INSERT INTO public.sequencia_passos (sequencia_id, ordem, dias_apos_anterior, tipo, assunto_template, corpo_template, usar_ia, ativo)
    VALUES (
        v_seq_id,
        2,
        3,
        'email_resposta',
        'Re: redações do ensino médio na {{escola}}',
        'Olá, {{primeiro_nome}}.\n\nPassando apenas para complementar: com a Littera, a equipe pedagógica economiza mais de 15 horas semanais em correções e reduz o tempo de devolutiva aos alunos de dias para menos de 1 minuto.\n\nIsso viabiliza dobrar os treinos no semestre.\n\nConsegue conversar 15 minutos na quinta ou sexta?\n\n{{link_agenda}}\n\n{{remetente}}',
        false,
        true
    ) ON CONFLICT (sequencia_id, ordem) DO UPDATE SET
        dias_apos_anterior = EXCLUDED.dias_apos_anterior,
        tipo = EXCLUDED.tipo,
        assunto_template = EXCLUDED.assunto_template,
        corpo_template = EXCLUDED.corpo_template,
        usar_ia = EXCLUDED.usar_ia,
        ativo = EXCLUDED.ativo;

    -- Toque 3: Dia 7 (email_resposta)
    INSERT INTO public.sequencia_passos (sequencia_id, ordem, dias_apos_anterior, tipo, assunto_template, corpo_template, usar_ia, ativo)
    VALUES (
        v_seq_id,
        3,
        4, -- 4 dias após o toque 2 = dia 7 total
        'email_resposta',
        'Re: redações do ensino médio na {{escola}}',
        'Olá, {{primeiro_nome}}.\n\nUm dado que observamos: escolas que aumentam a frequência de redações com devolutiva imediata sobem a média do ENEM já no primeiro simulado.\n\nSe fizer sentido para o planejamento pedagógico da {{escola}}, podemos testar um simulado piloto sem custo com uma turma.\n\nQual horário fica bom para você?\n\n{{link_agenda}}\n\n{{remetente}}',
        false,
        true
    ) ON CONFLICT (sequencia_id, ordem) DO UPDATE SET
        dias_apos_anterior = EXCLUDED.dias_apos_anterior,
        tipo = EXCLUDED.tipo,
        assunto_template = EXCLUDED.assunto_template,
        corpo_template = EXCLUDED.corpo_template,
        usar_ia = EXCLUDED.usar_ia,
        ativo = EXCLUDED.ativo;

    -- Toque 4: Dia 10 (email_outro_contato)
    INSERT INTO public.sequencia_passos (sequencia_id, ordem, dias_apos_anterior, tipo, assunto_template, corpo_template, usar_ia, ativo)
    VALUES (
        v_seq_id,
        4,
        3, -- 3 dias após o toque 3 = dia 10 total
        'email_outro_contato',
        'ensino médio e enem: {{escola}}',
        'Olá, {{primeiro_nome}}.\n\nEscrevo diretamente a você como {{cargo}} da {{escola}} porque ajudamos escolas particulares a elevar o desempenho no ENEM sem elevar custos docentes.\n\nAutomatizamos a devolutiva analítica de redações nas 5 competências do exame em segundos.\n\nPodemos agendar 15 minutos para avaliar a aderência na {{escola}}?\n\n{{link_agenda}}\n\n{{remetente}}',
        false,
        true
    ) ON CONFLICT (sequencia_id, ordem) DO UPDATE SET
        dias_apos_anterior = EXCLUDED.dias_apos_anterior,
        tipo = EXCLUDED.tipo,
        assunto_template = EXCLUDED.assunto_template,
        corpo_template = EXCLUDED.corpo_template,
        usar_ia = EXCLUDED.usar_ia,
        ativo = EXCLUDED.ativo;

    -- Toque 5: Dia 14 (email_resposta)
    INSERT INTO public.sequencia_passos (sequencia_id, ordem, dias_apos_anterior, tipo, assunto_template, corpo_template, usar_ia, ativo)
    VALUES (
        v_seq_id,
        5,
        4, -- 4 dias após o toque 4 = dia 14 total
        'email_resposta',
        'Re: redações do ensino médio na {{escola}}',
        'Olá, {{primeiro_nome}}.\n\nImagino que a rotina na {{escola}} esteja corrida neste período. Não vou insistir por aqui.\n\nSe em algum momento quiser rever o processo de correção e treino de redações no Ensino Médio, minha agenda segue aberta:\n\n{{link_agenda}}\n\nUm abraço e excelente semestre de trabalho.\n\n{{remetente}}',
        false,
        true
    ) ON CONFLICT (sequencia_id, ordem) DO UPDATE SET
        dias_apos_anterior = EXCLUDED.dias_apos_anterior,
        tipo = EXCLUDED.tipo,
        assunto_template = EXCLUDED.assunto_template,
        corpo_template = EXCLUDED.corpo_template,
        usar_ia = EXCLUDED.usar_ia,
        ativo = EXCLUDED.ativo;
END $$;
