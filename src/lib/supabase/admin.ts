import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _adminClient: SupabaseClient | null = null;

/**
 * Cliente administrativo com bypass de RLS (service_role).
 * Uso EXCLUSIVO em tarefas de servidor, rotinas agendadas e endpoints administrativos.
 * Protegido com import 'server-only' para impedir importação em Client Components.
 * Utiliza inicialização preguiçosa (lazy) para não quebrar builds estáticos no Next.js/Vercel.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!_adminClient) {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tzvjjomsubhacwiatrxk.supabase.co';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      // Fallback seguro durante a fase de build/coleta estática da Vercel
      return createClient(supabaseUrl, 'dummy-service-role-key-for-build', {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }

    _adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return _adminClient;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAdminSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)[prop];
  },
});

