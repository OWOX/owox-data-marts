import { useMemo, useState } from 'react';
import { Eye, EyeOff, Info, Search } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Switch } from '@owox/ui/components/switch';
import type { BlendedFieldOverride } from '../../../shared/types/relationship.types';

const AGGREGATE_FUNCTIONS = ['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'] as const;

type FilterMode = 'all' | 'visible' | 'hidden';

interface SourceField {
  name: string;
  type: string;
  alias: string;
  description: string;
  isHidden: boolean;
  aggregateFunction: string;
}

interface SourceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: {
    path: string;
    title: string;
    currentAlias: string;
    isExcluded: boolean;
    fields: SourceField[];
  };
  onSave: (config: {
    alias: string;
    isExcluded?: boolean;
    fields?: Record<string, BlendedFieldOverride>;
  }) => void;
}

interface FieldState {
  alias: string;
  isHidden: boolean;
  aggregateFunction: string;
}

export function SourceConfigDialog({
  open,
  onOpenChange,
  source,
  onSave,
}: SourceConfigDialogProps) {
  const [alias, setAlias] = useState(source.currentAlias);
  const [isExcluded, setIsExcluded] = useState(source.isExcluded);
  const [searchValue, setSearchValue] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [fieldOverrides, setFieldOverrides] = useState<Partial<Record<string, FieldState>>>(() => {
    const initial: Partial<Record<string, FieldState>> = {};
    for (const field of source.fields) {
      initial[field.name] = {
        alias: field.alias,
        isHidden: field.isHidden,
        aggregateFunction: field.aggregateFunction,
      };
    }
    return initial;
  });

  const getFieldState = (fieldName: string): FieldState => {
    const state = fieldOverrides[fieldName];
    if (!state) {
      const original = source.fields.find(f => f.name === fieldName);
      return {
        alias: original?.alias ?? '',
        isHidden: original?.isHidden ?? false,
        aggregateFunction: original?.aggregateFunction ?? 'STRING_AGG',
      };
    }
    return state;
  };

  const filteredFields = useMemo(() => {
    let fields = source.fields;

    if (searchValue.trim()) {
      const q = searchValue.toLowerCase();
      fields = fields.filter(
        f =>
          f.name.toLowerCase().includes(q) ||
          f.type.toLowerCase().includes(q) ||
          f.alias.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
      );
    }

    if (filterMode === 'visible') {
      fields = fields.filter(f => !getFieldState(f.name).isHidden);
    } else if (filterMode === 'hidden') {
      fields = fields.filter(f => getFieldState(f.name).isHidden);
    }

    return fields;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.fields, searchValue, filterMode, fieldOverrides]);

  const toggleHidden = (fieldName: string) => {
    const current = getFieldState(fieldName);
    setFieldOverrides(prev => ({
      ...prev,
      [fieldName]: { ...current, isHidden: !current.isHidden },
    }));
  };

  const setFieldAlias = (fieldName: string, value: string) => {
    const current = getFieldState(fieldName);
    setFieldOverrides(prev => ({
      ...prev,
      [fieldName]: { ...current, alias: value },
    }));
  };

  const setAggregateFunction = (fieldName: string, value: string) => {
    const current = getFieldState(fieldName);
    setFieldOverrides(prev => ({
      ...prev,
      [fieldName]: { ...current, aggregateFunction: value },
    }));
  };

  const handleSave = () => {
    const fields: Record<string, BlendedFieldOverride> = {};
    let hasOverrides = false;

    for (const field of source.fields) {
      const override = getFieldState(field.name);
      const entry: BlendedFieldOverride = {};

      if (override.alias !== field.alias) {
        entry.alias = override.alias;
        hasOverrides = true;
      }
      if (override.isHidden !== field.isHidden) {
        entry.isHidden = override.isHidden;
        hasOverrides = true;
      }
      if (override.aggregateFunction !== field.aggregateFunction) {
        entry.aggregateFunction = override.aggregateFunction;
        hasOverrides = true;
      }

      if (Object.keys(entry).length > 0) {
        fields[field.name] = entry;
      }
    }

    onSave({
      alias,
      isExcluded: isExcluded || undefined,
      fields: hasOverrides ? fields : undefined,
    });
    onOpenChange(false);
  };

  const totalCount = source.fields.length;
  const hiddenCount = Object.values(fieldOverrides).filter(f => f?.isHidden).length;
  const visibleCount = totalCount - hiddenCount;
  const overrideCount = source.fields.filter(field => {
    const override = getFieldState(field.name);
    return (
      override.isHidden !== field.isHidden ||
      override.aggregateFunction !== field.aggregateFunction
    );
  }).length;

  const filterButtons: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: `All (${totalCount})` },
    { mode: 'visible', label: `Visible (${visibleCount})` },
    { mode: 'hidden', label: `Hidden (${hiddenCount})` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{source.title}</DialogTitle>
          <p className='text-muted-foreground text-sm'>{source.path}</p>
        </DialogHeader>

        <div className='flex items-center justify-between rounded-md border px-3 py-2.5'>
          <div>
            <span className='text-sm font-medium'>Include in output</span>
            <p className='text-muted-foreground text-xs'>
              When disabled, all fields from this source are excluded
            </p>
          </div>
          <Switch
            checked={!isExcluded}
            onCheckedChange={checked => {
              setIsExcluded(!checked);
            }}
          />
        </div>

        <div className='space-y-4'>
        <div className='space-y-1.5'>
          <label className='text-sm font-medium'>Output alias</label>
          <Input
            value={alias}
            onChange={e => {
              setAlias(e.target.value);
            }}
            placeholder='alias'
          />
          {alias && (
            <p className='text-muted-foreground text-xs'>
              Columns will be prefixed:{' '}
              <span className='font-mono'>{alias} *</span>
            </p>
          )}
        </div>

        <div className='min-h-0 flex-1 space-y-2'>
          <div className='flex items-center gap-2'>
            <div className='relative flex-1'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
              <Input
                placeholder='Search fields...'
                value={searchValue}
                onChange={e => {
                  setSearchValue(e.target.value);
                }}
                className='pl-8 text-sm'
              />
            </div>
            <div className='flex shrink-0 items-center rounded-md border text-xs'>
              {filterButtons.map(({ mode, label }) => (
                <button
                  key={mode}
                  type='button'
                  className={`px-2.5 py-1.5 transition-colors ${
                    filterMode === mode
                      ? 'bg-muted text-foreground rounded-md font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    setFilterMode(mode);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className='max-h-[400px] overflow-y-auto rounded-md border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted sticky top-0 z-10'>
                <tr>
                  <th className='w-9 px-2 py-2' />
                  <th className='w-1/5 px-3 py-2 text-left text-xs font-medium'>Name</th>
                  <th className='w-20 px-3 py-2 text-left text-xs font-medium'>Type</th>
                  <th className='px-3 py-2 text-left text-xs font-medium'>Alias</th>
                  <th className='w-36 px-3 py-2 text-left text-xs font-medium'>Aggregation</th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.map(field => {
                  const state = getFieldState(field.name);
                  return (
                    <tr
                      key={field.name}
                      className={`border-t transition-opacity ${state.isHidden ? 'opacity-40' : ''}`}
                    >
                      <td className='px-2 py-1.5'>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              className='h-7 w-7 p-0'
                              onClick={() => {
                                toggleHidden(field.name);
                              }}
                            >
                              {state.isHidden ? (
                                <EyeOff className='text-muted-foreground h-4 w-4' />
                              ) : (
                                <Eye className='h-4 w-4' />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side='left'>
                            {state.isHidden
                              ? 'Field is hidden from output. Click to show.'
                              : 'Field is visible in output. Click to hide.'}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className='px-3 py-1.5'>
                        <span className='inline-flex items-center gap-1'>
                          <span className='font-mono text-xs'>{field.name}</span>
                          {field.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                              </TooltipTrigger>
                              <TooltipContent side='top'>{field.description}</TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </td>
                      <td className='text-muted-foreground px-3 py-1.5 text-xs'>{field.type}</td>
                      <td className='px-3 py-1.5'>
                        <Input
                          value={state.alias}
                          onChange={e => {
                            setFieldAlias(field.name, e.target.value);
                          }}
                          className='h-7 text-xs'
                        />
                      </td>
                      <td className='px-3 py-1.5'>
                        <Select
                            value={state.aggregateFunction}
                            onValueChange={value => {
                              setAggregateFunction(field.name, value);
                            }}
                          >
                            <SelectTrigger size='sm' className='h-7 w-full text-xs'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AGGREGATE_FUNCTIONS.map(fn => (
                                <SelectItem key={fn} value={fn}>
                                  {fn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                      </td>
                    </tr>
                  );
                })}
                {filteredFields.length === 0 && (
                  <tr>
                    <td colSpan={5} className='text-muted-foreground px-3 py-6 text-center text-sm'>
                      No fields match the current filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        <div className='bg-muted/30 text-muted-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm'>
          <span>
            <span className='font-medium'>{totalCount}</span> total
          </span>
          <span className='text-muted-foreground/40'>·</span>
          <span>
            <span className='font-medium'>{visibleCount}</span> visible
          </span>
          <span className='text-muted-foreground/40'>·</span>
          <span>
            <span className='font-medium'>{hiddenCount}</span> hidden
          </span>
          {overrideCount > 0 && (
            <>
              <span className='text-muted-foreground/40'>·</span>
              <span>
                <span className='font-medium'>{overrideCount}</span> overrides
              </span>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='ghost'
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type='button' onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
