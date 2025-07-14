import { Search, Download } from 'lucide-react';
import { Button } from '@owox/ui/components/Button';
import type { LogViewType } from './types';
import { Input } from '@owox/ui/components/input';

interface LogControlsProps {
  logViewType: LogViewType;
  setLogViewType: (type: LogViewType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  run: {
    id: string;
    logs: string[];
    errors: string[];
    definitionRun: unknown;
  };
}

export function LogControls({
  logViewType,
  setLogViewType,
  searchTerm,
  setSearchTerm,
  run,
}: LogControlsProps) {
  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const downloadLogs = (run: {
    id: string;
    logs: string[];
    errors: string[];
    definitionRun: unknown;
  }) => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datamart-run-${run.id.slice(0, 8)}-logs.json`;
    a.click();
    URL.revokeObjectURL(url);
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
              setLogViewType('structured');
            }}
            className={`${getButtonSwitchClasses(logViewType === 'structured')} rounded-l-lg`}
          >
            Structured
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              setLogViewType('raw');
            }}
            className={`${getButtonSwitchClasses(logViewType === 'raw')} rounded-none`}
          >
            Raw
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              setLogViewType('configuration');
            }}
            className={`${getButtonSwitchClasses(logViewType === 'configuration')} rounded-r-lg`}
          >
            Configuration
          </button>
        </div>

        {logViewType !== 'configuration' && (
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
  );
}
