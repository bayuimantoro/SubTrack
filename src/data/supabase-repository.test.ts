import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseSubTrackRepository } from '@/data/supabase-repository'
import type {
  InstallmentItem,
  InstallmentPlan,
  InstallmentPlanInput,
} from '@/types/installment'

// Mocks for the supabase singleton. create/update/cancel must route through
// supabase.rpc(...) (the atomic RPCs); any legacy use of supabase.from(...) by
// those three methods is treated as a failure so the test detects the old path.
const { rpcMock, fromMock, getUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
  isSupabaseConfigured: true,
}))

const PLAN_JSON = {
  id: 'plan-uuid-1',
  user_id: 'user-1',
  provider_name: 'Shopee SPayLater',
  provider_type: 'paylater',
  description: 'Headphones',
  currency: 'IDR',
  principal_amount: 3000000,
  interest_amount: 360000,
  admin_fee: 0,
  other_charges: 0,
  total_repayment_amount: 3360000,
  tenor_months: 6,
  schedule_type: 'fixed',
  start_date: '2026-01-01',
  first_due_date: '2026-02-01',
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
} as const

function itemsJson(status: string = 'pending'): Record<string, unknown>[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `item-uuid-${i + 1}`,
    plan_id: 'plan-uuid-1',
    user_id: 'user-1',
    installment_number: i + 1,
    due_date: `2026-${String(i + 2).padStart(2, '0')}-01`,
    scheduled_amount: 560000,
    paid_amount: 0,
    status,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
  }))
}

function validInput(): InstallmentPlanInput {
  return {
    providerName: ' Shopee SPayLater ',
    providerType: 'paylater',
    description: ' Headphones ',
    currency: 'IDR',
    principalAmount: 3000000,
    interestAmount: 360000,
    adminFee: 0,
    otherCharges: 0,
    totalRepaymentAmount: 3360000,
    tenorMonths: 6,
    scheduleType: 'fixed',
    startDate: '2026-01-01',
    firstDueDate: '2026-02-01',
    status: 'active',
    notes: null,
    schedule: Array.from({ length: 6 }, (_, i) => ({
      installmentNumber: i + 1,
      dueDate: `2026-${String(i + 2).padStart(2, '0')}-01`,
      scheduledAmount: 560000,
    })),
  }
}

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
  getUserMock.mockReset()
  // Any legacy from() call by the three target methods must fail loudly.
  fromMock.mockImplementation(() => {
    throw new Error('legacy PostgREST path must not be used by create/update/cancel')
  })
})

describe('SupabaseSubTrackRepository.createInstallmentPlan (atomic RPC)', () => {
  it('calls create_installment_plan RPC once with normalized params and maps the result', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { plan: PLAN_JSON, items: itemsJson() },
      error: null,
    })

    const repo = new SupabaseSubTrackRepository()
    const result = await repo.createInstallmentPlan(validInput())

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith(
      'create_installment_plan',
      expect.objectContaining({
        p_provider_name: 'Shopee SPayLater',
        p_description: 'Headphones',
        p_provider_type: 'paylater',
        p_currency: 'IDR',
        p_principal_amount: 3000000,
        p_interest_amount: 360000,
        p_admin_fee: 0,
        p_other_charges: 0,
        p_total_repayment_amount: 3360000,
        p_tenor_months: 6,
        p_schedule_type: 'fixed',
        p_start_date: '2026-01-01',
        p_first_due_date: '2026-02-01',
        p_status: 'active',
        p_notes: null,
        p_schedule: expect.arrayContaining([
          expect.objectContaining({
            installment_number: 1,
            due_date: '2026-02-01',
            scheduled_amount: 560000,
          }),
        ]),
      }),
    )

    const plan: InstallmentPlan = result.plan
    expect(plan.id).toBe('plan-uuid-1')
    expect(plan.providerName).toBe('Shopee SPayLater')
    expect(plan.description).toBe('Headphones')
    expect(plan.totalRepaymentAmount).toBe(3360000)
    expect(plan.tenorMonths).toBe(6)
    expect(result.items).toHaveLength(6)
    expect(result.items[0].installmentNumber).toBe(1)
    expect(result.items[0].scheduledAmount).toBe(560000)
    expect(result.items[0].status).toBe('pending')
  })

  it('rejects invalid input before calling the RPC', async () => {
    const repo = new SupabaseSubTrackRepository()
    await expect(
      repo.createInstallmentPlan({ ...validInput(), providerName: '   ' }),
    ).rejects.toThrow(/provider name/i)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('throws the RPC error message when the RPC fails', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Schedule total (3200000) must match total repayment amount (3360000).' },
    })
    const repo = new SupabaseSubTrackRepository()
    await expect(repo.createInstallmentPlan(validInput())).rejects.toThrow(
      /Schedule total/,
    )
  })
})

