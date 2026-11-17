import * as React from 'react'
import type { SubscriptionCategory } from '@/types/subscription'
import { cn } from '@/lib/utils'

const CATEGORY_TINTS: Record<SubscriptionCategory, string> = {
  Entertainment: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  Productivity: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'Cloud & Dev': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'AI & Tools': 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  Design: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'Music & Audio': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Gaming: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Health & Fitness': 'bg-lime-500/15 text-lime-400 border-lime-500/20',
  'News & Media': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  Other: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
}

function getHostname(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname
  } catch {
    return null
  }
}

export function ServiceIcon({
  name,
  category,
  websiteUrl,
  size = 'md',
}: {
  name: string
  category: SubscriptionCategory
  websiteUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const [imgFailed, setImgFailed] = React.useState(false)
  const hostname = getHostname(websiteUrl ?? null)

  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-base'
        : 'h-10 w-10 text-sm'

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  if (hostname && !imgFailed) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary',
          sizeClass,
        )}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
          alt={`${name} logo`}
          className="h-5 w-5 object-contain"
          onError={() => setImgFailed(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border font-semibold',
        CATEGORY_TINTS[category],
        sizeClass,
      )}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  )
}
