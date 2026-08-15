import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://tpgzgwgasugacsmdhpkd.supabase.co',
  'sb_publishable_IGqEXbp6zpA8SHhsnKhh5A_HcBD2e-R',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      experimental: { passkey: true },
    },
  },
)