describe('SupabaseSubTrackRepository.updateInstallmentPlan (atomic RPC)', () => {
  it('calls update_installment_plan RPC once with normalized params and the plan id', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { plan: PLAN_JSON, items: itemsJson('pending') },
      error: null,
    })

    const repo = new SupabaseSubTrackRepository()
    const result = await repo.updateInstallmentPlan('plan-uuid-1', validInput())

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith(
      'update_installment_plan',
      expect.objectContaining({
        p_plan_id: 'plan-uuid-1',
        p_provider_name: 'Shopee SPayLater',
        p_description: 'Headphones',
        p_total_repayment_amount: 3360000,
        p_tenor_months: 6,
        p_status: 'active',
        p_schedule: expect.any(Array),
      }),
    )
    expect(result.plan.id).toBe('plan-uuid-1')
    expect(result.items).toHaveLength(6)
  })

  it('rejects invalid input before calling the update RPC', async () => {
    const repo = new SupabaseSubTrackRepository()
    await expect(
      repo.updateInstallmentPlan('plan-uuid-1', { ...validInput(), totalRepaymentAmount: 0 }),
    ).rejects.toThrow(/greater than 0/i)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('throws the RPC error message when update fails', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Installment plan not found.' },
    })
    const repo = new SupabaseSubTrackRepository()
    await expect(repo.updateInstallmentPlan('missing', validInput())).rejects.toThrow(
      'Installment plan not found.',
    )
  })
})

describe('SupabaseSubTrackRepository.cancelInstallmentPlan (atomic RPC)', () => {
  it('calls cancel_installment_plan RPC once with the plan id and maps the result', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { plan: { ...PLAN_JSON, status: 'cancelled' }, items: itemsJson('cancelled') },
      error: null,
    })

    const repo = new SupabaseSubTrackRepository()
    const result = await repo.cancelInstallmentPlan('plan-uuid-1')

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('cancel_installment_plan', { p_plan_id: 'plan-uuid-1' })
    expect(result.plan.status).toBe('cancelled')
    expect(result.items).toHaveLength(6)
    expect(result.items.every((i: InstallmentItem) => i.status === 'cancelled')).toBe(true)
  })

  it('throws the RPC error when cancel fails (e.g. completed plan)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Completed installment plans cannot be cancelled.' },
    })
    const repo = new SupabaseSubTrackRepository()
    await expect(repo.cancelInstallmentPlan('plan-uuid-1')).rejects.toThrow(
      'Completed installment plans cannot be cancelled.',
    )
  })
})

