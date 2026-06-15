import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface RunUndoToastProps {
  toastId: string;
  reportName: string;
  gracePeriodMs: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function RunUndoToast({
  toastId,
  reportName,
  gracePeriodMs,
  onConfirm,
  onCancel,
}: RunUndoToastProps) {
  const [remaining, setRemaining] = useState(gracePeriodMs);
  const activeRef = useRef(true);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      if (!activeRef.current) return;

      const left = Math.max(0, gracePeriodMs - (Date.now() - startTime));
      setRemaining(left);

      if (left <= 0) {
        clearInterval(interval);
        toast.dismiss(toastId);
        void onConfirmRef.current().catch(console.error);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [gracePeriodMs, toastId]);

  const handleCancel = () => {
    activeRef.current = false;
    toast.dismiss(toastId);
    onCancel();
  };

  const seconds = Math.ceil(remaining / 1000);
  const circumference = 2 * Math.PI * 13;
  const dashOffset = circumference * (1 - remaining / gracePeriodMs);

  return (
    <div className='bg-popover text-popover-foreground border-border flex min-w-[300px] items-center gap-3 rounded-lg border px-4 py-3 shadow-lg'>
      <Loader2 className='text-primary h-4 w-4 flex-shrink-0 animate-spin' aria-hidden='true' />
      <div className='flex-1'>
        <p className='text-sm font-medium'>Starting &ldquo;{reportName}&rdquo;&hellip;</p>
        <p className='text-muted-foreground text-xs'>
          Undo within {Math.ceil(gracePeriodMs / 1000)} seconds
        </p>
      </div>
      <div className='relative flex-shrink-0' style={{ width: 32, height: 32 }}>
        <svg
          width='32'
          height='32'
          viewBox='0 0 32 32'
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden='true'
        >
          <circle cx='16' cy='16' r='13' fill='none' className='stroke-border' strokeWidth='3' />
          <circle
            cx='16'
            cy='16'
            r='13'
            fill='none'
            className='stroke-primary'
            strokeWidth='3'
            strokeLinecap='round'
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className='text-muted-foreground absolute inset-0 flex items-center justify-center text-xs font-semibold'>
          {seconds}
        </div>
      </div>
      <button
        onClick={handleCancel}
        className='bg-secondary text-secondary-foreground hover:bg-accent rounded px-3 py-1.5 text-xs font-medium transition-colors'
        aria-label='Cancel run'
      >
        Cancel
      </button>
    </div>
  );
}
