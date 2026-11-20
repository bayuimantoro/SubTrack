import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { todayIsoDate } from '@/lib/billing-engine'
import { sanitizeHttpUrl } from '@/lib/utils'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import {
  BILLING_INTERVAL_LABELS,
  CURRENCY_OPTIONS,
  SUBSCRIPTION_CATEGORIES,
  type BillingInterval,
  type CurrencyCode,
  type Subscription,
  type SubscriptionCategory,
  type SubscriptionStatus,
} from '@/types/subscription'

interface SubscriptionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Subscription | null
}

interface FormState {
  serviceName: string
  category: SubscriptionCategory
  price: string
  currency: CurrencyCode
  billingInterval: BillingInterval
  customIntervalDays: string
  startDate: string
  paymentMethod: string
  websiteUrl: string
  notes: string
  status: SubscriptionStatus
}

export function SubscriptionFormDialog({
  open,
  onOpenChange,
  initial,
}: SubscriptionFormDialogProps) {
  const { t } = useI18n()
  const { settings, addSubscription, editSubscription } = useSubTrack()
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const errorRef = React.useRef<HTMLDivElement>(null)

  const [form, setForm] = React.useState<FormState>(() => ({
    serviceName: initial?.serviceName ?? '',
    category: initial?.category ?? 'Entertainment',
    price: initial ? String(initial.price) : '',
    currency: initial?.currency ?? settings.defaultCurrency,
    billingInterval: initial?.billingInterval ?? 'monthly',
    customIntervalDays: initial?.customIntervalDays ? String(initial.customIntervalDays) : '30',
    startDate: initial?.startDate ?? todayIsoDate(),
    paymentMethod: initial?.paymentMethod ?? '',
    websiteUrl: initial?.websiteUrl ?? '',
    notes: initial?.notes ?? '',
    status: initial?.status ?? 'active',
  }))

  React.useEffect(() => {
    if (!open) return
    setFormError(null)
    setForm({
      serviceName: initial?.serviceName ?? '',
      category: initial?.category ?? 'Entertainment',
      price: initial ? String(initial.price) : '',
      currency: initial?.currency ?? settings.defaultCurrency,
      billingInterval: initial?.billingInterval ?? 'monthly',
      customIntervalDays: initial?.customIntervalDays ? String(initial.customIntervalDays) : '30',
      startDate: initial?.startDate ?? todayIsoDate(),
      paymentMethod: initial?.paymentMethod ?? '',
      websiteUrl: initial?.websiteUrl ?? '',
      notes: initial?.notes ?? '',
      status: initial?.status ?? 'active',
    })
  }, [open, initial, settings.defaultCurrency])

  React.useEffect(() => {
    if (formError) {
      errorRef.current?.focus()
    }
  }, [formError])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const trimmedName = form.serviceName.trim()
    const parsedPrice = Number(form.price)
    if (!trimmedName) {
      setFormError(t('val.serviceNameReq'))
      return
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setFormError(t('val.priceNonNeg'))
      return
    }
    if (!form.startDate) {
      setFormError(t('val.startDateReq'))
      return
    }
    const customDays =
      form.billingInterval === 'custom' ? Number(form.customIntervalDays) : null
    if (
      form.billingInterval === 'custom' &&
      (!customDays || !Number.isInteger(customDays) || customDays < 1)
    ) {
      setFormError(t('val.customDaysMin'))
      return
    }

    const trimmedUrl = form.websiteUrl.trim()
    const safeUrl = trimmedUrl ? sanitizeHttpUrl(trimmedUrl) : null
    if (trimmedUrl && !safeUrl) {
      setFormError(t('val.urlProtocol'))
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        serviceName: trimmedName,
        category: form.category,
        price: parsedPrice,
        currency: form.currency,
        billingInterval: form.billingInterval,
        customIntervalDays: customDays,
        startDate: form.startDate,
        paymentMethod: form.paymentMethod.trim() || null,
        websiteUrl: safeUrl,
        notes: form.notes.trim() || null,
        status: form.status,
      }
      if (initial) {
        await editSubscription(initial.id, payload)
      } else {
        await addSubscription(payload)
      }
      onOpenChange(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('val.saveSubFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>
            {initial ? t('subs.formEditTitle') : t('subs.formAddTitle')}
          </DialogTitle>
          <DialogDescription>
            {initial ? t('subs.formEditDesc') : t('subs.formAddDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400 focus:outline-none"
            >
              {formError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-name">
                {t('subs.serviceName')} <span aria-hidden="true">*</span>
              </label>
              <Input
                id="sub-name"
                placeholder={t('subs.serviceNamePlaceholder')}
                value={form.serviceName}
                onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-category">
                {t('subs.category')} *
              </label>
              <Select
                id="sub-category"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as SubscriptionCategory }))
                }
              >
                {SUBSCRIPTION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-price">
                {t('subs.price')} <span aria-hidden="true">*</span>
              </label>
              <Input
                id="sub-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="186000"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-currency">
                {t('subs.currency')}
              </label>
              <Select
                id="sub-currency"
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value as CurrencyCode }))
                }
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-interval">
                {t('subs.billingInterval')} *
              </label>
              <Select
                id="sub-interval"
                value={form.billingInterval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, billingInterval: e.target.value as BillingInterval }))
                }
              >
                {Object.keys(BILLING_INTERVAL_LABELS).map((value) => (
                  <option key={value} value={value}>
                    {t(`interval.${value}`)}
                  </option>
                ))}
              </Select>
            </div>

            {form.billingInterval === 'custom' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-custom-days">
                  {t('subs.everyNDays')} <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="sub-custom-days"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={form.customIntervalDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customIntervalDays: e.target.value }))
                  }
                  required
                  aria-required="true"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-status">
                  {t('subs.status')}
                </label>
                <Select
                  id="sub-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as SubscriptionStatus }))
                  }
                >
                  <option value="active">{t('common.status.active')}</option>
                  <option value="paused">{t('common.status.paused')}</option>
                  <option value="cancelled">{t('common.status.cancelled')}</option>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-start-date">
                {t('subs.startDate')} *
              </label>
              <Input
                id="sub-start-date"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-payment">
                {t('subs.paymentMethodOpt')}
              </label>
              <Input
                id="sub-payment"
                placeholder={t('subs.paymentMethodPlaceholder')}
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              />
            </div>
          </div>

          {form.billingInterval === 'custom' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-status-custom">
                {t('subs.status')}
              </label>
              <Select
                id="sub-status-custom"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as SubscriptionStatus }))
                }
              >
                <option value="active">{t('common.status.active')}</option>
                <option value="paused">{t('common.status.paused')}</option>
                <option value="cancelled">{t('common.status.cancelled')}</option>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-url">
              {t('subs.websiteOpt')}
            </label>
            <Input
              id="sub-url"
              type="url"
              placeholder="https://example.com"
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="sub-notes">
              {t('subs.notesOpt')}
            </label>
            <Textarea
              id="sub-notes"
              placeholder={t('subs.notesPlaceholder')}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t('common.saving')
                : initial
                  ? t('subs.saveChanges')
                  : t('common.addSubscription')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
