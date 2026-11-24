import 'server-only';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Supabase Admin Error: Variável de ambiente obrigatória SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL não configurada.'
  );
}

if (!serviceRoleKey) {
  throw new Error(
    'Supabase Admin Error: Variável de ambiente obrigatória SUPABASE_SERVICE_ROLE_KEY não configurada.'
  );
}

/**
 * Cliente administrativo com bypass de RLS (service_role).
 * Uso EXCLUSIVO em tarefas de servidor, rotinas agendadas e endpoints administrativos.
 * Protegido com import 'server-only' para impedir importação em Client Components.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export function getAdminSupabase() {
  return supabaseAdmin;
}

