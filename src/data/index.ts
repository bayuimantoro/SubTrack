import { LocalSubTrackRepository } from '@/data/local-repository'
import type { SubTrackRepository } from '@/data/repository'
import { SupabaseSubTrackRepository } from '@/data/supabase-repository'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const localRepo = new LocalSubTrackRepository()
const supabaseRepo = new SupabaseSubTrackRepository()

export async function resolveRepository(): Promise<SubTrackRepository> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      return supabaseRepo
    }
  }
  return localRepo
}
