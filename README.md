# CRM Littera — Prospecção Escolar B2B

Sistema de prospecção autônoma de escolas particulares que oferecem Ensino Médio no Distrito Federal e Entorno (RIDE-DF). O CRM integra um Agente SDR autônomo (Censo Escolar INEP + Enriquecimento Cadastral + Claude Anthropic), entrega 20 leads qualificados por dia útil, conduz sequências multitoque de e-mails via Brevo, detecta respostas com Gmail API e automatiza o agendamento de reuniões com o Cal.com.

---

## 1. Arquitetura Atual & Fluxo de Prospecção

O funil opera de ponta a ponta sem dados inventados, com checagem estrita de fontes reais e registros em todas as etapas:

```mermaid
flowchart TD
    A["1. Censo Escolar INEP (Microdados 2024)"] -->|Filtros: Privada, Ativa, Ensino Médio, Porte >= 40| B["Tabela escolas (Pendentes)"]
    B --> C["2. Enriquecimento CNPJ (BrasilAPI / OpenCNPJ)"]
    C --> D["3. Descoberta de Site (Google Places API New)"]
    D --> E["4. Scraping & Decisores (BeautifulSoup + Claude Anthropic)"]
    E -->|Mantenedor, Diretor, Coordenador de EM| F["5. Verificação de E-mails (ZeroBounce / Hunter)"]
    F -->|Validação de elegibilidade (pode_enviar)| G["6. Matriz de Qualificação & Score (0 a 100)"]
    G --> H["7. Lote Diário (20 leads qualificados)"]
    H --> I["8. Motor de Sequências (Cadência 5 toques via Brevo)"]
    I --> J{"9. Leitor de Respostas (Gmail API a cada 10 min)"}
    J -->|Interesse / Dúvida| K["Classificador Claude Anthropic"]
    J -->|Bounce / Descadastro| L["Desativação de Contato & Pausa de Cadência"]
    K -->|Link ou Proposta de Reunião| M["10. Reunião Agendada (Cal.com Webhook)"]
    M --> N["Pós-Reunião & Ata (Cancelamento de Cadência)"]
```

### Componentes do Sistema:
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons.
- **Segurança & Auth**: Supabase Auth (Magic Link por e-mail), `@supabase/ssr` com cookies de sessão, controle de acesso estrito em `usuarios_autorizados` e RLS habilitado em 100% das tabelas públicas com função `is_usuario_autorizado()`.
- **Agente SDR Diário (Python)**: Scripts em `/scripts` orquestrados via GitHub Actions (`leadbot.yml`) ou disparo manual no painel.
- **Motor de Sequências & Rotinas (Next.js)**: Endpoint `/api/cron/sequencias` acionado a cada 10 minutos pelo Supabase `pg_cron`, executando de forma isolada:
  1. Leitor de Respostas (Gmail API).
  2. Agenda & Pós-Reunião.
  3. Proteção Automática de Reputação (desativa caixas se bounce > 3% em 7 dias).
  4. Motor de Disparo de E-mails (Brevo API v3).
  5. Verificação e Envio de Alertas do Sistema para `NOTIFICAR_EMAIL`.
- **Monitoramento & Saúde**: Página protegida `/saude` com status em tempo real das rotinas, funil semanal, entregabilidade por caixa e custos diários em 30 dias.

---

## 2. Lista Completa de Variáveis de Ambiente

As credenciais do sistema são divididas estritamente de acordo com sua camada de execução:

