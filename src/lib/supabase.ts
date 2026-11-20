/**
 * Módulo de conexão com o Supabase.
 *
 * Para o cliente de usuário no navegador (Client Components):
 *   import { createClient } from '@/lib/supabase/client';
 *
 * Para o cliente de usuário no servidor (Server Components e Server Actions com RLS):
 *   import { createClient } from '@/lib/supabase/server';
 *
 * Para o cliente administrativo só de servidor (service_role, ignora RLS):
 *   import { supabaseAdmin } from '@/lib/supabase/admin';
 */

export { createClient as createBrowserSupabaseClient } from './supabase/client';
