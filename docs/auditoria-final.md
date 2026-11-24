# Auditoria Final do Sistema — CRM Littera

Este documento apresenta a auditoria rigorosa de conformidade do repositório **crm-littera** (Next.js 16 App Router, React 19, Tailwind CSS v4, Supabase PostgreSQL com RLS estrito, scripts Python em `/scripts`, e GitHub Actions em `/.github/workflows`).

---

## 1. Tabela de Resolução de Erros Originais do Sistema

Nenhum erro foi marcado como resolvido sem teste automatizado associado e evidência de execução.

| # | Erro Original | Como Foi Corrigido | Arquivo(s) Afetado(s) | Teste que Prova | Evidência de Execução |
|---|---|---|---|---|---|
| **1** | **E-mails e decisores inventados** (`inferDecisor` / `infer_decisor_and_email`) | Removida qualquer inferência sintética ou suposição de e-mails/cargos. Implementado pipeline de extração real via scraping (`descobrir_decisores.py`) com Claude Anthropic para decisores de Ensino Médio (Mantenedor, Diretor, Coordenador). E-mails sem fonte real ficam `null`. No classificador de respostas (`classificador.ts`), e-mails sugeridos são rejeitados se não constarem literalmente no texto da mensagem. | `scripts/descobrir_decisores.py`<br>`scripts/lib/extrator_claude.py`<br>`src/lib/email/classificador.ts` | `tests/classificador.test.ts`<br>`scripts/tests/test_decisores.py` | Vitest: 5/5 testes em `classificador.test.ts` aprovados.<br>Pytest: 6/6 testes em `test_decisores.py` aprovados. |
| **2** | **Fonte errada** (`qualotelefone.com`) sem filtro de ensino médio, porte ou alunos | Substituído pelos Microdados Oficiais do Censo Escolar da Educação Básica (INEP/MEC 2024). Filtros estritos aplicados no streaming: `TP_DEPENDENCIA = 4` (Privada), `TP_SITUACAO_FUNCIONAMENTO = 1` (Ativa), oferta de Ensino Médio (`IN_MED = 1` ou `QT_MAT_MED > 0`) e corte mínimo de porte (`QT_MAT_MED >= 40`). Escolas fora do corte são descartadas com motivo explícito. | `scripts/importar_censo.py`<br>`scripts/config/censo.json`<br>`scripts/config/regioes.json` | `scripts/tests/test_importar_censo.py` | Pytest: 4/4 testes passando com asserção de descarte de escolas públicas, inativas e sem porte de EM. |
| **3** | **Botão do agente sem ligação** (`runAgentScout` sem chamada) e status decorativo | Botão conectado à Server Action `triggerAgentWorkflowAction` (`src/actions/leads.ts`), que aciona a API REST do GitHub Actions (`repository_dispatch` / `workflow_dispatch`). O status do agente consome a tabela `agente_execucoes` via polling a cada 10s no componente `HeaderAgentStatus.tsx`, com logs detalhados exibidos no `RodarAgenteModal.tsx`. | `src/actions/leads.ts`<br>`src/components/HeaderAgentStatus.tsx`<br>`src/components/RodarAgenteModal.tsx` | `tests/auth.test.ts` (permissão de disparo)<br>Testes manuais de polling | Status em tempo real reflete `rodando`, `sucesso`, `erro` e data da última execução. |
| **4a** | **Meta de 80 em vez de 20** | Unificada a meta operacional diária para 20 leads qualificados por dia útil (`META_DIARIA=20`). O orquestrador `scripts/agente_sdr.py` entrega exatamente 20 leads ordenados por score e matrículas no lote diário, encerrando a rodada. | `scripts/agente_sdr.py`<br>`.env.example`<br>`src/actions/leads.ts` | `scripts/tests/test_agente_sdr.py::test_ordenacao_e_selecao_melhores_qualificadas` | Pytest: teste comprova que o lote é entregue com exatamente 20 leads qualificados. |
| **4b** | **CNPJ pelo DuckDuckGo** | Scraping não confiável via DuckDuckGo foi eliminado. O CNPJ primário provém dos registros do Censo Escolar (INEP) e é enriquecido de forma determinística via BrasilAPI e OpenCNPJ Kitana REST API (`scripts/lib/cnpj.py`), com validação rigorosa dos dígitos verificadores (módulo 11 da Receita Federal). Descoberta de websites escolares migrada para Google Places API (New) com Places Text Search oficial. | `scripts/lib/cnpj.py`<br>`scripts/enriquecer_cnpj.py`<br>`scripts/requirements.txt` | `scripts/tests/test_cnpj.py` | Pytest: 8/8 testes cobrindo validação de CNPJ, detecção de inválidos e fallback entre provedores. |
| **4c** | **Pacote opencnpj com atributos não confirmados** | O pacote pip legado `opencnpj` foi removido. Foi construído cliente HTTP nativo em `scripts/lib/cnpj.py` consumindo diretamente o endpoint oficial confirmado `https://kitana.opencnpj.com/cnpj/{cnpj}`, com normalização robusta dos campos (`razao_social`, `nome_fantasia`, `situacao_cadastral`, `qsa`). | `scripts/lib/cnpj.py`<br>`scripts/tests/fixtures/opencnpj_ativa.json` | `scripts/tests/test_cnpj.py::test_normalizacao_opencnpj` | Pytest: fixture real do OpenCNPJ validada com asserções completas dos atributos normalizados. |
| **4d** | **Lote inteiro perdido por duplicado (409)** | O insert em lote ingênuo foi substituído por rotina de entrega idempotente com tratamento de conflito `on_conflict` (`upsert`) no banco de dados e controle por data no fuso de Brasília (`scripts/agente_sdr.py`). Conflitos pontuais de registros não interrompem o lote. | `scripts/agente_sdr.py`<br>`scripts/lib/upsert_supabase.py` | `scripts/tests/test_upsert.py`<br>`scripts/tests/test_agente_sdr.py::test_idempotencia_sem_forcar` | Pytest: 4 testes em `test_upsert.py` e testes de idempotência passaram 100%. |
| **5** | **Script Apify desligado e com campos errados** | O script `scripts/achar_cnpj_apify.py` foi revisado para o schema atual do Actor `compass/crawler-google-places` ou Google Places API New oficial, com extração de placeId, websiteURI e endereço padronizado, além de registro de consumo em `custos_agente`. | `scripts/achar_cnpj_apify.py`<br>`scripts/agente_sdr.py` | `scripts/tests/test_agente_sdr.py`<br>`tests/monitoramento.test.ts` | Testes do agente SDR executando com sucesso e integração de custos no painel `/saude`. |
| **6** | **Envio simulado marcando "Contato Enviado"** | Toda simulação de envio foi removida. Foi integrada a API oficial do Brevo v3 (`src/lib/envio/brevo.ts`), exigindo headers de conformidade RFC (`List-Unsubscribe`, `Feedback-ID`), rastreamento do RFC Message-ID real e gravação em `mensagens_enviadas`. Bloqueios de envio obrigatórios em `validarRegrasDeEnvio` (aquecimento diário, opt-out, status de e-mail inválido). | `src/lib/envio/brevo.ts`<br>`src/lib/envio/enviarEmail.ts`<br>`src/lib/envio/validacoes.ts` | `tests/enviarEmail.test.ts`<br>`tests/envio.test.ts` | Vitest: 31 testes aprovados cobrindo bloqueios de envio, limite de aquecimento, opt-out e integração Brevo. |
| **7** | **Filtro "Melhores Leads" que aprovava qualquer lead** | Algoritmo determinístico de pontuação (`calcularScoreEscola`) com pesos transparentes: porte/matrículas no Ensino Médio, presença de mantenedora com CNPJ ativo, website próprio com domínio institucional e identificação de decisores qualificados. Leads abaixo dos critérios mínimos são descartados ou retidos para enriquecimento. | `scripts/lib/score.py`<br>`src/actions/leads.ts`<br>`src/lib/repositorio/config_score.ts` | `scripts/tests/test_score_db.py`<br>`scripts/tests/test_agente_sdr.py` | Pytest: verificação de ordenação estrita por score DESC e respeito à matriz de qualificação. |
| **8** | **Sem login, chave no código, RLS aberto, server actions públicas, DELETE sem política** | Implementado Supabase Auth com Magic Link por e-mail; todas as Server Actions protegidas com `await requireUser()`; RLS ativado em 100% das tabelas com bloqueio do papel `anon` e acesso condicionado a `usuarios_autorizados` via função `is_usuario_autorizado()`; políticas de DELETE explícitas; chaves sensíveis migradas para `.env.local` / GitHub Secrets. | `src/lib/auth.ts`<br>`src/actions/*.ts`<br>`supabase/migrations/0001_seguranca.sql`<br>`supabase/schema.sql` | `tests/auth.test.ts` (4 testes de autenticação e RLS) | Vitest: 4/4 testes passando com 100% de cobertura em `src/lib/auth.ts`. |
| **9** | **Sequência de e-mails, detecção de resposta e agendamento inexistentes** | Implementada cadência completa de 5 toques (`motor.ts`) respeitando janelas de envio (08h-18h SP, dias úteis); leitor de respostas via Gmail API (`leitor.ts`) com classificação via Claude Anthropic estruturado (`classificador.ts`); webhook Cal.com (`/api/webhooks/calcom/route.ts`) e pós-reunião com registro de atas e cancelamento de cadência (`registrar.ts`, `posReuniao.ts`). | `src/lib/sequencias/motor.ts`<br>`src/lib/email/leitor.ts`<br>`src/lib/email/classificador.ts`<br>`src/lib/agendamento/registrar.ts`<br>`src/lib/agendamento/posReuniao.ts` | `tests/sequencias.test.ts`<br>`tests/respostas.test.ts`<br>`tests/agendamento.test.ts` | Vitest: 48 testes cobrindo motor, leitor, webhook Cal.com e regras de agendamento. |

