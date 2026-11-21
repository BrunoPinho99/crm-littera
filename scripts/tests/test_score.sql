-- scripts/tests/test_score.sql
-- Testes de validação das regras de negócio do Score e Qualificação Automática
-- Pode ser executado diretamente no SQL Editor do Supabase ou via runner automatizado.

DO $$
DECLARE
    v_escola1_id uuid;
    v_escola2_id uuid;
    v_escola3_id uuid;
    v_escola4_id uuid;
    v_res RECORD;
    v_criterio RECORD;
    v_peso_original numeric;
BEGIN
    RAISE NOTICE '=== INICIANDO TESTES DO MOTOR DE SCORE ===';

    -- -------------------------------------------------------------------------
    -- CASO 1: Escola grande com coordenador de EM com e-mail válido -> QUALIFICADA
    -- -------------------------------------------------------------------------
    INSERT INTO public.escolas (
        nome, cidade, uf, matriculas_em, site, telefone, status_qualificacao, status_funil, oferece_ensino_medio
    ) VALUES (
        'Escola Teste 1 Grande Qualificada', 'Brasília', 'DF', 250, 'https://escola1.com.br', '(61) 3333-1111',
        'bruto', 'novo', true
    ) RETURNING id INTO v_escola1_id;

    INSERT INTO public.contatos (
        escola_id, nome, cargo, tipo, email, email_status, principal, fonte
    ) VALUES (
        v_escola1_id, 'Professora Ana', 'Coordenadora do EM', 'coordenador_em',
        'ana@escola1.com.br', 'valido', true, 'site'
    );

    PERFORM public.calcular_score(v_escola1_id);
    SELECT score, status_qualificacao INTO v_res FROM public.escolas WHERE id = v_escola1_id;

    IF v_res.score < 60 OR v_res.status_qualificacao <> 'qualificado' THEN
        RAISE EXCEPTION 'FALHA NO CASO 1: Esperado score >= 60 e qualificado, obtido score=% status=%',
            v_res.score, v_res.status_qualificacao;
    END IF;
    RAISE NOTICE '✓ CASO 1 OK: Escola grande com coordenador válido qualificada (Score: %)', v_res.score;

    -- -------------------------------------------------------------------------
    -- CASO 2: Escola sem nenhum e-mail liberado -> NÃO QUALIFICADA mesmo com score alto
    -- -------------------------------------------------------------------------
    INSERT INTO public.escolas (
        nome, cidade, uf, matriculas_em, site, telefone, score_detalhes, status_qualificacao, status_funil, oferece_ensino_medio
    ) VALUES (
        'Escola Teste 2 Sem Email', 'Brasília', 'DF', 250, 'https://escola2.com.br', '(61) 3333-2222',
        jsonb_build_object('rede', true), 'bruto', 'novo', true
    ) RETURNING id INTO v_escola2_id;

    -- Contato sem e-mail ou com e-mail inválido
    INSERT INTO public.contatos (
        escola_id, nome, cargo, tipo, email, email_status, principal, fonte
    ) VALUES (
        v_escola2_id, 'Diretor Roberto', 'Diretor Geral', 'diretor_geral',
        'roberto@invalido.com', 'invalido', true, 'site'
    );

    PERFORM public.calcular_score(v_escola2_id);
    SELECT score, status_qualificacao INTO v_res FROM public.escolas WHERE id = v_escola2_id;

    -- Faixa 3 (30) + Decisor sem email (8) + Rede (10) + Site (5) + Telefone (5) + DF (5) = 63 pts
    IF v_res.score < 60 OR v_res.status_qualificacao = 'qualificado' THEN
        RAISE EXCEPTION 'FALHA NO CASO 2: Deveria ter score >= 60 mas status NÃO qualificado por falta de e-mail. Obtido score=% status=%',
            v_res.score, v_res.status_qualificacao;
    END IF;
    RAISE NOTICE '✓ CASO 2 OK: Escola sem e-mail não foi qualificada mesmo com score alto (Score: %, Status: %)',
        v_res.score, v_res.status_qualificacao;

    -- -------------------------------------------------------------------------
    -- CASO 3: Só e-mails genéricos aplica -5 pontos
    -- -------------------------------------------------------------------------
    INSERT INTO public.escolas (
        nome, cidade, uf, matriculas_em, site, telefone, status_qualificacao, status_funil, oferece_ensino_medio
    ) VALUES (
        'Escola Teste 3 Só Gmail', 'Brasília', 'DF', 50, NULL, '(61) 3333-3333',
        'bruto', 'novo', true
    ) RETURNING id INTO v_escola3_id;

    INSERT INTO public.contatos (
        escola_id, nome, cargo, tipo, email, email_status, principal, fonte
    ) VALUES (
        v_escola3_id, 'Secretaria Geral', 'Secretária', 'secretaria',
        'escola3teste@gmail.com', 'valido', true, 'manual'
    );

    PERFORM public.calcular_score(v_escola3_id);
    SELECT score, score_detalhes INTO v_res FROM public.escolas WHERE id = v_escola3_id;

    -- Faixa 1 (10) + Decisor sem email/outro (8) + Telefone (5) + DF (5) - Penalidade Genérico (-5) = 23 pts
    -- Verifica se o critério email_so_generico com -5 consta nos score_detalhes
    IF NOT (v_res.score_detalhes->'score'->'criterios' @> '[{"criterio": "E-mails Exclusivamente Genéricos"}]'::jsonb) THEN
        RAISE EXCEPTION 'FALHA NO CASO 3: Penalidade de e-mail exclusivamente genérico não foi aplicada. Detalhes: %',
            v_res.score_detalhes;
    END IF;
    RAISE NOTICE '✓ CASO 3 OK: Penalidade de -5 para e-mails puramente genéricos aplicada (Score: %)', v_res.score;

    -- -------------------------------------------------------------------------
    -- CASO 4: Mudança de peso na config_score altera o score
    -- -------------------------------------------------------------------------
    SELECT valor INTO v_peso_original FROM public.config_score WHERE chave = 'decisor_em_ou_diretor_email_valido';

    -- Aumenta peso de 30 para 40
    UPDATE public.config_score SET valor = 40 WHERE chave = 'decisor_em_ou_diretor_email_valido';
    PERFORM public.calcular_score(v_escola1_id);
    SELECT score INTO v_res FROM public.escolas WHERE id = v_escola1_id;

    IF v_res.score <> 85 THEN
        -- Restaura peso antes de falhar
        UPDATE public.config_score SET valor = v_peso_original WHERE chave = 'decisor_em_ou_diretor_email_valido';
        RAISE EXCEPTION 'FALHA NO CASO 4: Mudança de peso não refletiu no cálculo. Esperado score 85, obtido %', v_res.score;
    END IF;

    -- Restaura peso original
    UPDATE public.config_score SET valor = v_peso_original WHERE chave = 'decisor_em_ou_diretor_email_valido';
    PERFORM public.calcular_score(v_escola1_id);
    RAISE NOTICE '✓ CASO 4 OK: Mudança dinâmica de peso na config_score alterou o cálculo com sucesso';

    -- -------------------------------------------------------------------------
    -- CASO 5: Escola já no funil (status_funil != novo) NUNCA é rebaixada
    -- -------------------------------------------------------------------------
    INSERT INTO public.escolas (
        nome, cidade, uf, matriculas_em, site, telefone, status_qualificacao, status_funil, oferece_ensino_medio
    ) VALUES (
        'Escola Teste 5 Já No Funil', 'Brasília', 'DF', 10, NULL, NULL,
        'qualificado', 'contato_enviado', true
    ) RETURNING id INTO v_escola4_id;

    PERFORM public.calcular_score(v_escola4_id);
    SELECT score, status_qualificacao INTO v_res FROM public.escolas WHERE id = v_escola4_id;

    IF v_res.status_qualificacao <> 'qualificado' THEN
        RAISE EXCEPTION 'FALHA NO CASO 5: Escola que já estava no funil foi indevidamente rebaixada para %',
            v_res.status_qualificacao;
    END IF;
    RAISE NOTICE '✓ CASO 5 OK: Escola em status_funil "contato_enviado" manteve status_qualificacao "qualificado"';

    -- -------------------------------------------------------------------------
    -- LIMPEZA DOS REGISTROS DE TESTE
    -- -------------------------------------------------------------------------
    DELETE FROM public.escolas WHERE id IN (v_escola1_id, v_escola2_id, v_escola3_id, v_escola4_id);
    RAISE NOTICE '=== TODOS OS TESTES DE SCORE FORAM CONCLUÍDOS COM SUCESSO! ===';
END $$;
