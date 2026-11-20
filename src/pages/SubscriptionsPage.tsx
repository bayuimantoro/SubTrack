import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  Edit2,
  ExternalLink,
  LayoutGrid,
  List,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DeleteConfirmDialog } from '@/components/subscriptions/DeleteConfirmDialog'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { getEffectiveNextBillingDate, todayIsoDate } from '@/lib/billing-engine'
import { convertCurrency, formatCurrency } from '@/lib/currency'
import { sanitizeHttpUrl } from '@/lib/utils'
import {
  SUBSCRIPTION_CATEGORIES,
  type Subscription,
  type SubscriptionStatus,
} from '@/types/subscription'

type SortOption = 'next_billing_asc' | 'price_desc' | 'price_asc' | 'name_asc'
type ViewMode = 'grid' | 'table'

export function SubscriptionsPage() {
  const { t, formatDate, formatNumber } = useI18n()
  const { subscriptions, billingHistory, settings, loading, editSubscription, removeSubscription } =
    useSubTrack()
  const [search, setSearch] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | SubscriptionStatus>('all')
  const [sortBy, setSortBy] = React.useState<SortOption>('next_billing_asc')
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Subscription | null>(null)
  const [deleting, setDeleting] = React.useState<Subscription | null>(null)

  const today = todayIsoDate()

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const list = subscriptions
      .map((sub) => ({
        ...sub,
        nextBillingDate:
          sub.status === 'cancelled'
            ? sub.nextBillingDate
            : getEffectiveNextBillingDate(sub, today, billingHistory),
      }))
      .filter((sub) => {
        if (query && !sub.serviceName.toLowerCase().includes(query)) return false
        if (categoryFilter !== 'all' && sub.category !== categoryFilter) return false
        if (statusFilter !== 'all' && sub.status !== statusFilter) return false
        return true
      })

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'next_billing_asc':
          return a.nextBillingDate.localeCompare(b.nextBillingDate)
        case 'price_desc': {
          const pa = convertCurrency(a.price, a.currency, settings.defaultCurrency)
          const pb = convertCurrency(b.price, b.currency, settings.defaultCurrency)
          return pb - pa
        }
        case 'price_asc': {
          const pa = convertCurrency(a.price, a.currency, settings.defaultCurrency)
          const pb = convertCurrency(b.price, b.currency, settings.defaultCurrency)
          return pa - pb
        }
        case 'name_asc':
          return a.serviceName.localeCompare(b.serviceName)
      }
    })
  }, [subscriptions, billingHistory, search, categoryFilter, statusFilter, sortBy, settings.defaultCurrency, today])

  async function handleTogglePause(sub: Subscription) {
    if (sub.status === 'cancelled') return
    const nextStatus: SubscriptionStatus = sub.status === 'active' ? 'paused' : 'active'
    try {
      await editSubscription(sub.id, { status: nextStatus })
    } catch {
      // Error toast surfaced by SubTrackProvider
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search, Filter & Sort Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder={t('subs.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label={t('subs.searchPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label={t('subs.allCategories')}
              className="sm:w-40"
            >
              <option value="all">{t('subs.allCategories')}</option>
              {SUBSCRIPTION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | SubscriptionStatus)
              }
              aria-label={t('subs.allStatus')}
              className="sm:w-32"
            >
              <option value="all">{t('subs.allStatus')}</option>
              <option value="active">{t('common.status.active')}</option>
              <option value="paused">{t('common.status.paused')}</option>
              <option value="cancelled">{t('common.status.cancelled')}</option>
            </Select>

            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label={t('subs.sortNext')}
              className="col-span-2 sm:w-44"
            >
              <option value="next_billing_asc">{t('subs.sortNext')}</option>
              <option value="price_desc">{t('subs.sortPriceDesc')}</option>
              <option value="price_asc">{t('subs.sortPriceAsc')}</option>
              <option value="name_asc">{t('subs.sortNameAsc')}</option>
            </Select>

            <div
              className="hidden items-center rounded-lg border border-border p-0.5 md:flex"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                aria-label={t('subs.viewGrid')}
                title={t('subs.viewGrid')}
                className={`rounded-md p-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  viewMode === 'grid'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-pressed={viewMode === 'table'}
                aria-label={t('subs.viewTable')}
                title={t('subs.viewTable')}
                className={`rounded-md p-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  viewMode === 'table'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          {t('subs.showingCount', {
            shown: formatNumber(filtered.length),
            total: formatNumber(subscriptions.length),
          })}
        </span>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm font-medium">{t('subs.noMatching')}</p>
            <p className="text-xs text-muted-foreground">
              {subscriptions.length === 0 ? t('subs.emptyDesc') : t('subs.filterEmptyDesc')}
            </p>
            {subscriptions.length === 0 ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> {t('common.addSubscription')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setCategoryFilter('all')
                  setStatusFilter('all')
                }}
              >
                {t('subs.resetFilters')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('subs.colService')}</th>
                  <th className="px-4 py-3 font-medium">{t('subs.colCategory')}</th>
                  <th className="px-4 py-3 font-medium">{t('subs.colStatus')}</th>
                  <th className="px-4 py-3 font-medium">{t('subs.colInterval')}</th>
                  <th className="px-4 py-3 font-medium">{t('subs.colNextBilling')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('subs.colPrice')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('subs.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((sub) => (
                  <tr key={sub.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/subscriptions/${sub.id}`}
                        className="flex items-center gap-2.5 font-medium hover:text-emerald-700 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        <ServiceIcon
                          name={sub.serviceName}
                          category={sub.category}
                          websiteUrl={sub.websiteUrl}
                          size="sm"
                        />
                        <span>{sub.serviceName}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{sub.category}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          sub.status === 'active'
                            ? 'default'
                            : sub.status === 'paused'
                              ? 'warning'
                              : 'destructive'
                        }
                      >
                        {t(`common.status.${sub.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {sub.billingInterval === 'custom'
                        ? t('interval.everyNDays', { days: sub.customIntervalDays ?? 30 })
                        : t(`interval.${sub.billingInterval}`)}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {sub.status === 'cancelled' ? '—' : formatDate(sub.nextBillingDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCurrency(sub.price, sub.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {sub.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleTogglePause(sub)}
                            aria-label={
                              sub.status === 'active'
                                ? `Pause ${sub.serviceName}`
                                : `Resume ${sub.serviceName}`
                            }
                            title={
                              sub.status === 'active'
                                ? `Pause ${sub.serviceName}`
                                : `Resume ${sub.serviceName}`
                            }
                          >
                            {sub.status === 'active' ? (
                              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(sub)
                            setFormOpen(true)
                          }}
                          aria-label={`Edit ${sub.serviceName}`}
                          title={`Edit ${sub.serviceName}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-700 dark:text-red-400"
                          onClick={() => setDeleting(sub)}
                          aria-label={`Delete ${sub.serviceName}`}
                          title={`Delete ${sub.serviceName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sub) => (
            <Card
              key={sub.id}
              className="flex flex-col justify-between transition-all duration-150 hover:border-zinc-500/60 hover:bg-card/90 focus-within:border-emerald-500/40"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/subscriptions/${sub.id}`}
                    className="flex items-center gap-3 min-w-0 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ServiceIcon
                      name={sub.serviceName}
                      category={sub.category}
                      websiteUrl={sub.websiteUrl}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        {sub.serviceName}
                      </div>
                      <div className="text-xs text-muted-foreground">{sub.category}</div>
                    </div>
                  </Link>

                  <Badge
                    variant={
                      sub.status === 'active'
                        ? 'default'
                        : sub.status === 'paused'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {t(`common.status.${sub.status}`)}
                  </Badge>
                </div>

                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <div>
                    <div className="text-lg font-bold tabular-nums">
                      {formatCurrency(sub.price, sub.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {sub.billingInterval === 'custom'
                        ? t('interval.everyNDays', { days: sub.customIntervalDays ?? 30 })
                        : t(`interval.${sub.billingInterval}`)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {t('subs.nextBilling')}
                    </div>
                    <div className="text-xs font-medium tabular-nums">
                      {sub.status === 'cancelled' ? '—' : formatDate(sub.nextBillingDate)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <div className="flex items-center gap-1">
                    {sub.status !== 'cancelled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleTogglePause(sub)}
                        aria-label={
                          sub.status === 'active'
                            ? `Pause ${sub.serviceName}`
                            : `Resume ${sub.serviceName}`
                        }
                        title={
                          sub.status === 'active'
                            ? `Pause ${sub.serviceName}`
                            : `Resume ${sub.serviceName}`
                        }
                      >
                        {sub.status === 'active' ? (
                          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(sub)
                        setFormOpen(true)
                      }}
                      aria-label={`Edit ${sub.serviceName}`}
                      title={`Edit ${sub.serviceName}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-700 dark:text-red-400"
                      onClick={() => setDeleting(sub)}
                      aria-label={`Delete ${sub.serviceName}`}
                      title={`Delete ${sub.serviceName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    {sanitizeHttpUrl(sub.websiteUrl) && (
                      <a
                        href={sanitizeHttpUrl(sub.websiteUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${sub.serviceName} website`}
                        title={`Open ${sub.serviceName} website`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                    <Link
                      to={`/subscriptions/${sub.id}`}
                      className="rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('common.details')}
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SubscriptionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
      />

      {deleting && (
        <DeleteConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(null)}
          serviceName={deleting.serviceName}
          onConfirm={() => removeSubscription(deleting.id)}
        />
      )}
    </div>
  )
}
