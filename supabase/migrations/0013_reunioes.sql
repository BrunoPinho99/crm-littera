-- 0013_reunioes.sql
-- ETAPA 12: AGENDAMENTO AUTOMÁTICO DE REUNIÕES, PÓS-REUNIÃO E ENCERRAMENTO DA SEQUÊNCIA

-- 1. Criação da tabela reunioes
CREATE TABLE IF NOT EXISTS public.reunioes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
    contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    inscricao_id UUID REFERENCES public.inscricoes(id) ON DELETE SET NULL,
    provedor TEXT NOT NULL CHECK (provedor IN ('calcom', 'google', 'manual')),
    provedor_evento_id TEXT UNIQUE,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    link_reuniao TEXT,
    status TEXT NOT NULL CHECK (status IN ('agendada', 'remarcada', 'cancelada', 'realizada', 'nao_compareceu')),
    resultado TEXT CHECK (resultado IS NULL OR resultado IN ('proposta_enviada', 'teste_gratuito', 'fechado', 'sem_fit', 'followup')),
    notas TEXT,
    pendente_registro BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices essenciais para consultas do CRM e rotinas do Cron
CREATE INDEX IF NOT EXISTS idx_reunioes_escola_id ON public.reunioes (escola_id);
CREATE INDEX IF NOT EXISTS idx_reunioes_contato_id ON public.reunioes (contato_id);
CREATE INDEX IF NOT EXISTS idx_reunioes_status ON public.reunioes (status);
CREATE INDEX IF NOT EXISTS idx_reunioes_inicio ON public.reunioes (inicio);
CREATE INDEX IF NOT EXISTS idx_reunioes_pendente ON public.reunioes (pendente_registro);
CREATE INDEX IF NOT EXISTS idx_reunioes_provedor_evento_id ON public.reunioes (provedor_evento_id);

-- Habilita RLS na tabela de reuniões
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reunioes_auth_policy"
    ON public.reunioes FOR ALL TO authenticated
    USING (public.is_usuario_autorizado())
    WITH CHECK (public.is_usuario_autorizado());

-- Trigger para atualização automática de atualizado_em
DROP TRIGGER IF EXISTS trg_reunioes_atualizado_em ON public.reunioes;
CREATE TRIGGER trg_reunioes_atualizado_em
    BEFORE UPDATE ON public.reunioes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_atualizado_em();

-- 2. Permitir escola_id nulo na tabela lembretes para alertas globais (ex: Reunião de origem desconhecida)
ALTER TABLE public.lembretes ALTER COLUMN escola_id DROP NOT NULL;
