import { useState, type DragEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { cn } from '@owox/ui/lib/utils';
import type { FilterRule, OutputConfig, SortRule } from '../../../shared/types/output-config';
import { FilterRow } from './FilterRow';
import { SortRow } from './SortRow';
import { LimitInput } from './LimitInput';
import { FilterEditorPopover } from './FilterEditorPopover';
import { isFilterableType } from './output-controls-operators';

export interface OutputSettingsDropdownColumn {
  name: string;
  type: string;
}

interface OutputSettingsDropdownProps {
  value: OutputConfig;
  onChange: (next: OutputConfig) => void;
  selectedColumns: readonly OutputSettingsDropdownColumn[];
  allColumns: readonly OutputSettingsDropdownColumn[];
}

export function OutputSettingsDropdown({
  value,
  onChange,
  selectedColumns,
  allColumns,
}: OutputSettingsDropdownProps) {
  return (
    <div className='space-y-4 p-3'>
      <FiltersSection
        filters={value.filterConfig}
        allColumns={allColumns}
        onAdd={rule => {
          onChange({ ...value, filterConfig: [...value.filterConfig, rule] });
        }}
        onUpdateAt={(index, rule) => {
          const next = [...value.filterConfig];
          next[index] = rule;
          onChange({ ...value, filterConfig: next });
        }}
        onRemoveAt={index => {
          onChange({
            ...value,
            filterConfig: value.filterConfig.filter((_, i) => i !== index),
          });
        }}
      />
      <SortSection
        sort={value.sortConfig}
        selectedColumns={selectedColumns.map(c => c.name)}
        onChange={s => {
          onChange({ ...value, sortConfig: s });
        }}
      />
      <LimitSection
        value={value.limitConfig}
        onChange={l => {
          onChange({ ...value, limitConfig: l });
        }}
      />
    </div>
  );
}

interface FiltersSectionProps {
  filters: FilterRule[];
  allColumns: readonly OutputSettingsDropdownColumn[];
  onAdd: (rule: FilterRule) => void;
  onUpdateAt: (index: number, rule: FilterRule) => void;
  onRemoveAt: (index: number) => void;
}

function FiltersSection({
  filters,
  allColumns,
  onAdd,
  onUpdateAt,
  onRemoveAt,
}: FiltersSectionProps) {
  const [pendingColumn, setPendingColumn] = useState<OutputSettingsDropdownColumn | null>(null);
  const filterableColumns = allColumns.filter(c => isFilterableType(c.type));
  const columnTypeMap = new Map(allColumns.map(c => [c.name, c.type]));

  return (
    <div>
      <div className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
        Filters
      </div>
      <div className='space-y-1'>
        {filters.map((rule, index) => (
          <FilterRow
            key={index}
            rule={rule}
            fieldType={columnTypeMap.get(rule.column) ?? 'STRING'}
            onChange={next => {
              onUpdateAt(index, next);
            }}
            onRemove={() => {
              onRemoveAt(index);
            }}
          />
        ))}
      </div>
      <div className='mt-2'>
        {pendingColumn ? (
          <FilterEditorPopover
            open={true}
            onOpenChange={isOpen => {
              if (!isOpen) setPendingColumn(null);
            }}
            column={pendingColumn.name}
            fieldType={pendingColumn.type}
            onApply={rule => {
              onAdd(rule);
              setPendingColumn(null);
            }}
            trigger={
              <Button variant='outline' size='sm' className='h-7 text-xs'>
                <Plus className='mr-1 h-3 w-3' />
                {pendingColumn.name}
              </Button>
            }
          />
        ) : (
          <AddFilterPicker columns={filterableColumns} onSelect={setPendingColumn} />
        )}
      </div>
    </div>
  );
}

function AddFilterPicker({
  columns,
  onSelect,
}: {
  columns: OutputSettingsDropdownColumn[];
  onSelect: (column: OutputSettingsDropdownColumn) => void;
}) {
  if (columns.length === 0) {
    return <span className='text-muted-foreground text-xs'>No more filterable columns.</span>;
  }
  return (
    <Select
      value=''
      onValueChange={name => {
        const column = columns.find(c => c.name === name);
        if (column) onSelect(column);
      }}
    >
      <SelectTrigger className='text-muted-foreground h-7 w-full text-xs'>
        <span className='flex flex-1 items-center gap-1 text-left'>
          <Plus className='h-4 w-4' />
          <SelectValue placeholder='Add filter' />
        </span>
      </SelectTrigger>
      <SelectContent>
        {columns.map(c => (
          <SelectItem key={c.name} value={c.name}>
            <span className='font-mono'>{c.name}</span>
            <span className='text-muted-foreground ml-2 text-xs'>({c.type})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface SortSectionProps {
  sort: SortRule[];
  selectedColumns: string[];
  onChange: (next: SortRule[]) => void;
}

function SortSection({ sort, selectedColumns, onChange }: SortSectionProps) {
  const sortColumns = new Set(sort.map(s => s.column));
  const available = selectedColumns.filter(c => !sortColumns.has(c));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    if (draggedIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...sort];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div>
      <div className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
        Sort
      </div>
      <div className='space-y-1'>
        {sort.map((rule, index) => (
          <div
            key={rule.column}
            draggable
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDrop={handleDrop(index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'transition-opacity',
              draggedIndex === index && 'opacity-40',
              dragOverIndex === index &&
                draggedIndex !== null &&
                draggedIndex !== index &&
                'ring-primary ring-1'
            )}
          >
            <SortRow
              rule={rule}
              index={index}
              onChange={next => {
                const updated = [...sort];
                updated[index] = next;
                onChange(updated);
              }}
              onRemove={() => {
                onChange(sort.filter(r => r.column !== rule.column));
              }}
            />
          </div>
        ))}
      </div>
      <div className='mt-2'>
        {available.length === 0 ? (
          <span className='text-muted-foreground text-xs'>
            All selected columns are already sorted.
          </span>
        ) : (
          <Select
            value=''
            onValueChange={name => {
              if (name && !sortColumns.has(name)) {
                onChange([...sort, { column: name, direction: 'asc' }]);
              }
            }}
          >
            <SelectTrigger className='text-muted-foreground h-7 w-full text-xs'>
              <span className='flex flex-1 items-center gap-1 text-left'>
                <Plus className='h-4 w-4' />
                <SelectValue placeholder='Add sort by' />
              </span>
            </SelectTrigger>
            <SelectContent>
              {available.map(name => (
                <SelectItem key={name} value={name}>
                  <span className='font-mono'>{name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

interface LimitSectionProps {
  value: number | null;
  onChange: (next: number | null) => void;
}

function LimitSection({ value, onChange }: LimitSectionProps) {
  return (
    <div>
      <div className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
        Limit
      </div>
      <LimitInput value={value} onChange={onChange} />
    </div>
  );
}
