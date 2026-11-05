import { useState, useEffect, useRef } from 'react';
import { cn } from '@owox/ui/lib/utils';

interface GlobalLoaderProps {
  isLoading: boolean;
  /** A fraction from 0 to 1. The bar shows it once it passes the estimate, and stops estimating. */
  progress?: number;
  className?: string;
}

export function GlobalLoader({ isLoading, progress: reported, className }: GlobalLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  // The interval reads the latest value without restarting when it changes.
  const reportedRef = useRef(reported);
  reportedRef.current = reported;

  useEffect(() => {
    let progressInterval: NodeJS.Timeout;
    let hideTimeout: NodeJS.Timeout;

    if (isLoading) {
      setVisible(true);
      setProgress(0);

      progressInterval = setInterval(() => {
        setProgress(prevProgress => {
          if (reportedRef.current === undefined && prevProgress < 90) {
            return prevProgress + (90 - prevProgress) / 10;
          }
          return prevProgress;
        });
      }, 200);
    } else {
      setProgress(100);

      hideTimeout = setTimeout(() => {
        setVisible(false);
      }, 300);
    }

    return () => {
      clearInterval(progressInterval);
      clearTimeout(hideTimeout);
    };
  }, [isLoading]);

  // Declared after the effect above, so a reset to 0 on a new start comes first.
  useEffect(() => {
    if (isLoading && reported !== undefined) {
      // Forward only: a fraction below the estimate holds the bar instead of pulling it back.
      setProgress(prevProgress => Math.max(prevProgress, reported * 100));
    }
  }, [isLoading, reported]);

  return (
    <div
      className={cn(
        'fixed top-0 right-0 left-0 z-50 h-1 transition-opacity duration-300',
        !visible && 'opacity-0',
        className
      )}
    >
      <div
        className='bg-primary h-full transition-all duration-300 ease-out'
        style={{ width: `${progress.toString()}%` }}
      />
    </div>
  );
}
