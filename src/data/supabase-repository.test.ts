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
