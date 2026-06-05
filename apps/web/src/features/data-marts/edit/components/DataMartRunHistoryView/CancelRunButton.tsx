import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { cn } from '@owox/ui/lib/utils';

function getErrorResponse(error: unknown):
  | {
      status?: number;
      data?: {
        message?: unknown;
      };
    }
  | undefined {
  return (
    error as {
      response?: {
        status?: number;
        data?: {
          message?: unknown;
        };
      };
    }
  ).response;
}

function getCancelErrorMessage(error: unknown): string {
  const responseMessage = getErrorResponse(error)?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.length > 0) {
    return responseMessage;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Failed to cancel data mart run';
}

interface CancelRunButtonProps {
  runId: string;
  dataMartId: string;
  cancelDataMartRun: (id: string, runId: string) => Promise<void>;
  className?: string;
  variant?: 'destructive' | 'secondary';
  iconClassName?: string;
  labelClassName?: string;
}

export function CancelRunButton({
  runId,
  dataMartId,
  cancelDataMartRun,
  className,
  variant = 'secondary',
  iconClassName = 'size-3',
  labelClassName = 'hidden sm:inline',
}: CancelRunButtonProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleOpenConfirm = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsConfirmOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isCancelling) return;

    setIsCancelling(true);
    try {
      await cancelDataMartRun(dataMartId, runId);
      setIsConfirmOpen(false);
    } catch (error) {
      toast.error(getCancelErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  }, [cancelDataMartRun, dataMartId, isCancelling, runId]);

  return (
    <>
      <Button
        variant={variant}
        size='sm'
        aria-label='Cancel run'
        onClick={handleOpenConfirm}
        disabled={isCancelling}
        className={cn(
          'cursor-pointer font-medium',
          variant === 'secondary' &&
            'hover:bg-muted hover:text-foreground dark:hover:text-foreground text-xs dark:hover:bg-white/10',
          className
        )}
      >
        <X className={iconClassName} />
        <span className={labelClassName}>{isCancelling ? 'Cancelling' : 'Cancel'}</span>
      </Button>

      <ConfirmationDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title='Cancel run?'
        description='This will request cancellation and stop the run if it is still in progress. Cancelling a run may result in incomplete data.'
        confirmLabel='Cancel run'
        cancelLabel='Keep running'
        confirmDisabled={isCancelling}
        onConfirm={() => {
          void handleConfirm();
        }}
        variant='destructive'
      />
    </>
  );
}
