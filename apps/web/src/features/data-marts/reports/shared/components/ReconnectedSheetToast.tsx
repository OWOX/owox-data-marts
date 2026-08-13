import { useState } from 'react';
import { CircleCheck, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * 640px holds the usual message on one line — measured in the browser at 391px of
 * text plus 238px of icon, gaps and buttons. Longer sheet names wrap instead of
 * widening the toast, and it never exceeds the viewport.
 */
const TOAST_WIDTH_CLASSES = 'w-[min(640px,calc(100vw-2rem))]';

/**
 * Shared by both buttons so they are the same box: a fixed height plus centring on
 * both axes. Mixing `inline-flex` with a plain button left the two labels sitting at
 * different heights, and the spinner nudged the primary label off-centre.
 */
const TOAST_BUTTON_CLASSES =
  'focus-visible:ring-ring inline-flex h-8 items-center justify-center rounded px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none';

interface ReconnectedSheetToastProps {
  toastId: string;
  /** What just happened — "Created sheet …" or "Reconnected … to the existing sheet …". */
  message: string;
  /** Starts the report. Resolves once the run request is accepted. */
  onRun: () => Promise<void>;
}

/**
 * Success toast for a reconnected sheet, carrying the obvious next step as a button:
 * reconnecting only repairs the destination, and the sheet stays empty until a run.
 *
 * Dismiss is always available — reconnecting is complete on its own, and running is
 * a separate decision the user may not want to make right now.
 */
export function ReconnectedSheetToast({ toastId, message, onRun }: ReconnectedSheetToastProps) {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    if (isRunning) return;

    setIsRunning(true);
    try {
      await onRun();
      toast.dismiss(toastId);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      role='status'
      aria-live='polite'
      className={`bg-popover text-popover-foreground border-border flex ${TOAST_WIDTH_CLASSES} items-center gap-3 rounded-lg border px-4 py-3 shadow-lg`}
    >
      <CircleCheck className='h-4 w-4 flex-shrink-0 text-green-500' aria-hidden='true' />
      {/* min-w-0 lets the message wrap instead of pushing the buttons out of the box. */}
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>{message}</p>
        <p className='text-muted-foreground text-xs'>The sheet stays empty until the next run.</p>
      </div>
      <div className='flex flex-shrink-0 items-center gap-2'>
        <button
          type='button'
          onClick={() => void handleRun()}
          disabled={isRunning}
          className={`${TOAST_BUTTON_CLASSES} bg-primary text-primary-foreground hover:bg-primary/90 min-w-[104px] gap-1.5 disabled:opacity-60`}
          aria-label='Run report now'
        >
          {isRunning && <Loader2 className='h-3 w-3 animate-spin' aria-hidden='true' />}
          Run report
        </button>
        <button
          type='button'
          onClick={() => {
            toast.dismiss(toastId);
          }}
          className={`${TOAST_BUTTON_CLASSES} bg-secondary text-secondary-foreground hover:bg-accent`}
          aria-label='Dismiss and run later'
        >
          Later
        </button>
      </div>
    </div>
  );
}
