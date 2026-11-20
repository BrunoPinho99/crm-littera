# CRM Littera - Prospecção Escolar B2B

Sistema de prospecção de escolas particulares e decisores (Ensino Médio e Educação Básica) em Brasília/DF com automação de ponta a ponta, autenticação segura via Magic Link e controle de acesso estrito com Supabase RLS.

---

## 🛠️ Arquitetura

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons.
- **Autenticação & Segurança**: Supabase Auth (Magic Link por e-mail), `@supabase/ssr` com cookies de sessão, proxy Next.js (`src/proxy.ts`), controle de permissão por e-mail (`usuarios_autorizados`) e Row Level Security (RLS) estrito com função `SECURITY DEFINER`.
- **Banco de Dados**: Supabase (PostgreSQL) com RLS ativado e sem permissões para o papel `anon`.
- **Agente Diário SDR**: Script Python com enriquecimento e validação cadastral, orquestrado via GitHub Actions usando `SUPABASE_SERVICE_ROLE_KEY`.

---

## 🔐 Configuração de Segurança e Banco de Dados

### 1. Aplicar a Migração no Supabase SQL Editor

1. Acesse o painel do seu projeto no [Supabase](https://supabase.com).
2. No menu lateral esquerdo, clique em **SQL Editor**.
3. Abra ou cole o conteúdo do arquivo:
   ```text
   supabase/migrations/0001_seguranca.sql
   ```
4. **IMPORTANTE**: Antes de clicar em **Run**, localize a linha com:
   ```sql
   INSERT INTO public.usuarios_autorizados (email)
   VALUES ('SEU_EMAIL_AQUI')
   ON CONFLICT (email) DO NOTHING;
   ```
   Substitua `'SEU_EMAIL_AQUI'` pelo seu endereço de e-mail corporativo (o mesmo que usará para fazer login).
5. Clique em **Run**. A migração:
   - Cria a tabela `usuarios_autorizados` com RLS restrito.
   - Cria a função `public.is_usuario_autorizado()` com `SECURITY DEFINER`.
   - Remove as políticas públicas antigas de `leads_escolares`.
   - Bloqueia totalmente o papel `anon` (sem acesso de leitura ou escrita).
   - Libera SELECT, INSERT, UPDATE e DELETE em `leads_escolares` apenas para usuários autenticados cujo e-mail conste em `usuarios_autorizados`.

---

## 🚀 Execução Local

### 1. Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz do projeto (baseado em `.env.example`):

```env
# Conexão do Usuário (Client-Side & Server SSR)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable

# Conexão Administrativa Server-Only (Rotinas de Servidor e Scripts Python)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-secreta

# Apify (opcional, para scrapers)
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

### 2. No GitHub Secrets (para o Workflow `leadbot.yml`)

Cadastre em **Settings > Secrets and variables > Actions**:

| Nome do Secret | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta `service_role` (ignora RLS para o robô inserir leads) |
