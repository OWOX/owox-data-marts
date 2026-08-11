import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  Circle,
  Loader2,
  Ban,
  CircleStop,
  CalendarClock,
  SquarePlay,
  Activity,
  BarChart3,
  CircleDot,
  Bookmark,
  KeyRound,
  HelpCircle,
} from 'lucide-react';
import { LogLevel } from './types';
import { LogCategory } from './log-category';
import { DataMartRunStatus, DataMartRunTriggerType } from '../../../shared';

export function getStatusIcon(status: DataMartRunStatus) {
  return (
    <div className='flex items-center gap-2'>
      {(() => {
        switch (status) {
          case DataMartRunStatus.SUCCESS:
            return <CheckCircle className='h-4 w-4 text-green-500' />;
          case DataMartRunStatus.FAILED:
            return <XCircle className='h-4 w-4 text-red-500' />;
          case DataMartRunStatus.RUNNING:
            return <Loader2 className='text-primary h-4 w-4 animate-spin' />;
          case DataMartRunStatus.CANCELLED:
            return <Ban className='h-4 w-4 text-gray-500' />;
          case DataMartRunStatus.INTERRUPTED:
            return <CircleStop className='h-4 w-4 text-gray-500' />;
          case DataMartRunStatus.RESTRICTED:
            return <XCircle className='h-4 w-4 text-yellow-500' />;
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

export function getTriggerTypeIcon(triggerType: DataMartRunTriggerType | null) {
  const iconSize = 18;

  return triggerType === DataMartRunTriggerType.SCHEDULED ? (
    <CalendarClock size={iconSize} />
  ) : (
    <SquarePlay size={iconSize} />
  );
}

export function getCategoryIcon(category: LogCategory) {
  switch (category) {
    case LogCategory.ERROR:
      return <XCircle className='h-3 w-3 text-red-500' />;
    case LogCategory.WARNING:
      return <AlertTriangle className='h-3 w-3 text-yellow-500' />;
    case LogCategory.TRACE:
      return <Activity className='text-muted-foreground h-3 w-3' />;
    case LogCategory.ANALYTICS:
      return <BarChart3 className='text-muted-foreground h-3 w-3' />;
    case LogCategory.LIFECYCLE:
      return <CircleDot className='h-3 w-3 text-blue-500' />;
    case LogCategory.STATUS:
      return <CheckCircle className='h-3 w-3 text-green-500' />;
    case LogCategory.STATE:
      return <Bookmark className='h-3 w-3 text-purple-500' />;
    case LogCategory.CREDENTIALS:
      return <KeyRound className='h-3 w-3 text-amber-500' />;
    case LogCategory.UNKNOWN:
      return <HelpCircle className='text-muted-foreground h-3 w-3' />;
    case LogCategory.LOG:
    default:
      return <Info className='h-3 w-3 text-blue-500' />;
  }
}

export function getCategoryColor(category: LogCategory) {
  switch (category) {
    case LogCategory.ERROR:
      return 'text-red-600 dark:text-red-400';
    case LogCategory.WARNING:
      return 'text-yellow-600 dark:text-yellow-400';
    case LogCategory.TRACE:
    case LogCategory.ANALYTICS:
      return 'text-muted-foreground';
    case LogCategory.STATUS:
      return 'text-green-600 dark:text-green-400';
    case LogCategory.STATE:
      return 'text-purple-600 dark:text-purple-400';
    case LogCategory.CREDENTIALS:
      return 'text-amber-600 dark:text-amber-400';
    case LogCategory.LIFECYCLE:
    case LogCategory.LOG:
    default:
      return 'text-blue-600 dark:text-blue-400';
  }
}
