import { createClient } from '@supabase/supabase-js'

export const NEXO_SITE_URL = 'https://nataliloure.github.io/nexo/'

const client = createClient(
  'https://tpgzgwgasugacsmdhpkd.supabase.co',
  'sb_publishable_IGqEXbp6zpA8SHhsnKhh5A_HcBD2e-R',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

const originalSignUp = client.auth.signUp.bind(client.auth)
client.auth.signUp = ((credentials: Parameters<typeof originalSignUp>[0]) =>
  originalSignUp({
    ...credentials,
    options: {
      ...credentials.options,
      emailRedirectTo: credentials.options?.emailRedirectTo ?? NEXO_SITE_URL,
    },
  })) as typeof client.auth.signUp

export const supabase = client
