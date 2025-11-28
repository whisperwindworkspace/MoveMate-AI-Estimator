import { createClient } from '@supabase/supabase-js';

export const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  'https://zhajwkzynfnqjeowznou.supabase.co';

export const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_cJTLEvgY3You6WRcBwPXiw_da0v7mcH';

// Base URL for Supabase Edge Functions.
// You can override with VITE_SUPABASE_FUNCTIONS_URL if needed.
export const supabaseFunctionsUrl =
  (import.meta as any).env?.VITE_SUPABASE_FUNCTIONS_URL ||
  supabaseUrl.replace('.supabase.co', '.functions.supabase.co');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