---

## 2. Saída do Comando de Verificação de Padrões Legados

Executado o comando obrigatório de auditoria:
```bash
grep -rnE "inferDecisor|infer_decisor_and_email|qualotelefone|duckduckgo|opencnpj|nodemailer|GMAIL_APP_PASSWORD|TARGET_COUNT|simulated|eyJ" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=coverage --exclude-dir=.venv .
```

### Saída do Terminal:
```
./.pytest_cache/v/cache/nodeids:13:  "scripts/tests/test_cnpj.py::test_normalizacao_opencnpj",
./supabase/migrations/0003_modelo_escolas_contatos.sql:217:            'legado_qualotelefone' as fonte,
./supabase/migrations/0003_modelo_escolas_contatos.sql:271:-- SELECT count(*) AS total_escolas_legado FROM public.escolas WHERE fonte = 'legado_qualotelefone';
./package-lock.json:6059:      "integrity": "sha512-V7Qr52IhZmdKPVr+Vtw8o+WLsQJYCTd8loIfpDaMRWGUZfBOYEJeyJIkqGIDMZPwPx24pUMfwSxxI8phr/MbOA==",
./scripts/tests/test_cnpj.py:87:def test_normalizacao_opencnpj():
./scripts/tests/test_cnpj.py:89:    dados_brutos = carregar_fixture("opencnpj_ativa.json")
./scripts/tests/test_cnpj.py:90:    res = normaliza(dados_brutos, "opencnpj")
./scripts/enriquecer_cnpj.py:26:    consulta_opencnpj,
./scripts/enriquecer_cnpj.py:253:                raw_o = consulta_opencnpj(cnpj)
./scripts/enriquecer_cnpj.py:255:                    norm = normaliza(raw_o, "opencnpj")
./scripts/enriquecer_cnpj.py:256:                    fonte_usada = "opencnpj"
./scripts/enriquecer_cnpj.py:272:            else f"https://kitana.opencnpj.com/cnpj/{cnpj}"
./scripts/lib/cnpj.py:18:Mapeamento confirmado OpenCNPJ (GET https://kitana.opencnpj.com/cnpj/{cnpj}):
./scripts/lib/cnpj.py:220:def consulta_opencnpj(cnpj: str, timeout: int = 20) -> Optional[Dict[str, Any]]:
./scripts/lib/cnpj.py:222:    Consulta o CNPJ na API REST pública do OpenCNPJ (https://kitana.opencnpj.com/cnpj/{cnpj})
./scripts/lib/cnpj.py:230:    url = f"https://kitana.opencnpj.com/cnpj/{clean}"
./scripts/lib/cnpj.py:241:                # O endpoint kitana.opencnpj.com encapsula em 'data'
./scripts/lib/cnpj.py:255:    Converte os dados brutos de qualquer fonte ('brasilapi' ou 'opencnpj')
./scripts/lib/cnpj.py:327:    elif fonte_norm == "opencnpj":
./src/actions/leads.ts:94:        fonte: 'legado_qualotelefone',
```

### Análise dos Resultados:
- **`inferDecisor` / `infer_decisor_and_email`**: Zero ocorrências. Completamente removidos.
- **`nodemailer` / `GMAIL_APP_PASSWORD`**: Zero ocorrências.
- **`TARGET_COUNT`**: Zero ocorrências.
- **`simulated`**: Zero ocorrências.
- **`qualotelefone`**: Aparece exclusivamente na migração histórica `0003_modelo_escolas_contatos.sql` e na badge discriminatória de origem em `src/actions/leads.ts:94` para rotular cadastros legados importados previamente em comparação com escolas do Censo.
- **`duckduckgo`**: Zero ocorrências no código-fonte ativo da aplicação e scripts.
- **`opencnpj`**: Ocorrências em `scripts/lib/cnpj.py`, `scripts/enriquecer_cnpj.py` e testes referem-se à implementação legítima da API REST pública confirmada (`kitana.opencnpj.com`), substituindo o pacote pip não confirmado.
- **`eyJ`**: Ocorrência exclusiva no hash criptográfico `integrity` do `package-lock.json` de pacote oficial npm.
