import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://tzvjjomsubhacwiatrxk.supabase.co';

const supabaseAnonKey =
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dmpqb21zdWJoYWN3aWF0cnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjIzNDEsImV4cCI6MjA4NTc5ODM0MX0.ylFJOFhTk9GNoF8DSAtwIutpl-R3fz_Tv4WjVcjF9aA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
