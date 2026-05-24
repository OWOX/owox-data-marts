import { useState, type DragEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Info, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { cn } from '@owox/ui/lib/utils';
import type {
  FilterRule,
  JoinedSource,
  OutputConfig,
  SortRule,
} from '../../../shared/types/output-config';
import { FilterRow } from './FilterRow';
import { SortRow } from './SortRow';
import { LimitInput } from './LimitInput';
import { FilterEditorPopover } from './FilterEditorPopover';
import { isFilterableType } from './output-controls-operators';

export type { JoinedSource };

function SectionHeader({ title, info }: { title: string; info: string }) {
  return (
    <div className='text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase'>
      <span>{title}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='text-muted-foreground/60 hover:text-muted-foreground inline-flex'>
            <Info className='size-3.5' aria-label={`About ${title}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs text-xs whitespace-pre-wrap normal-case'>
          {info}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const SECTION_INFO = {
  filters:
    'Filters narrow the final result — applied to the SELECT after all JOINs. Use slices below to narrow a joined data mart BEFORE it is JOINed in.',
  slices:
    'Slices are pre-join filters: they narrow a joined data mart INSIDE its own subquery before the JOIN, reducing the rows pulled in.\n\n' +
    'Because joins are LEFT JOINs, a slice does NOT reduce the number of rows in the final result — main-mart rows that no longer match a sliced row pass through with NULL on the joined columns. To drop those rows from the output, add a Filter on the joined column above.',
  sort: 'Order rows in the final result. Drag to reorder priority; multiple columns are supported.',
  limit:
    'Cap the number of rows returned. Applied last, after filters and sort. Leave empty for no limit.',
} as const;

export interface OutputSettingsDropdownColumn {
  name: string;
  type: string;
}

interface OutputSettingsDropdownProps {
  value: OutputConfig;
  onChange: (next: OutputConfig) => void;
  selectedColumns: readonly OutputSettingsDropdownColumn[];
  allColumns: readonly OutputSettingsDropdownColumn[];
  joinedSources?: readonly JoinedSource[];
}

export function OutputSettingsDropdown({
  value,
  onChange,
  selectedColumns,
  allColumns,
  joinedSources,
}: OutputSettingsDropdownProps) {
  const indexed = value.filterConfig.map((rule, index) => ({ rule, index }));
  const postJoinIndexed = indexed.filter(({ rule }) => rule.placement !== 'pre-join');
  const preJoinIndexed = indexed.filter(({ rule }) => rule.placement === 'pre-join');

  const onAddRule = (rule: FilterRule) => {
    onChange({ ...value, filterConfig: [...value.filterConfig, rule] });
  };
  const onUpdateAt = (index: number, rule: FilterRule) => {
    const next = [...value.filterConfig];
    next[index] = rule;
    onChange({ ...value, filterConfig: next });
  };
  const onRemoveAt = (index: number) => {
    onChange({
      ...value,
      filterConfig: value.filterConfig.filter((_, i) => i !== index),
    });
  };

  const hasJoinedSources = (joinedSources ?? []).length > 0;

  return (
    <div className='space-y-4 p-3'>
      <FiltersSection
        indexedRules={postJoinIndexed}
        allColumns={allColumns}
        onAdd={onAddRule}
        onUpdateAt={onUpdateAt}
        onRemoveAt={onRemoveAt}
      />
      {hasJoinedSources && (
        <SlicesSection
          indexedRules={preJoinIndexed}
          joinedSources={joinedSources ?? []}
          onAdd={onAddRule}
          onUpdateAt={onUpdateAt}
          onRemoveAt={onRemoveAt}
        />
      )}
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

interface IndexedFilterRule {
  rule: FilterRule;
  index: number;
}

// Bare index would let React drag deleted-row state onto its neighbour.
function filterRowKey(rule: FilterRule, index: number): string {
  return `${rule.placement ?? 'post'}|${rule.aliasPath ?? ''}|${rule.column}|${rule.operator}|${index}`;
}

interface FiltersSectionProps {
  indexedRules: IndexedFilterRule[];
  allColumns: readonly OutputSettingsDropdownColumn[];
  onAdd: (rule: FilterRule) => void;
  onUpdateAt: (index: number, rule: FilterRule) => void;
  onRemoveAt: (index: number) => void;
}

function FiltersSection({
  indexedRules,
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
      <SectionHeader title='Filters' info={SECTION_INFO.filters} />
      <div className='space-y-1'>
        {indexedRules.map(({ rule, index }) => (
          <FilterRow
            key={filterRowKey(rule, index)}
            rule={rule}
            fieldType={columnTypeMap.get(rule.column) ?? null}
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

interface SlicesSectionProps {
  indexedRules: IndexedFilterRule[];
  joinedSources: readonly JoinedSource[];
  onAdd: (rule: FilterRule) => void;
  onUpdateAt: (index: number, rule: FilterRule) => void;
  onRemoveAt: (index: number) => void;
}

interface PendingSliceColumn {
  aliasPath: string;
  column: string;
  fieldType: string;
}

function SlicesSection({
  indexedRules,
  joinedSources,
  onAdd,
  onUpdateAt,
  onRemoveAt,
}: SlicesSectionProps) {
  const [pending, setPending] = useState<PendingSliceColumn | null>(null);

  const fieldTypeMap = new Map<string, string>();
  for (const src of joinedSources) {
    for (const col of src.columns) {
      fieldTypeMap.set(`${src.aliasPath}\0${col.name}`, col.type);
    }
  }

  function fieldTypeFor(rule: FilterRule): string | null {
    if (!rule.aliasPath) return null;
    return fieldTypeMap.get(`${rule.aliasPath}\0${rule.column}`) ?? null;
  }

  return (
    <div>
      <SectionHeader title='Slices' info={SECTION_INFO.slices} />
      <div className='space-y-1'>
        {indexedRules.map(({ rule, index }) => (
          <FilterRow
            key={filterRowKey(rule, index)}
            rule={rule}
            fieldType={fieldTypeFor(rule)}
            onChange={next => {
              // Re-stamp placement/aliasPath; FilterEditorPopover drops them.
              onUpdateAt(index, {
                ...next,
                placement: 'pre-join',
                aliasPath: rule.aliasPath,
              } as FilterRule);
            }}
            onRemove={() => {
              onRemoveAt(index);
            }}
          />
        ))}
      </div>
      <div className='mt-2'>
        {pending ? (
          <FilterEditorPopover
            open={true}
            onOpenChange={isOpen => {
              if (!isOpen) setPending(null);
            }}
            column={pending.column}
            fieldType={pending.fieldType}
            onApply={rule => {
              onAdd({
                ...rule,
                placement: 'pre-join',
                aliasPath: pending.aliasPath,
              } as FilterRule);
              setPending(null);
            }}
            trigger={
              <Button variant='outline' size='sm' className='h-7 text-xs'>
                <Plus className='mr-1 h-3 w-3' />
                {pending.aliasPath}.{pending.column}
              </Button>
            }
          />
        ) : (
          <AddSlicePicker joinedSources={joinedSources} onSelect={setPending} />
        )}
      </div>
    </div>
  );
}

function AddSlicePicker({
  joinedSources,
  onSelect,
}: {
  joinedSources: readonly JoinedSource[];
  onSelect: (pending: PendingSliceColumn) => void;
}) {
  // `\0` separator so a `.` in aliasPath/column doesn't collide.
  const items = joinedSources.flatMap(src =>
    src.columns
      .filter(col => isFilterableType(col.type))
      .map(col => ({
        value: `${src.aliasPath}\0${col.name}`,
        aliasPath: src.aliasPath,
        column: col.name,
        fieldType: col.type,
      }))
  );

  if (items.length === 0) {
    return <span className='text-muted-foreground text-xs'>No filterable joined columns.</span>;
  }

  return (
    <Select
      value=''
      onValueChange={val => {
        const item = items.find(i => i.value === val);
        if (item) {
          onSelect({
            aliasPath: item.aliasPath,
            column: item.column,
            fieldType: item.fieldType,
          });
        }
      }}
    >
      <SelectTrigger className='text-muted-foreground h-7 w-full text-xs'>
        <span className='flex flex-1 items-center gap-1 text-left'>
          <Plus className='h-4 w-4' />
          <SelectValue placeholder='Add slice' />
        </span>
      </SelectTrigger>
      <SelectContent>
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>
            <span className='font-mono'>
              <span className='text-blue-600'>{item.aliasPath}</span>.{item.column}
            </span>
            <span className='text-muted-foreground ml-2 text-xs'>({item.fieldType})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <SectionHeader title='Sort' info={SECTION_INFO.sort} />
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
      <SectionHeader title='Limit' info={SECTION_INFO.limit} />
      <LimitInput value={value} onChange={onChange} />
    </div>
  );
}