| Nome da Variável | Descrição | Onde Vive (Ambiente) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL da instância do Supabase | Vercel (All) / `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (`anon`) do Supabase | Vercel (All) / `.env.local` |
| `SUPABASE_URL` | URL interna do Supabase para rotinas server e scripts | Vercel / GitHub Secrets / `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave mestra de serviço com bypass de RLS | Vercel / GitHub Secrets / `.env.local` |
| `BREVO_API_KEY` | Chave de API v3 do Brevo para disparos de e-mail | Vercel / Supabase Vault / `.env.local` |
| `UNSUBSCRIBE_SECRET` | Chave de 32 bytes para assinatura HMAC-SHA256 de descadastro | Vercel / `.env.local` |
| `APP_URL` | URL base da aplicação (ex: `https://littera.app.br`) | Vercel / GitHub Secrets / `.env.local` |
| `LITTERA_RAZAO_SOCIAL` | Razão social obrigatória nos rodapés de e-mail | Vercel / `.env.local` |
| `LITTERA_ENDERECO` | Endereço físico institucional obrigatório | Vercel / `.env.local` |
| `CRON_SECRET` | Token Bearer para autenticar requisições em `/api/cron/sequencias` | Vercel / Supabase `pg_cron` / `.env.local` |
| `NOTIFICAR_EMAIL` | E-mail do gestor para alertas críticos e respostas de leads | Vercel / GitHub Secrets / `.env.local` |
| `GOOGLE_PLACES_API_KEY` | Chave Google Cloud para busca de websites escolares | GitHub Secrets / `.env.local` |
| `ANTHROPIC_API_KEY` | Chave Anthropic para Claude 3.5 Haiku (decisores e respostas) | Vercel / GitHub Secrets / `.env.local` |
| `ANTHROPIC_MODEL` | Modelo Claude a utilizar (`claude-3-5-haiku-latest`) | Vercel / GitHub Secrets / `.env.local` |
| `EMAIL_VERIFIER` | Provedor de verificação (`zerobounce` ou `millionverifier`) | GitHub Secrets / `.env.local` |
| `EMAIL_VERIFIER_API_KEY` | Chave do provedor de verificação de entregabilidade | GitHub Secrets / `.env.local` |
| `HUNTER_API_KEY` | Chave Hunter.io para busca de e-mails em domínios escolares | GitHub Secrets / `.env.local` |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID do Google Cloud para leitura de respostas (Gmail API) | Vercel / Supabase Vault / `.env.local` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret do Google OAuth | Vercel / Supabase Vault / `.env.local` |
| `TOKEN_ENCRYPTION_KEY` | Chave AES de 32 bytes (base64) para criptografia de tokens OAuth | Vercel / Supabase Vault / `.env.local` |
| `CALCOM_WEBHOOK_SECRET` | Segredo para validação de assinaturas de webhook do Cal.com | Vercel / `.env.local` |
| `CALCOM_EVENT_URL` | URL pública da página de agendamento do Cal.com | Vercel / `.env.local` |
| `META_DIARIA` | Meta diária de leads qualificados (padrão: 20) | Vercel / GitHub Secrets / `.env.local` |
| `MAX_CUSTO_DIARIO_USD` | Teto orçamentário diário do agente em USD (padrão: 5.0) | GitHub Secrets / `.env.local` |
| `GITHUB_DISPATCH_TOKEN` | Token GitHub com permissão `actions:write` para botão manual | Vercel / `.env.local` |
| `GITHUB_REPO` | Repositório no GitHub (ex: `BrunoPinho99/crm-littera`) | Vercel / `.env.local` |

---

## 3. Como Rodar Localmente

### Pré-requisitos:
- Node.js 22+
- Python 3.12+ com ambiente virtual (`.venv`)

### 1. Clonar e Instalar Dependências

```bash
# Dependências do Next.js
npm install

# Ambiente virtual Python
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

### 2. Configurar Variáveis de Ambiente

Copie o `.env.example` para `.env.local` e preencha com suas credenciais de desenvolvimento:
```bash
cp .env.example .env.local
```

### 3. Rodar a Aplicação Web

```bash
npm run dev
```
Acesse [http://localhost:3000](http://localhost:3000).

---

## 4. Como Rodar Cada Rotina Manualmente

### A. Importação de Escolas do Censo Escolar (INEP)
```bash
# Modo simulado (não altera o Supabase)
.venv/bin/python scripts/importar_censo.py --ano 2024 --dry-run

# Execução real para abastecer o banco com escolas do DF e RIDE
.venv/bin/python scripts/importar_censo.py --ano 2024
```

### B. Execução do Agente SDR Diário
```bash
# Execução manual forçando nova entrega mesmo que o lote de hoje já exista
.venv/bin/python scripts/agente_sdr.py --gatilho manual --forcar

