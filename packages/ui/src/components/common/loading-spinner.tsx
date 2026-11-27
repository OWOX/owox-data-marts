export interface LoadingSpinnerProps {
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export function LoadingSpinner({ fullScreen = false, size = 'md', message }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4',
  };

  const containerClasses = fullScreen
    ? 'bg-background flex min-h-dvh w-full items-center justify-center p-4'
    : 'flex items-center justify-center p-4';

  return (
    <div className={containerClasses}>
      <div className='text-center'>
        <div
          className={`${sizeClasses[size]} border-border border-t-primary mx-auto mb-4 animate-spin rounded-full`}
        />
        {message && <p className='text-muted-foreground text-sm'>{message}</p>}
      </div>
    </div>
  );
}

export function FullScreenLoader({ message }: { message?: string }) {
  return <LoadingSpinner fullScreen message={message} />;
}
