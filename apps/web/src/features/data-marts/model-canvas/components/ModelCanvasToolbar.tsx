import type { ReactNode } from 'react';
import { SearchInput } from '@owox/ui/components/common/search-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import type { CanvasRelFilter, CanvasStatusFilter } from '../model/graph/filter-canvas-data';
import { ModelCanvasExportMenu, type DataMartCanvasExportFormat } from './ModelCanvasExportMenu';

interface ModelCanvasToolbarProps {
  status: CanvasStatusFilter;
  onStatusChange: (status: CanvasStatusFilter) => void;
  rel: CanvasRelFilter;
  onRelChange: (rel: CanvasRelFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** The Actions menu — rendered at the row end, ahead of the Download button. */
  actions?: ReactNode;
  onExport: (format: DataMartCanvasExportFormat) => void;
}

export function ModelCanvasToolbar(props: ModelCanvasToolbarProps) {
  return (
    <div className='border-border/75 flex min-w-0 flex-nowrap items-center justify-between gap-2 border-b p-4'>
      <div className='flex gap-2'>
        <div className='max-w-[240px] min-w-[180px] shrink [&>div]:w-full'>
          <SearchInput
            id='model-canvas-search'
            placeholder='Search'
            value={props.searchQuery}
            onChange={props.onSearchChange}
            aria-label='Search Data Marts'
          />
        </div>
        <Select
          value={props.rel}
          onValueChange={value => {
            props.onRelChange(value as CanvasRelFilter);
          }}
        >
          <SelectTrigger
            className='w-[220px] min-w-[180px] bg-white dark:bg-white/4 dark:hover:bg-white/8'
            aria-label='Relationships'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Data Marts</SelectItem>
            <SelectItem value='connected'>With relationships only</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={props.status}
          onValueChange={value => {
            props.onStatusChange(value as CanvasStatusFilter);
          }}
        >
          <SelectTrigger
            className='w-[180px] min-w-[150px] bg-white dark:bg-white/4 dark:hover:bg-white/8'
            aria-label='Status'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All statuses</SelectItem>
            <SelectItem value='published'>Published only</SelectItem>
            <SelectItem value='draft'>Draft only</SelectItem>
          </SelectContent>
        </Select>
        {props.actions}
      </div>
      <ModelCanvasExportMenu onExport={props.onExport} />
    </div>
  );
}
