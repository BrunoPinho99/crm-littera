# CRM Littera - Prospecção Escolar B2B

Sistema de prospecção de escolas particulares e decisores (Ensino Médio e Educação Básica) em Brasília/DF e Região Integrada de Desenvolvimento (RIDE - Entorno do DF) com automação de ponta a ponta, autenticação segura via Magic Link e controle de acesso estrito com Supabase RLS.

---

## 🛠️ Arquitetura

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons.
- **Autenticação & Segurança**: Supabase Auth (Magic Link por e-mail), `@supabase/ssr` com cookies de sessão, proxy Next.js (`src/proxy.ts`), controle de permissão por e-mail (`usuarios_autorizados`) e Row Level Security (RLS) estrito com função `SECURITY DEFINER`.
- **Banco de Dados**: Supabase (PostgreSQL) com RLS ativado e sem permissões para o papel `anon`. Tabelas: `escolas`, `contatos`, `interacoes`, `agente_execucoes`, `usuarios_autorizados`.
- **Base do ICP (Censo Escolar INEP)**: Script Python de streaming e importação de microdados oficiais do Censo Escolar da Educação Básica (INEP/MEC) com filtros estritos de qualificação e porte.
- **Agente Diário SDR**: Scripts Python de prospecção e enriquecimento cadastral, orquestrados via GitHub Actions com `SUPABASE_SERVICE_ROLE_KEY`.

---

## 🏫 Base do ICP: Censo Escolar (INEP)

A base de escolas do CRM Littera é abastecida diretamente pelos **Microdados do Censo Escolar da Educação Básica do INEP** (ano mais recente: 2024). Essa é a única fonte primária oficial que identifica com precisão:
1. Se a escola é privada (`TP_DEPENDENCIA = 4`).
2. Se está em atividade (`TP_SITUACAO_FUNCIONAMENTO = 1`).
3. Se oferece Ensino Médio regular (`IN_MED = 1` ou `QT_MAT_MED > 0`).
4. O número real de alunos matriculados no Ensino Médio (`QT_MAT_MED`) e total (`QT_MAT_BAS`).
5. O CNPJ oficial da escola e da sua mantenedora (com validação estrita de dígitos verificadores da Receita Federal).

### 1. Execução Local

```bash
# Rodar teste simulado (não grava no Supabase e exibe distribuição por município)
python scripts/importar_censo.py --ano 2024 --dry-run

# Importação real para o banco Supabase
python scripts/importar_censo.py --ano 2024

# Usando arquivo CSV ou ZIP local já baixado
python scripts/importar_censo.py --arquivo /caminho/para/microdados_ed_basica_2024.csv

# Ajustando o porte mínimo de alunos no Ensino Médio (default: 40)
python scripts/importar_censo.py --ano 2024 --min-matriculas 30
```

### 2. Execução via GitHub Actions

O workflow `.github/workflows/importar_censo.yml` pode ser disparado manualmente através do botão **Run workflow** na aba Actions do GitHub, com suporte ao parâmetro de entrada `ano` (padrão: 2024).

### 3. Customização de Regiões e Configurações

- **`scripts/config/regioes.json`**: Define o Distrito Federal (todas as cidades) e a lista de municípios-alvo do estado de Goiás pertencentes ao Entorno do DF (ex: Águas Lindas de Goiás, Valparaíso de Goiás, Luziânia, Formosa, Novo Gama, Cidade Ocidental, Planaltina e Santo Antônio do Descoberto). Para expandir o território atendido, basta adicionar novos municípios ou estados nesta lista.
- **`scripts/config/censo.json`**: Define a URL oficial do INEP para cada ano e o dicionário de mapeamento entre as colunas do Censo e os atributos das tabelas do CRM.
- **Porte Mínimo (`MIN_MATRICULAS_EM`)**: Escolas com menos de 40 alunos no Ensino Médio são registradas com `status_qualificacao = 'descartado'` e o motivo correspondente anotado em `motivo_descarte`.

---

## 🔐 Configuração de Segurança e Banco de Dados

### 1. Aplicar a Migração no Supabase SQL Editor

1. Acesse o painel do seu projeto no [Supabase](https://supabase.com).
2. No menu lateral esquerdo, clique em **SQL Editor**.
3. Execute as migrações em ordem:
   - `supabase/migrations/0001_seguranca.sql`
   - `supabase/migrations/0002_schema_v2.sql`
4. **IMPORTANTE**: Antes de aplicar a migração 0001, garanta que seu e-mail esteja na lista de administradores autorizados em `usuarios_autorizados`.

---

## 🚀 Execução Local da Aplicação Web

### 1. Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz do projeto (baseado em `.env.example`):

```env
# Conexão do Usuário (Client-Side & Server SSR)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable

# Conexão Administrativa Server-Only (Rotinas de Servidor e Scripts Python)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-secreta

# Apify (opcional)
APIFY_TOKEN=seu_apify_token_aqui

# Envio de E-mails via Gmail (Nodemailer SMTP)
GMAIL_USER=seu-email@dominio.com
GMAIL_APP_PASSWORD=sua_senha_de_app_gmail
```

### 2. Instalação e Execução

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). Se não estiver autenticado, você será automaticamente redirecionado para a página de `/login`.

---

## 📋 Variáveis de Ambiente para Deploy e CI/CD

### 1. Na Vercel (Production & Preview)

Cadastre em **Project Settings > Environment Variables**:

| Nome da Variável | Descrição / Tipo |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública `anon` ou `publishable` |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta de serviço (`service_role`) |
| `GMAIL_USER` | E-mail corporativo do remetente Gmail |
| `GMAIL_APP_PASSWORD` | Senha de aplicativo (16 dígitos) gerada na Conta Google |
| `APIFY_TOKEN` | (Opcional) Token para serviços Apify |

### 2. No GitHub Secrets (para os Workflows `importar_censo.yml` e `leadbot.yml`)

Cadastre em **Settings > Secrets and variables > Actions**:

| Nome do Secret | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta `service_role` (necessária para sincronização com o banco) |
