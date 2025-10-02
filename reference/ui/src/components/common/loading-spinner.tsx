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
    ? 'flex h-screen items-center justify-center'
    : 'flex items-center justify-center p-4';

  return (
    <div className={containerClasses}>
      <div className='text-center'>
        <div
          className={` ${sizeClasses[size]} mx-auto mb-4 animate-spin rounded-full border-gray-300 border-t-blue-600`}
        />
        {message && <p className='text-sm text-gray-600'>{message}</p>}
      </div>
    </div>
  );
}

export function FullScreenLoader({ message }: { message?: string }) {
  return <LoadingSpinner fullScreen message={message} />;
}
