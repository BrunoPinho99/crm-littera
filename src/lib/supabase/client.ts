import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'Supabase Client Error: Variável de ambiente obrigatória NEXT_PUBLIC_SUPABASE_URL não definida.'
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'Supabase Client Error: Variável de ambiente obrigatória NEXT_PUBLIC_SUPABASE_ANON_KEY não definida.'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