# Execução em modo dry-run (apenas simula sem persistir)
.venv/bin/python scripts/agente_sdr.py --gatilho manual --dry-run
```

### C. Verificação de E-mails em Lote
```bash
# Verifica até 50 e-mails pendentes
.venv/bin/python scripts/verificar_emails.py --limite 50
```

### D. Cron de Sequências, Respostas e Agenda
Para rodar localmente a rotina do cron:
```bash
curl -X POST http://localhost:3000/api/cron/sequencias \
  -H "Authorization: Bearer seu_token_cron_secret"
```
Para forçar o envio fora da janela comercial de 08:00–18:00:
```bash
curl -X POST "http://localhost:3000/api/cron/sequencias?forcar=true" \
  -H "Authorization: Bearer seu_token_cron_secret"
```

---

## 5. Guia de Problemas Comuns (Troubleshooting)

### 1. O Agente SDR Diário Não Rodou
- **Sintoma**: Painel `/saude` ou cabeçalho indica "Atraso no Agente SDR Diário" após as 08:00.
- **Causas prováveis**:
  1. O GitHub Actions `leadbot.yml` falhou por falta de secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ou `ANTHROPIC_API_KEY`).
  2. O lote de hoje já havia sido gerado (comportamento idempotente). Use a flag `--forcar` para gerar novo lote.
  3. O limite de custo diário (`MAX_CUSTO_DIARIO_USD`) foi atingido.
- **Solução**: Verifique a aba **Actions** no GitHub ou consulte a tabela `rotinas_execucoes` no Supabase para ver a mensagem de erro exata registrada na coluna `erro`.

### 2. O E-mail Não Saiu
- **Sintoma**: Mensagens permanecem na fila de envios (`/fila`) e não são enviadas.
- **Causas prováveis**:
  1. Horário fora da janela comercial de envio (segunda a sexta, das 08:00 às 18:00 no fuso de São Paulo).
  2. Limite diário de aquecimento da caixa de envio atingido (ex: 15 e-mails/dia no início).
  3. Caixa de envio pausada automaticamente por proteção de entregabilidade (bounce > 3.0%).
  4. E-mail do contato não possui status `'valido'` ou a escola está descadastrada.
- **Solução**: Acesse `/configuracoes/email` e verifique se a caixa está ativa. No cron, adicione `?forcar=true` para disparos de teste.

### 3. Resposta de Lead Não Foi Detectada
- **Sintoma**: O lead respondeu ao e-mail, mas a cadência continua ativa e não há registro em `/repostas`.
- **Causas prováveis**:
  1. O token OAuth do Google para a caixa de envio expirou ou foi revogado.
  2. O assunto do e-mail de resposta foi alterado pelo lead e perdeu o identificador RFC/Thread.
  3. O cron de sequências não está rodando a cada 10 minutos.
- **Solução**: Acesse `/saude` e verifique a última execução da rotina `leitor_respostas`. Se houver erro de token revogado, reconecte a caixa de envio no painel de configurações.

### 4. Webhook do Cal.com Falhando
- **Sintoma**: Reunião agendada no Cal.com não reflete na tabela `reunioes` e não cancela a sequência do lead.
- **Causas prováveis**:
  1. O header `X-Cal-Signature-256` não confere com o `CALCOM_WEBHOOK_SECRET` configurado na Vercel.
  2. O e-mail do participante agendado no Cal.com difere do e-mail do contato cadastrado na sequência.
- **Solução**: Acesse os logs do endpoint `/api/webhooks/calcom` na Vercel para inspecionar o payload recebido e confirme o segredo configurado no dashboard do Cal.com.

---

## 6. Testes Automatizados & Qualidade

Para executar a suíte completa de testes:

```bash
# Testes TypeScript (Vitest)
npm test

# Cobertura de Testes TypeScript
npm run test:coverage

# Testes Python (Pytest)
.venv/bin/python -m pytest scripts/tests

# Validação Estática Completa
npm run lint && npx tsc --noEmit && npm run build
```
