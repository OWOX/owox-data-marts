import { useState, useEffect } from 'react';
import { cn } from '@owox/ui/lib/utils';

interface GlobalLoaderProps {
  isLoading: boolean;
  className?: string;
}

export function GlobalLoader({ isLoading, className }: GlobalLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let progressInterval: NodeJS.Timeout;
    let hideTimeout: NodeJS.Timeout;

    if (isLoading) {
      setVisible(true);
      setProgress(0);

      progressInterval = setInterval(() => {
        setProgress(prevProgress => {
          if (prevProgress < 90) {
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
