-- ==============================================================================
-- ETAPA 10: CONFIGURAÇÃO DE AGENDAMENTO AUTOMÁTICO (CRON)
-- pg_cron + pg_net para disparo de sequências a cada 10 minutos em dias úteis
-- ==============================================================================

-- 1. Habilitar extensões necessárias no Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Configuração de Secrets no Supabase Vault (Recomendado)
-- No dashboard do Supabase (Project Settings -> Vault), crie os seguintes segredos:
-- chave: 'app_url'      -> valor: 'https://seu-dominio-crm.vercel.app' (ou http://host.docker.internal:3000 em dev)
-- chave: 'cron_secret'  -> valor: 'sua-chave-secreta-configurada-no-env'
--
-- Exemplo de inserção via SQL caso utilize a tabela vault.decrypted_secrets:
/*
SELECT vault.create_secret('https://seu-crm.vercel.app', 'app_url');
SELECT vault.create_secret('sua_chave_cron_ultra_secreta_aqui', 'cron_secret');
*/

-- 3. Função Wrapper para Invocar a Rota /api/cron/sequencias via pg_net
CREATE OR REPLACE FUNCTION public.chamar_cron_sequencias()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_request_id BIGINT;
BEGIN
    -- Tenta recuperar as credenciais do Supabase Vault
    BEGIN
        SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'app_url' LIMIT 1;
        SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_url := NULL;
        v_secret := NULL;
    END;

    -- Se não estiver no Vault, utiliza fallback da tabela config_envio se existir
    IF v_url IS NULL THEN
        SELECT valor_texto INTO v_url FROM public.config_envio WHERE chave = 'app_url' LIMIT 1;
    END IF;
    IF v_secret IS NULL THEN
        SELECT valor_texto INTO v_secret FROM public.config_envio WHERE chave = 'cron_secret' LIMIT 1;
    END IF;

    -- Se configurado, dispara via pg_net POST
    IF v_url IS NOT NULL AND v_secret IS NOT NULL THEN
        SELECT net.http_post(
            url := v_url || '/api/cron/sequencias',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_secret
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 30000
        ) INTO v_request_id;
    ELSE
        RAISE NOTICE 'Cron sequências não executado: app_url ou cron_secret não configurados.';
    END IF;
END;
$$;

-- 4. Agendamento com pg_cron
-- Roda a cada 10 minutos, de segunda a sexta-feira: '*/10 * * * 1-5'
-- Primeiro remove qualquer agendamento anterior para evitar duplicidade
SELECT cron.unschedule('motor_sequencias_littera') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'motor_sequencias_littera'
);

SELECT cron.schedule(
    'motor_sequencias_littera',
    '*/10 * * * 1-5',
    'SELECT public.chamar_cron_sequencias();'
);

-- ==============================================================================
-- ALTERNATIVA VERCEL CRON (vercel.json):
-- Caso seu app esteja hospedado na Vercel Pro, você também pode adicionar ao vercel.json:
-- {
--   "crons": [
--     {
--       "path": "/api/cron/sequencias",
--       "schedule": "*/10 * * * 1-5"
--     }
--   ]
-- }
-- Nesse caso, a Vercel envia o header Authorization: Bearer <CRON_SECRET> automaticamente.
-- ==============================================================================
