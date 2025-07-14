import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  Circle,
  Loader2,
} from 'lucide-react';

export function getStatusIcon(status: string) {
  return (
    <div className='flex items-center gap-2'>
      {status === 'SUCCESS' ? (
        <CheckCircle className='h-4 w-4 text-green-500' />
      ) : status === 'FAILED' ? (
        <XCircle className='h-4 w-4 text-red-500' />
      ) : status === 'RUNNING' ? (
        <Loader2 className='text-primary h-4 w-4 animate-spin' />
      ) : (
        <Circle className='h-4 w-4 text-gray-500' />
      )}
    </div>
  );
}

export function getLogLevelIcon(level: string) {
  switch (level) {
    case 'INFO':
      return <Info className='h-3 w-3 text-blue-500' />;
    case 'WARNING':
      return <AlertTriangle className='h-3 w-3 text-yellow-500' />;
    case 'ERROR':
      return <XCircle className='h-3 w-3 text-red-500' />;
    case 'SYSTEM':
      return <AlertCircle className='text-muted-foreground h-3 w-3' />;
    default:
      return <Info className='text-muted-foreground h-3 w-3' />;
  }
}

export function getLogLevelColor(level: string) {
  switch (level) {
    case 'INFO':
      return 'text-blue-600 dark:text-blue-400';
    case 'WARNING':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'ERROR':
      return 'text-red-600 dark:text-red-400';
    case 'SYSTEM':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}
