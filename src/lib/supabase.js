import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error(
    '[Supabase] Missing env vars. Copy .env.example to .env and add ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart `npm run dev`.'
  )
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-anon-key')
export const hasSupabaseConfig = Boolean(url && key)
