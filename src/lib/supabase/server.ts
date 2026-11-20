import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'Supabase Server Error: Variável de ambiente obrigatória NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL não definida.'
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'Supabase Server Error: Variável de ambiente obrigatória NEXT_PUBLIC_SUPABASE_ANON_KEY não definida.'
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // O método setAll foi invocado a partir de um Server Component.
          // Isso pode ser ignorado caso você possua um proxy/middleware atualizando sessões.
        }
      },
    },
  });
}
