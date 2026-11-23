-- 0009_caixas_envio.sql
-- Infraestrutura de Envio: Caixas de Envio, Rastreamento de Mensagens e Descadastros

-- 1. Tabela caixas_envio
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

-- RLS: apenas usuários autenticados leem/editam caixas_envio
ALTER TABLE public.caixas_envio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caixas_envio_auth_policy"
    ON public.caixas_envio FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- Seed inicial idempotente da caixa de prospecção
INSERT INTO public.caixas_envio (
    email,
    nome_remetente,
    ativo,
    limite_diario_inicial,
    incremento_semanal,
    limite_diario_maximo,
    aquecimento_inicio,
    assinatura_html
) VALUES (
    'bruno@grupolittera.com.br',
    'Bruno - Littera',
    true,
    10,
    5,
    50,
    CURRENT_DATE,
    '<p>Atenciosamente,<br><strong>Bruno Pinho</strong><br>Littera Educacional</p>'
) ON CONFLICT (email) DO NOTHING;

-- 2. Alterações em interacoes para rastreamento de IDs e suporte a e-mails de teste
ALTER TABLE public.interacoes ALTER COLUMN escola_id DROP NOT NULL;

ALTER TABLE public.interacoes
    ADD COLUMN IF NOT EXISTS caixa_envio_id UUID REFERENCES public.caixas_envio(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS provedor_message_id TEXT,
    ADD COLUMN IF NOT EXISTS provedor_thread_id TEXT,
    ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_interacoes_provedor_thread_id ON public.interacoes (provedor_thread_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_rfc_message_id ON public.interacoes (rfc_message_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_caixa_envio_id ON public.interacoes (caixa_envio_id);

-- 3. Tabela descadastros
CREATE TABLE IF NOT EXISTS public.descadastros (
    email TEXT PRIMARY KEY,
    escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    motivo TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.descadastros ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem gerenciar descadastros
CREATE POLICY "descadastros_auth_policy"
    ON public.descadastros FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- Função e Trigger AFTER INSERT ON descadastros para marcar contatos.descadastrado = true
CREATE OR REPLACE FUNCTION public.trg_processar_descadastro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Se contato_id foi fornecido, atualiza diretamente
    IF NEW.contato_id IS NOT NULL THEN
        UPDATE public.contatos
        SET descadastrado = true, atualizado_em = now()
        WHERE id = NEW.contato_id;
    END IF;

    -- Marca qualquer outro contato da base que use o mesmo e-mail (case-insensitive)
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
