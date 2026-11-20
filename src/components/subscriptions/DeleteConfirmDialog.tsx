import * as React from 'react'
import { useI18n } from '@/hooks/useI18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceName: string
  onConfirm: () => Promise<void>
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  serviceName,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const { t } = useI18n()
  const [deleting, setDeleting] = React.useState(false)

  async function handleConfirm() {
    setDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Error toast is already surfaced by SubTrackProvider
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('subs.deleteTitle', { name: serviceName })}</DialogTitle>
          <DialogDescription>{t('subs.deleteDesc', { name: serviceName })}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
