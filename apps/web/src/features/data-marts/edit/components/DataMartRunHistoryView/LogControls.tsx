import { Search, Download, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { LogViewType } from './types';
import type { DataMartDefinitionConfig } from '../../model/types/data-mart-definition-config';
import { DataMartRunStatus } from '../../../shared';
import { downloadLogs } from './utils';

interface LogControlsProps {
  logViewType: LogViewType;
  setLogViewType: (type: LogViewType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  run: {
    id: string;
    status: DataMartRunStatus;
    logs: string[];
    errors: string[];
    definitionRun: DataMartDefinitionConfig | null;
  };
  cancelDataMartRun: (id: string, runId: string) => Promise<void>;
  dataMartId?: string;
}

export function LogControls({
  logViewType,
  setLogViewType,
  searchTerm,
  setSearchTerm,
  run,
  cancelDataMartRun,
  dataMartId,
}: LogControlsProps) {
  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleCancelRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dataMartId) {
      try {
        await cancelDataMartRun(dataMartId, run.id);
        toast.success('Data mart run cancelled successfully');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to cancel data mart run');
      }
    }
  };

  const getButtonSwitchClasses = (isActive: boolean) => {
    return `px-3 py-2 text-sm font-medium transition-colors rounded-none ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`;
  };

  return (
    <div className='bg-background border-border flex items-center justify-between rounded-lg border p-3'>
      <div className='flex items-center gap-4'>
        <div className='bg-background border-border flex items-center rounded-lg border'>
          <button
            onClick={e => {
              e.stopPropagation();
              setLogViewType(LogViewType.STRUCTURED);
            }}
            className={`${getButtonSwitchClasses(logViewType === LogViewType.STRUCTURED)} rounded-l-lg`}
          >
            Structured
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              setLogViewType(LogViewType.RAW);
            }}
            className={`${getButtonSwitchClasses(logViewType === LogViewType.RAW)} rounded-none`}
          >
            Raw
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              setLogViewType(LogViewType.CONFIGURATION);
            }}
            className={`${getButtonSwitchClasses(logViewType === LogViewType.CONFIGURATION)} rounded-r-lg`}
          >
            Configuration
          </button>
        </div>

        {logViewType !== LogViewType.CONFIGURATION && (
          <div className='relative'>
            <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
            <Input
              type='text'
              placeholder='Search logs...'
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
              }}
              onClick={handleStopPropagation}
              className='border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring rounded-md border py-2 pr-4 pl-8 text-xs focus:border-transparent focus:ring-2 focus:outline-none'
            />
          </div>
        )}
      </div>
      <div className='flex items-center gap-2'>
        {run.status === DataMartRunStatus.RUNNING && (
          <Button variant='destructive' size='sm' onClick={e => void handleCancelRun(e)}>
            <X className='h-4 w-4' />
            Cancel
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            downloadLogs(run);
          }}
          className='flex items-center gap-2'
        >
          <Download className='h-4 w-4' />
          JSON
        </Button>
      </div>
    </div>
  );
}
