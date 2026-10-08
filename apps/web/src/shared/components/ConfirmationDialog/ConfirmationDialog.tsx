import { type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@owox/ui/components/dialog';
import { Button } from '../Button';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  /** Where focus goes on close; Radix has no trigger to return it to when the dialog opens from a menu. */
  onCloseAutoFocus?: (event: Event) => void;
  variant?: 'destructive' | 'default' | 'brand' | 'outline' | 'secondary' | 'ghost' | 'link';
  children?: ReactNode;
}

export const ConfirmationDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  cancelDisabled = false,
  onCloseAutoFocus,
  variant = 'destructive',
  children,
}: ConfirmationDialogProps) => {
  const handleCancel = () => {
    onOpenChange(false);
    onCancel?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          {cancelLabel && (
            <Button variant='secondary' onClick={handleCancel} disabled={cancelDisabled}>
              {cancelLabel}
            </Button>
          )}
          <Button variant={variant} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
