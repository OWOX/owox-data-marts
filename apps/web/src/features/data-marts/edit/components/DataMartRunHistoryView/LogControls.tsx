import { Search, Download, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { LogViewType, type SortDir } from './types';
import type { LogCategory } from './log-category';
import { getCategoryIcon } from './icons';
import type { DataMartDefinitionConfig } from '../../model/types/data-mart-definition-config';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import { downloadLogs } from './utils';
import { canCancelDataMartRun } from './cancellable-runs';
import { CancelRunButton } from './CancelRunButton';

export interface CategoryFilter {
  category: LogCategory;
  label: string;
  count: number;
}

interface LogControlsProps {
  logViewType: LogViewType;
  setLogViewType: (type: LogViewType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  run: {
    id: string;
    status: DataMartRunStatus;
    type: DataMartRunType;
    logs: string[];
    errors: string[];
    definitionRun: DataMartDefinitionConfig | null;
  };
  cancelDataMartRun: (id: string, runId: string) => Promise<void>;
  dataMartId?: string;
  categoryFilters?: CategoryFilter[];
  activeCategories?: Set<LogCategory>;
  onToggleCategory?: (category: LogCategory) => void;
  sortDir?: SortDir;
  onToggleSort?: () => void;
}

export function LogControls({
  logViewType,
  setLogViewType,
  searchTerm,
  setSearchTerm,
  run,
  cancelDataMartRun,
  dataMartId,
  categoryFilters,
  activeCategories,
  onToggleCategory,
  sortDir,
  onToggleSort,
}: LogControlsProps) {
  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const getButtonSwitchClasses = (isActive: boolean) => {
    return `px-3 py-2 text-sm font-medium transition-colors rounded-none ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`;
  };

  const showChips =
    logViewType === LogViewType.STRUCTURED &&
    categoryFilters !== undefined &&
    categoryFilters.length > 0 &&
    onToggleCategory !== undefined;

  return (
    <div className='bg-background border-border flex items-center justify-between gap-4 rounded-lg border p-3'>
      <div className='flex min-w-0 items-center gap-4'>
        <div className='bg-background border-border flex shrink-0 items-center rounded-lg border'>
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
          <div className='relative shrink-0'>
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

        {showChips && (
          <div className='flex min-w-0 items-center gap-2 overflow-x-auto'>
            {categoryFilters.map(({ category, label, count }) => {
              const isActive = activeCategories?.has(category) ?? true;
              return (
                <button
                  key={category}
                  onClick={e => {
                    e.stopPropagation();
                    onToggleCategory(category);
                  }}
                  aria-pressed={isActive}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-border bg-accent text-foreground'
                      : 'border-border text-muted-foreground opacity-60 hover:opacity-100'
                  }`}
                >
                  {getCategoryIcon(category)}
                  <span>{label}</span>
                  <span className='text-muted-foreground'>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        {dataMartId && canCancelDataMartRun(run.type, run.status) && (
          <CancelRunButton
            runId={run.id}
            dataMartId={dataMartId}
            cancelDataMartRun={cancelDataMartRun}
            variant='destructive'
            className='flex items-center gap-2'
            iconClassName='h-4 w-4'
            labelClassName='inline'
          />
        )}
        {logViewType === LogViewType.STRUCTURED && onToggleSort && (
          <Button
            variant='outline'
            size='sm'
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onToggleSort();
            }}
            aria-label={sortDir === 'desc' ? 'Sort: newest first' : 'Sort: oldest first'}
            className='flex items-center gap-2'
          >
            {sortDir === 'desc' ? (
              <ArrowDownWideNarrow className='h-4 w-4' />
            ) : (
              <ArrowUpNarrowWide className='h-4 w-4' />
            )}
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
