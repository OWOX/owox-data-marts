import { useMemo, useState, type DragEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Info, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { FieldSearchPicker, type FieldPickerItem } from './FieldSearchPicker';
import { fieldDisplayLabel } from './output-controls-display';
import { makePreJoinKey } from './output-controls-utils';
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
        <TooltipContent
          side='top'
          collisionPadding={8}
          className='max-w-[min(20rem,calc(100vw-1.5rem))] text-xs whitespace-pre-wrap normal-case'
        >
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
  /** Business-readable field name (alias or leaf of name). */
  label: string;
  /** Joined data mart name; absent for home-mart fields. */
  dataMartName?: string;
  /** Full path segments, shown as a tree on hover. */
  path?: string[];
}

function columnToPickerItem(c: OutputSettingsDropdownColumn): FieldPickerItem {
  return {
    value: c.name,
    label: c.label,
    dataMartName: c.dataMartName,
    path: c.path,
  };
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

  const hasSlicesSection = (joinedSources ?? []).length > 0 || preJoinIndexed.length > 0;

  return (
    <div className='space-y-4 p-3'>
      <FiltersSection
        indexedRules={postJoinIndexed}
        allColumns={allColumns}
        onAdd={onAddRule}
        onUpdateAt={onUpdateAt}
        onRemoveAt={onRemoveAt}
      />
      {hasSlicesSection && (
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
        selectedColumns={selectedColumns}
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

// FilterEditorPopover strips placement/aliasPath; re-stamp them for a slice.
function toPreJoin(rule: FilterRule, aliasPath: string | undefined): FilterRule {
  return { ...rule, placement: 'pre-join', aliasPath } as FilterRule;
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
  const labelByName = new Map(allColumns.map(c => [c.name, c.label]));
  const dataMartByName = new Map(allColumns.map(c => [c.name, c.dataMartName]));

  return (
    <div>
      <SectionHeader title='Filters' info={SECTION_INFO.filters} />
      <div className='space-y-1'>
        {indexedRules.map(({ rule, index }) => (
          <FilterRow
            key={filterRowKey(rule, index)}
            rule={rule}
            fieldType={columnTypeMap.get(rule.column) ?? null}
            displayLabel={labelByName.get(rule.column)}
            dataMartName={dataMartByName.get(rule.column)}
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
            displayLabel={pendingColumn.label}
            dataMartName={pendingColumn.dataMartName}
            onApply={rule => {
              onAdd(rule);
              setPendingColumn(null);
            }}
            trigger={
              <Button variant='outline' size='sm' className='h-7 text-xs'>
                <Plus className='mr-1 h-3 w-3' />
                {pendingColumn.label}
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
  label: string;
  dataMartName?: string;
}

function SlicesSection({
  indexedRules,
  joinedSources,
  onAdd,
  onUpdateAt,
  onRemoveAt,
}: SlicesSectionProps) {
  const [pending, setPending] = useState<PendingSliceColumn | null>(null);

  const { fieldTypeMap, labelMap, dataMartByAliasPath } = useMemo(() => {
    const fieldTypeMap = new Map<string, string>();
    const labelMap = new Map<string, string>();
    const dataMartByAliasPath = new Map<string, string | undefined>();
    for (const src of joinedSources) {
      dataMartByAliasPath.set(src.aliasPath, src.dataMartName);
      for (const col of src.columns) {
        fieldTypeMap.set(makePreJoinKey(src.aliasPath, col.name), col.type);
        labelMap.set(
          makePreJoinKey(src.aliasPath, col.name),
          fieldDisplayLabel(col.alias, col.name)
        );
      }
    }
    return { fieldTypeMap, labelMap, dataMartByAliasPath };
  }, [joinedSources]);

  function fieldTypeFor(rule: FilterRule): string | null {
    if (!rule.aliasPath) return null;
    return fieldTypeMap.get(makePreJoinKey(rule.aliasPath, rule.column)) ?? null;
  }

  function labelFor(rule: FilterRule): string | undefined {
    if (!rule.aliasPath) return undefined;
    return labelMap.get(makePreJoinKey(rule.aliasPath, rule.column));
  }

  function dataMartFor(rule: FilterRule): string | undefined {
    if (!rule.aliasPath) return undefined;
    return dataMartByAliasPath.get(rule.aliasPath);
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
            displayLabel={labelFor(rule)}
            dataMartName={dataMartFor(rule)}
            onChange={next => {
              onUpdateAt(index, toPreJoin(next, rule.aliasPath));
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
            displayLabel={pending.label}
            dataMartName={pending.dataMartName}
            onApply={rule => {
              onAdd(toPreJoin(rule, pending.aliasPath));
              setPending(null);
            }}
            trigger={
              <Button variant='outline' size='sm' className='h-7 text-xs'>
                <Plus className='mr-1 h-3 w-3' />
                {pending.aliasPath}.{pending.label}
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
  const lookup = new Map<string, PendingSliceColumn>();
  const items: FieldPickerItem[] = [];
  for (const src of joinedSources) {
    for (const col of src.columns) {
      if (!isFilterableType(col.type)) continue;
      const value = makePreJoinKey(src.aliasPath, col.name);
      const label = fieldDisplayLabel(col.alias, col.name);
      lookup.set(value, {
        aliasPath: src.aliasPath,
        column: col.name,
        fieldType: col.type,
        label,
        dataMartName: src.dataMartName,
      });
      items.push({
        value,
        label,
        dataMartName: src.dataMartName,
        path: [...src.aliasPath.split('.'), col.name],
      });
    }
  }

  if (items.length === 0) {
    return <span className='text-muted-foreground text-xs'>No filterable joined columns.</span>;
  }

  return (
    <FieldSearchPicker
      items={items}
      placeholder='Add slice'
      onSelect={value => {
        const pending = lookup.get(value);
        if (pending) onSelect(pending);
      }}
    />
  );
}

function AddFilterPicker({
  columns,
  onSelect,
}: {
  columns: readonly OutputSettingsDropdownColumn[];
  onSelect: (column: OutputSettingsDropdownColumn) => void;
}) {
  if (columns.length === 0) {
    return <span className='text-muted-foreground text-xs'>No more filterable columns.</span>;
  }
  return (
    <FieldSearchPicker
      items={columns.map(columnToPickerItem)}
      placeholder='Add filter'
      onSelect={name => {
        const column = columns.find(c => c.name === name);
        if (column) onSelect(column);
      }}
    />
  );
}

interface SortSectionProps {
  sort: SortRule[];
  selectedColumns: readonly OutputSettingsDropdownColumn[];
  onChange: (next: SortRule[]) => void;
}

function SortSection({ sort, selectedColumns, onChange }: SortSectionProps) {
  const sortColumns = new Set(sort.map(s => s.column));
  const selectedColumnSet = new Set(selectedColumns.map(c => c.name));
  const labelByName = new Map(selectedColumns.map(c => [c.name, c.label]));
  const dataMartByName = new Map(selectedColumns.map(c => [c.name, c.dataMartName]));
  const available = selectedColumns.filter(c => !sortColumns.has(c.name));
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
              isOrphaned={!selectedColumnSet.has(rule.column)}
              displayLabel={labelByName.get(rule.column)}
              dataMartName={dataMartByName.get(rule.column)}
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
          <FieldSearchPicker
            items={available.map(columnToPickerItem)}
            placeholder='Add sort by'
            onSelect={name => {
              if (name && !sortColumns.has(name)) {
                onChange([...sort, { column: name, direction: 'asc' }]);
              }
            }}
          />
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
