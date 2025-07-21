import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  Circle,
  Loader2,
  Ban,
} from 'lucide-react';
import { RunStatus, LogLevel } from './types';

export function getStatusIcon(status: RunStatus) {
  return (
    <div className='flex items-center gap-2'>
      {(() => {
        switch (status) {
          case RunStatus.SUCCESS:
            return <CheckCircle className='h-4 w-4 text-green-500' />;
          case RunStatus.FAILED:
            return <XCircle className='h-4 w-4 text-red-500' />;
          case RunStatus.RUNNING:
            return <Loader2 className='text-primary h-4 w-4 animate-spin' />;
          case RunStatus.CANCELLED:
            return <Ban className='h-4 w-4 text-gray-500' />;
          default:
            return <Circle className='h-4 w-4 text-gray-500' />;
        }
      })()}
    </div>
  );
}

export function getLogLevelIcon(level: LogLevel) {
  switch (level) {
    case LogLevel.INFO:
      return <Info className='h-3 w-3 text-blue-500' />;
    case LogLevel.WARNING:
      return <AlertTriangle className='h-3 w-3 text-yellow-500' />;
    case LogLevel.ERROR:
      return <XCircle className='h-3 w-3 text-red-500' />;
    case LogLevel.SYSTEM:
      return <AlertCircle className='text-muted-foreground h-3 w-3' />;
    default:
      return <Info className='text-muted-foreground h-3 w-3' />;
  }
}

export function getLogLevelColor(level: LogLevel) {
  switch (level) {
    case LogLevel.INFO:
      return 'text-blue-600 dark:text-blue-400';
    case LogLevel.WARNING:
      return 'text-yellow-600 dark:text-yellow-400';
    case LogLevel.ERROR:
      return 'text-red-600 dark:text-red-400';
    case LogLevel.SYSTEM:
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}
