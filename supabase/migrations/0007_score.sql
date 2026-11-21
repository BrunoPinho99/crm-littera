-- 0007_score.sql
-- Tabela de configuração dinâmica de pesos e limites de qualificação
CREATE TABLE IF NOT EXISTS public.config_score (
    chave TEXT PRIMARY KEY,
    valor NUMERIC,
    valor_texto TEXT,
    descricao TEXT
);

-- Inserção dos parâmetros padrão de pontuação
INSERT INTO public.config_score (chave, valor, valor_texto, descricao)
VALUES
    ('em_faixa1_min', 40, NULL, 'Mínimo de matrículas EM para faixa 1'),
    ('em_faixa1_pts', 10, NULL, 'Pontos para faixa 1 de matrículas EM'),
    ('em_faixa2_min', 100, NULL, 'Mínimo de matrículas EM para faixa 2'),
    ('em_faixa2_pts', 20, NULL, 'Pontos para faixa 2 de matrículas EM'),
    ('em_faixa3_min', 200, NULL, 'Mínimo de matrículas EM para faixa 3'),
    ('em_faixa3_pts', 30, NULL, 'Pontos para faixa 3 de matrículas EM'),
    ('decisor_em_ou_diretor_email_valido', 30, NULL, 'Pontos para coordenador EM ou diretor com e-mail válido'),
    ('mantenedor_email_valido', 20, NULL, 'Pontos para mantenedor com e-mail válido'),
    ('decisor_sem_email', 8, NULL, 'Pontos para decisor identificado sem e-mail'),
    ('email_institucional_dominio_proprio', 10, NULL, 'Pontos para e-mail geral em domínio próprio'),
    ('email_so_generico', -5, NULL, 'Penalidade quando todos os e-mails liberados são de provedores genéricos'),
    ('rede', 10, NULL, 'Pontos para escola pertencente a rede/grupo educacional'),
    ('site', 5, NULL, 'Pontos para escola com website institucional'),
    ('google_bom', 5, NULL, 'Pontos para boa reputação no Google'),
    ('google_nota_min', 4.3, NULL, 'Nota mínima no Google para pontuar'),
    ('google_avaliacoes_min', 50, NULL, 'Mínimo de avaliações no Google para pontuar'),
    ('telefone', 5, NULL, 'Pontos para escola com telefone cadastrado'),
    ('regiao_prioritaria', 5, NULL, 'Pontos para escola em região prioritária'),
    ('regiao_prioritaria_uf', NULL, 'DF', 'UF prioritária de prospecção'),
    ('score_minimo_qualificado', 60, NULL, 'Score de corte mínimo para qualificação automática')
ON CONFLICT (chave) DO UPDATE SET
    valor = EXCLUDED.valor,
    valor_texto = EXCLUDED.valor_texto,
    descricao = EXCLUDED.descricao;

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

-- Tabela de Configuração de Aceitação de E-mails para o SQL
CREATE TABLE IF NOT EXISTS public.config_envio (
    chave TEXT PRIMARY KEY,
    valor_bool BOOLEAN NOT NULL DEFAULT false,
    descricao TEXT
);

INSERT INTO public.config_envio (chave, valor_bool, descricao)
VALUES
    ('aceitar_valido', true, 'Aceita e-mails com status valido'),
    ('aceitar_catch_all', false, 'Aceita e-mails com status catch_all'),
    ('aceitar_arriscado', false, 'Aceita e-mails com status arriscado')
ON CONFLICT (chave) DO UPDATE SET
    valor_bool = EXCLUDED.valor_bool;

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

