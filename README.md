# crm-littera

CRM de prospecção para escolas, com Next.js, Supabase e extração automática via GitHub Actions.

## Configuração

1. Execute `supabase/schema.sql` no SQL Editor do Supabase.
2. Copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Instale e execute:

```bash
npm install
npm run dev
```

## Agente diário

Adicione as secrets `SUPABASE_URL` e `SUPABASE_KEY` no GitHub. O workflow
`.github/workflows/leadbot.yml` executa às 08:00 UTC e pode ser iniciado
manualmente pela aba Actions.