describe('SupabaseSubTrackRepository.updateSubscription (nextBillingDate persistence)', () => {
  const SUB_ROW = {
    id: 'sub-uuid-1',
    user_id: 'user-1',
    service_name: 'Gemini',
    category: 'AI & Tools',
    price: 77000,
    currency: 'IDR',
    billing_interval: 'monthly',
    custom_interval_days: null,
    start_date: '2026-11-18',
    billing_day: 18,
    next_billing_date: '2026-11-18',
    payment_method: 'GoPay',
    website_url: null,
    notes: null,
    status: 'active',
    created_at: '2026-11-18T00:00:00+00:00',
    updated_at: '2026-11-18T00:00:00+00:00',
  }

  it('persists explicit nextBillingDate and preserves it on non-schedule updates', async () => {
    const updatePayloads: Record<string, unknown>[] = []

    // 1st call: updateSubscription({ nextBillingDate: '2026-12-18' })
    fromMock.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: SUB_ROW, error: null }),
        }),
      }),
    }))
    fromMock.mockImplementationOnce(() => ({
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return {
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { ...SUB_ROW, next_billing_date: payload.next_billing_date },
                  error: null,
                }),
            }),
          }),
        }
      },
    }))

    const repo = new SupabaseSubTrackRepository()
    const advanced = await repo.updateSubscription('sub-uuid-1', {
      nextBillingDate: '2026-12-18',
    })
    expect(advanced.nextBillingDate).toBe('2026-12-18')
    expect(updatePayloads[0].next_billing_date).toBe('2026-12-18')

    // 2nd call: edit notes only -> must preserve next_billing_date = '2026-12-18'
    const advancedRow = { ...SUB_ROW, next_billing_date: '2026-12-18' }
    fromMock.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: advancedRow, error: null }),
        }),
      }),
    }))
    fromMock.mockImplementationOnce(() => ({
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return {
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    ...advancedRow,
                    notes: payload.notes,
                    next_billing_date: payload.next_billing_date,
                  },
                  error: null,
                }),
            }),
          }),
        }
      },
    }))

    const editedNotes = await repo.updateSubscription('sub-uuid-1', {
      notes: 'Paid November cycle',
    })
    expect(editedNotes.nextBillingDate).toBe('2026-12-18')
    expect(updatePayloads[1].next_billing_date).toBe('2026-12-18')
  })
})

describe('SupabaseSubTrackRepository.addBillingHistory (duplicate prevention)', () => {
  const SUB_ROW = {
    id: 'sub-uuid-1',
    user_id: 'user-1',
    service_name: 'Gemini',
    category: 'AI & Tools',
    price: 77000,
    currency: 'IDR',
    billing_interval: 'monthly',
    custom_interval_days: null,
    start_date: '2026-11-18',
    billing_day: 18,
    next_billing_date: '2026-11-18',
    payment_method: 'GoPay',
    website_url: null,
    notes: null,
    status: 'active',
    created_at: '2026-11-18T00:00:00+00:00',
    updated_at: '2026-11-18T00:00:00+00:00',
  }

  it('rejects duplicate cycle payments (same or different paidAt) and blocks concurrent submissions', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    const insertedRows: Record<string, unknown>[] = []

    const mockSupabaseTables = (existingPaidRows: Record<string, unknown>[]) => {
      fromMock.mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: SUB_ROW, error: null }),
              }),
            }),
          }
        }
        if (table === 'billing_history') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: existingPaidRows, error: null }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              insertedRows.push(payload)
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: `bh-${insertedRows.length}`,
                        ...payload,
                        created_at: '2026-11-18T00:00:00+00:00',
                      },
                      error: null,
                    }),
                }),
              }
            },
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      })
    }

    const repo = new SupabaseSubTrackRepository()

    // 1. Concurrent rapid calls for Nov 18: only 1 insert runs
    mockSupabaseTables([])
    const concurrent = await Promise.allSettled([
      repo.addBillingHistory({
        subscriptionId: 'sub-uuid-1',
        amount: 77000,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'paid',
      }),
      repo.addBillingHistory({
        subscriptionId: 'sub-uuid-1',
        amount: 77000,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'paid',
      }),
    ])
    expect(concurrent.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(insertedRows).toHaveLength(1)

    // 2. Subsequent attempt with different paidAt (Nov 25) in same cycle is rejected
    mockSupabaseTables([
      {
        id: 'bh-1',
        subscription_id: 'sub-uuid-1',
        user_id: 'user-1',
        amount: 77000,
        currency: 'IDR',
        billed_at: '2026-11-18',
        status: 'paid',
        created_at: '2026-11-18T00:00:00+00:00',
      },
    ])
    await expect(
      repo.addBillingHistory({
        subscriptionId: 'sub-uuid-1',
        amount: 77000,
        currency: 'IDR',
        billedAt: '2026-11-25',
        status: 'paid',
      }),
    ).rejects.toThrow(/already been paid/i)
    expect(insertedRows).toHaveLength(1)

    // 3. Next cycle (Dec 18) is allowed
    const decEntry = await repo.addBillingHistory({
      subscriptionId: 'sub-uuid-1',
      amount: 77000,
      currency: 'IDR',
      billedAt: '2026-12-18',
      status: 'paid',
    })
    expect(decEntry.billedAt).toBe('2026-12-18')
    expect(insertedRows).toHaveLength(2)
  })
})
