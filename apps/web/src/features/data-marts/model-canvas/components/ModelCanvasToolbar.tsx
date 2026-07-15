import { useMemo } from 'react';
import { SearchInput } from '@owox/ui/components/common/search-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Combobox } from '../../../../shared/components/Combobox/combobox';
import type { DataStorageListItem } from '../../../data-storage/shared/model/types/data-storage-list';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model';
import type { CanvasRelFilter, CanvasStatusFilter } from '../model/graph/filter-canvas-data';

interface ModelCanvasToolbarProps {
  storages: DataStorageListItem[];
  storageId: string | null;
  onStorageChange: (id: string) => void;
  status: CanvasStatusFilter;
  onStatusChange: (status: CanvasStatusFilter) => void;
  rel: CanvasRelFilter;
  onRelChange: (rel: CanvasRelFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ModelCanvasToolbar(props: ModelCanvasToolbarProps) {
  const { storageOptions, storageIcons } = useMemo(() => {
    const sorted = [...props.storages].sort((a, b) => a.title.localeCompare(b.title));
    return {
      storageOptions: sorted.map(storage => ({ value: storage.id, label: storage.title })),
      storageIcons: new Map(
        sorted.map(storage => [storage.id, DataStorageTypeModel.getInfo(storage.type).icon])
      ),
    };
  }, [props.storages]);

  return (
    <div className='flex min-w-0 flex-nowrap items-center gap-2 pb-4'>
      <label className='contents' aria-label='Storage'>
        <Combobox
          options={storageOptions}
          value={props.storageId ?? ''}
          onValueChange={props.onStorageChange}
          placeholder='Select storage'
          emptyMessage='No storages found'
          className='w-[300px] min-w-[220px] shrink'
          renderLabel={option => {
            const Icon = storageIcons.get(option.value);
            return (
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                {Icon && <Icon size={16} className='shrink-0' />}
                <span className='min-w-0 truncate'>{option.label}</span>
              </div>
            );
          }}
        />
      </label>
      <Select
        value={props.status}
        onValueChange={value => {
          props.onStatusChange(value as CanvasStatusFilter);
        }}
      >
        <SelectTrigger className='w-[180px] min-w-[150px]' aria-label='Status'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='published'>Published only</SelectItem>
          <SelectItem value='draft'>Draft only</SelectItem>
          <SelectItem value='all'>All statuses</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={props.rel}
        onValueChange={value => {
          props.onRelChange(value as CanvasRelFilter);
        }}
      >
        <SelectTrigger className='w-[220px] min-w-[180px]' aria-label='Relationships'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='connected'>With relationships only</SelectItem>
          <SelectItem value='all'>All data marts</SelectItem>
        </SelectContent>
      </Select>
      <div className='ml-auto w-[240px] min-w-[180px] shrink [&>div]:w-full'>
        <SearchInput
          id='model-canvas-search'
          placeholder='Search data marts…'
          value={props.searchQuery}
          onChange={props.onSearchChange}
          aria-label='Search data marts'
        />
      </div>
    </div>
  );
}
