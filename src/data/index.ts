import { LocalSubTrackRepository } from '@/data/local-repository'
import type { SubTrackRepository } from '@/data/repository'
import { SupabaseSubTrackRepository } from '@/data/supabase-repository'
import type { AuthStatus } from '@/hooks/useAuth'

const localRepo = new LocalSubTrackRepository()
const supabaseRepo = new SupabaseSubTrackRepository()

export function resolveRepository(authStatus: AuthStatus): SubTrackRepository | null {
  switch (authStatus) {
    case 'authenticated':
      return supabaseRepo
    case 'local':
      return localRepo
    case 'initializing':
    case 'unauthenticated':
      return null
  }
}