-- Função SQL equivalente ao pode_enviar da Etapa 6
CREATE OR REPLACE FUNCTION public.pode_enviar_sql(p_status text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_status text := lower(trim(coalesce(p_status, '')));
    v_valido bool;
    v_catch_all bool;
    v_arriscado bool;
BEGIN
    IF v_status = '' OR v_status IN ('nao_verificado', 'invalido', 'desconhecido') THEN
        RETURN false;
    END IF;

    SELECT coalesce((SELECT valor_bool FROM public.config_envio WHERE chave = 'aceitar_valido'), true) INTO v_valido;
    SELECT coalesce((SELECT valor_bool FROM public.config_envio WHERE chave = 'aceitar_catch_all'), false) INTO v_catch_all;
    SELECT coalesce((SELECT valor_bool FROM public.config_envio WHERE chave = 'aceitar_arriscado'), false) INTO v_arriscado;

    IF v_status = 'valido' AND v_valido THEN
        RETURN true;
    ELSIF v_status = 'catch_all' AND v_catch_all THEN
        RETURN true;
    ELSIF v_status = 'arriscado' AND v_arriscado THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- Função principal de cálculo e atribuição de score
CREATE OR REPLACE FUNCTION public.calcular_score(p_escola_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escola RECORD;
    v_score int := 0;
    v_criterios jsonb := '[]'::jsonb;
    v_novo_status text;

    -- Variáveis de pesos da config_score
    v_em_faixa1_min numeric;
    v_em_faixa1_pts numeric;
    v_em_faixa2_min numeric;
    v_em_faixa2_pts numeric;
    v_em_faixa3_min numeric;
    v_em_faixa3_pts numeric;
    v_pts_decisor_email numeric;
    v_pts_mantenedor_email numeric;
    v_pts_decisor_sem_email numeric;
    v_pts_email_inst numeric;
    v_pts_email_generico numeric;
    v_pts_rede numeric;
    v_pts_site numeric;
    v_pts_google numeric;
    v_google_nota_min numeric;
    v_google_avaliacoes_min numeric;
    v_pts_telefone numeric;
    v_pts_regiao numeric;
    v_regiao_uf text;
    v_score_minimo numeric;

    -- Flags e contagens auxiliares
    v_tem_decisor_em_email bool := false;
    v_tem_mantenedor_email bool := false;
    v_tem_qualquer_decisor bool := false;
    v_email_geral_liberado bool := false;
    v_dom_email_geral text := '';
    v_eh_generico_geral bool := false;
    v_qtd_emails_liberados int := 0;
    v_qtd_emails_genericos int := 0;
    v_tem_email_liberado bool := false;
    v_dom text;
    r_c RECORD;
BEGIN
    SELECT * INTO v_escola FROM public.escolas WHERE id = p_escola_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Carrega pesos da tabela config_score (com defaults de segurança)
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'em_faixa1_min'), 40) INTO v_em_faixa1_min;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'em_faixa1_pts'), 10) INTO v_em_faixa1_pts;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'em_faixa2_min'), 100) INTO v_em_faixa2_min;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'em_faixa2_pts'), 20) INTO v_em_faixa2_pts;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'em_faixa3_min'), 200) INTO v_em_faixa3_min;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'em_faixa3_pts'), 30) INTO v_em_faixa3_pts;

    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'decisor_em_ou_diretor_email_valido'), 30) INTO v_pts_decisor_email;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'mantenedor_email_valido'), 20) INTO v_pts_mantenedor_email;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'decisor_sem_email'), 8) INTO v_pts_decisor_sem_email;

    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'email_institucional_dominio_proprio'), 10) INTO v_pts_email_inst;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'email_so_generico'), -5) INTO v_pts_email_generico;

    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'rede'), 10) INTO v_pts_rede;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'site'), 5) INTO v_pts_site;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'google_bom'), 5) INTO v_pts_google;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'google_nota_min'), 4.3) INTO v_google_nota_min;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'google_avaliacoes_min'), 50) INTO v_google_avaliacoes_min;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'telefone'), 5) INTO v_pts_telefone;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'regiao_prioritaria'), 5) INTO v_pts_regiao;
    SELECT coalesce((SELECT valor_texto FROM public.config_score WHERE chave = 'regiao_prioritaria_uf'), 'DF') INTO v_regiao_uf;
    SELECT coalesce((SELECT valor FROM public.config_score WHERE chave = 'score_minimo_qualificado'), 60) INTO v_score_minimo;

    -- 1. Faixa de Matrículas no Ensino Médio (aplica só a maior faixa atingida)
    IF coalesce(v_escola.matriculas_em, 0) >= v_em_faixa3_min THEN
        v_score := v_score + v_em_faixa3_pts::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Matrículas EM (Faixa 3)',
            'pontos', v_em_faixa3_pts,
            'motivo', format('Possui %s matrículas no Ensino Médio (>= %s)', v_escola.matriculas_em, v_em_faixa3_min)
        );
    ELSIF coalesce(v_escola.matriculas_em, 0) >= v_em_faixa2_min THEN
        v_score := v_score + v_em_faixa2_pts::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Matrículas EM (Faixa 2)',
            'pontos', v_em_faixa2_pts,
            'motivo', format('Possui %s matrículas no Ensino Médio (>= %s)', v_escola.matriculas_em, v_em_faixa2_min)
        );
    ELSIF coalesce(v_escola.matriculas_em, 0) >= v_em_faixa1_min THEN
        v_score := v_score + v_em_faixa1_pts::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Matrículas EM (Faixa 1)',
            'pontos', v_em_faixa1_pts,
            'motivo', format('Possui %s matrículas no Ensino Médio (>= %s)', v_escola.matriculas_em, v_em_faixa1_min)
        );
    END IF;

    -- 2. Decisor (aplica só o maior entre os três itens)
    SELECT EXISTS (
        SELECT 1 FROM public.contatos
        WHERE escola_id = p_escola_id
          AND descadastrado = false
          AND tipo IN ('coordenador_em', 'diretor_geral', 'diretor_pedagogico')
          AND email IS NOT NULL
          AND public.pode_enviar_sql(email_status)
    ) INTO v_tem_decisor_em_email;

    SELECT EXISTS (
        SELECT 1 FROM public.contatos
        WHERE escola_id = p_escola_id
          AND descadastrado = false
          AND tipo = 'mantenedor'
          AND email IS NOT NULL
          AND public.pode_enviar_sql(email_status)
    ) INTO v_tem_mantenedor_email;

    SELECT EXISTS (
        SELECT 1 FROM public.contatos
        WHERE escola_id = p_escola_id
          AND descadastrado = false
          AND (nome IS NOT NULL OR cargo IS NOT NULL)
    ) INTO v_tem_qualquer_decisor;

    IF v_tem_decisor_em_email THEN
        v_score := v_score + v_pts_decisor_email::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Decisor Pedagógico/Geral com E-mail',
            'pontos', v_pts_decisor_email,
            'motivo', 'Coordenador do EM ou Diretor identificado com e-mail verificado'
        );
    ELSIF v_tem_mantenedor_email THEN
        v_score := v_score + v_pts_mantenedor_email::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Mantenedor com E-mail',
            'pontos', v_pts_mantenedor_email,
            'motivo', 'Sócio / Mantenedor identificado com e-mail verificado'
        );
    ELSIF v_tem_qualquer_decisor THEN
        v_score := v_score + v_pts_decisor_sem_email::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Decisor sem E-mail',
            'pontos', v_pts_decisor_sem_email,
            'motivo', 'Decisor mapeado (nome/cargo), porém sem e-mail direto verificado'
        );
    END IF;

    -- 3. E-mail Institucional Geral em Domínio Próprio
    v_email_geral_liberado := (v_escola.email_geral IS NOT NULL AND public.pode_enviar_sql(v_escola.email_geral_status));
    IF v_email_geral_liberado THEN
        v_dom_email_geral := lower(split_part(v_escola.email_geral, '@', 2));
        v_eh_generico_geral := v_dom_email_geral IN (
            'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
            'bol.com.br', 'uol.com.br', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com'
        );

        IF (v_escola.dominio IS NOT NULL AND v_dom_email_geral = lower(v_escola.dominio))
           OR NOT v_eh_generico_geral THEN
            v_score := v_score + v_pts_email_inst::int;
            v_criterios := v_criterios || jsonb_build_object(
                'criterio', 'E-mail Geral em Domínio Próprio',
                'pontos', v_pts_email_inst,
                'motivo', format('E-mail institucional (@%s) liberado em domínio próprio', v_dom_email_geral)
            );
        END IF;
    END IF;

    -- 4. Contabilização de E-mails e Penalidade de Só Genéricos
    FOR r_c IN (
        SELECT email FROM public.contatos
        WHERE escola_id = p_escola_id
          AND descadastrado = false
          AND email IS NOT NULL
          AND public.pode_enviar_sql(email_status)
    ) LOOP
        v_qtd_emails_liberados := v_qtd_emails_liberados + 1;
        v_dom := lower(split_part(r_c.email, '@', 2));
        IF v_dom IN ('gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'bol.com.br', 'uol.com.br', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com') THEN
            v_qtd_emails_genericos := v_qtd_emails_genericos + 1;
        END IF;
    END LOOP;

    IF v_email_geral_liberado THEN
        v_qtd_emails_liberados := v_qtd_emails_liberados + 1;
        IF v_eh_generico_geral THEN
            v_qtd_emails_genericos := v_qtd_emails_genericos + 1;
        END IF;
    END IF;

    v_tem_email_liberado := (v_qtd_emails_liberados > 0);

    IF v_qtd_emails_liberados > 0 AND v_qtd_emails_liberados = v_qtd_emails_genericos THEN
        v_score := v_score + v_pts_email_generico::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'E-mails Exclusivamente Genéricos',
            'pontos', v_pts_email_generico,
            'motivo', 'Todos os e-mails liberados da escola são de provedores genéricos'
        );
    END IF;

    -- 5. Pertence a Rede Educacional
    IF v_escola.score_detalhes IS NOT NULL
       AND v_escola.score_detalhes ? 'rede'
       AND v_escola.score_detalhes->'rede' IS NOT NULL
       AND v_escola.score_detalhes->'rede' <> 'null'::jsonb
       AND v_escola.score_detalhes->'rede' <> 'false'::jsonb THEN
        v_score := v_score + v_pts_rede::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Rede Educacional',
            'pontos', v_pts_rede,
            'motivo', 'Escola pertencente a rede/grupo de ensino'
        );
    END IF;

    -- 6. Site Oficial Verificado
    IF v_escola.site IS NOT NULL AND length(trim(v_escola.site)) > 0 THEN
        v_score := v_score + v_pts_site::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Website Institucional',
            'pontos', v_pts_site,
            'motivo', format('Website verificado: %s', v_escola.site)
        );
    END IF;

    -- 7. Reputação no Google
    IF coalesce(v_escola.google_rating, 0) >= v_google_nota_min
       AND coalesce(v_escola.google_avaliacoes, 0) >= v_google_avaliacoes_min THEN
        v_score := v_score + v_pts_google::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Avaliação Google Elevada',
            'pontos', v_pts_google,
            'motivo', format('Google Rating %s com %s avaliações (>= %s e %s)',
                v_escola.google_rating, v_escola.google_avaliacoes, v_google_nota_min, v_google_avaliacoes_min)
        );
    END IF;

    -- 8. Telefone
    IF v_escola.telefone IS NOT NULL AND length(trim(v_escola.telefone)) > 0 THEN
        v_score := v_score + v_pts_telefone::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Telefone de Contato',
            'pontos', v_pts_telefone,
            'motivo', 'Telefone institucional disponível'
        );
    END IF;

    -- 9. Região Prioritária
    IF v_escola.uf = v_regiao_uf THEN
        v_score := v_score + v_pts_regiao::int;
        v_criterios := v_criterios || jsonb_build_object(
            'criterio', 'Região Prioritária',
            'pontos', v_pts_regiao,
            'motivo', format('Localizada na UF foco (%s)', v_regiao_uf)
        );
    END IF;

    -- Definição de status_qualificacao:
    -- 'descartado' nunca é alterado
    -- Se status_funil != 'novo', mantém o status_qualificacao (não rebaixa lead no funil)
    IF v_escola.status_qualificacao = 'descartado' THEN
        v_novo_status := 'descartado';
    ELSIF v_escola.status_funil != 'novo' THEN
        v_novo_status := v_escola.status_qualificacao;
    ELSE
        IF v_score >= v_score_minimo
           AND v_tem_email_liberado = true
           AND coalesce(v_escola.oferece_ensino_medio, true) = true THEN
            v_novo_status := 'qualificado';
        ELSE
            v_novo_status := 'enriquecido';
        END IF;
    END IF;

    -- Atualiza registro na tabela escolas com score e detalhamento critério a critério
    UPDATE public.escolas
    SET score = v_score,
        score_detalhes = jsonb_set(
            coalesce(score_detalhes, '{}'::jsonb),
            '{score}',
            jsonb_build_object(
                'total', v_score,
                'minimo_qualificacao', v_score_minimo,
                'tem_email_liberado', v_tem_email_liberado,
                'calculado_em', now(),
                'criterios', v_criterios
            )
        ),
        status_qualificacao = v_novo_status
    WHERE id = p_escola_id;
