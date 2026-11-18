# CRM Littera - Prospecção Escolar Automatizada

Sistema completo de CRM e prospecção de escolas particulares e instituições de ensino em Brasília/DF.

## 🛠️ Arquitetura

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons.
- **Banco de Dados**: Supabase (PostgreSQL) com Row Level Security (RLS) e índices otimizados.
- **Agente Diário**: Script Python com `duckduckgo_search` e `requests`, orquestrado via GitHub Actions (100% gratuito).

---

## 🚀 Como Iniciar

### 1. Configurar o Supabase
1. Crie um projeto no [Supabase](https://supabase.com).
2. Acesse o **SQL Editor** do Supabase e execute o script contido em:
   ```bash
   supabase/schema.sql
   ```
3. Obtenha a **Project URL** e a chave **anon public** (ou service role para o agente) em *Settings > API*.

### 2. Configurar o Frontend (Next.js)
Crie um arquivo `.env.local` na raiz com as chaves:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-public
```

Instale as dependências e rode o ambiente de desenvolvimento:
```bash
npm install
npm run dev
```
Acesse [http://localhost:3000](http://localhost:3000).

### 3. Configurar o Agente Diário no GitHub Actions
No repositório do GitHub (`BrunoPinho99/crm-littera`), acesse:
**Settings > Secrets and variables > Actions** e adicione as seguintes Secrets:

- `SUPABASE_URL`: URL do seu projeto Supabase (ex: `https://xxxx.supabase.co`)
- `SUPABASE_KEY`: Chave da API do Supabase (`anon` ou `service_role`).

O fluxo `.github/workflows/leadbot.yml` executará automaticamente todos os dias às **08:00 UTC** (05:00 de Brasília) e também pode ser disparado manualmente na aba **Actions** (`workflow_dispatch`).