END;
$$;

-- Função auxiliar para recalcular o score de todas as escolas
CREATE OR REPLACE FUNCTION public.recalcular_todos_scores()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_total int := 0;
BEGIN
    FOR r IN (SELECT id FROM public.escolas) LOOP
        PERFORM public.calcular_score(r.id);
        v_total := v_total + 1;
    END LOOP;
    RETURN v_total;
END;
$$;

-- Triggers de Recálculo Automático
-- 1. Trigger após alterações em contatos
CREATE OR REPLACE FUNCTION public.trigger_contatos_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.calcular_score(OLD.escola_id);
    ELSE
        PERFORM public.calcular_score(NEW.escola_id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_contatos_score_change ON public.contatos;
CREATE TRIGGER trigger_contatos_score_change
    AFTER INSERT OR UPDATE OR DELETE ON public.contatos
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_contatos_score();

-- 2. Trigger após alterações em escolas (evitando recursão com pg_trigger_depth)
CREATE OR REPLACE FUNCTION public.trigger_escolas_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Evita recursão infinita quando calcular_score faz UPDATE em score/score_detalhes
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    PERFORM public.calcular_score(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_escolas_score_change ON public.escolas;
CREATE TRIGGER trigger_escolas_score_change
    AFTER UPDATE OF matriculas_em, site, google_rating, google_avaliacoes, telefone,
                    email_geral, email_geral_status, uf, oferece_ensino_medio
    ON public.escolas
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_escolas_score();

-- Executa recálculo inicial de todas as escolas
SELECT public.recalcular_todos_scores();
