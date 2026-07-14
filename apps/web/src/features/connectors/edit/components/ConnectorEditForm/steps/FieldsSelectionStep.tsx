import type { ConnectorFieldsResponseApiDto } from '../../../../shared/api/types/response';
import { Search, KeyRound, ArrowDownZA, ArrowUpAZ, ArrowUpDown, Info, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepCardItem,
  AppWizardStepCards,
  AppWizardStepHero,
} from '@owox/ui/components/common/wizard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Button } from '@owox/ui/components/button';
import { ConnectorFieldSortOrder } from '../../../../shared/types';
import { OpenIssueLink, StepperHeroBlock } from '../components';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import { Unplug } from 'lucide-react';
import { DATA_LEVEL_CONFIG_KEY } from '../../../../shared/constants/connector-config';

interface FieldsSelectionStepProps {
  connector: ConnectorListItem;
  connectorFields: ConnectorFieldsResponseApiDto[] | null;
  selectedField: string;
  selectedFields: string[];
  configuration?: Record<string, unknown>;
  onFieldToggle: (fieldName: string, isChecked: boolean) => void;
  onSelectAllFields: (fieldNames: string[], isSelected: boolean) => void;
}

export function FieldsSelectionStep({
  connector,
  connectorFields,
  selectedField,
  selectedFields,
  configuration,
  onFieldToggle,
  onSelectAllFields,
}: FieldsSelectionStepProps) {
  const filterInputRef = useRef<HTMLInputElement>(null);
  const prevSelectedFieldRef = useRef<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [sortOrder, setSortOrder] = useState<ConnectorFieldSortOrder>(
    ConnectorFieldSortOrder.ORIGINAL
  );

  const selectedFieldData = connectorFields?.find(field => field.name === selectedField);
  const availableFields = useMemo(
    () => selectedFieldData?.fields ?? [],
    [selectedFieldData?.fields]
  );
  const dataLevel = configuration?.[DATA_LEVEL_CONFIG_KEY];
  const selectedDataLevel = typeof dataLevel === 'string' ? dataLevel : null;
  const uniqueKeys = useMemo(() => {
    if (selectedDataLevel && selectedFieldData?.uniqueKeysByDataLevel?.[selectedDataLevel]) {
      return selectedFieldData.uniqueKeysByDataLevel[selectedDataLevel];
    }
    return selectedFieldData?.uniqueKeys ?? [];
  }, [selectedFieldData, selectedDataLevel]);
  const showDataLevelFieldsTip = Boolean(
    selectedDataLevel && selectedFieldData?.uniqueKeysByDataLevel?.[selectedDataLevel]
  );

  const originalIndexByName = useMemo(() => {
    const indexMap = new Map<string, number>();
    availableFields.forEach((field, index) => indexMap.set(field.name, index));
    return indexMap;
  }, [availableFields]);

  const filteredFields = useMemo(() => {
    const filtered = availableFields.filter(field =>
      field.name.toLowerCase().includes(filterText.toLowerCase().trim())
    );

    const comparator = (a: { name: string }, b: { name: string }) => {
      const aIsUniqueKey = uniqueKeys.includes(a.name);
      const bIsUniqueKey = uniqueKeys.includes(b.name);
      if (aIsUniqueKey && !bIsUniqueKey) return -1;
      if (!aIsUniqueKey && bIsUniqueKey) return 1;

      if (sortOrder === ConnectorFieldSortOrder.ASC) return a.name.localeCompare(b.name);
      if (sortOrder === ConnectorFieldSortOrder.DESC) return b.name.localeCompare(a.name);

      const indexA = originalIndexByName.get(a.name) ?? 0;
      const indexB = originalIndexByName.get(b.name) ?? 0;
      return indexA - indexB;
    };

    return [...filtered].sort(comparator);
  }, [availableFields, filterText, uniqueKeys, sortOrder, originalIndexByName]);

  const availableFieldNames = availableFields.map(field => field.name);
  const selectedTotalCount = selectedFields.filter(fieldName =>
    availableFieldNames.includes(fieldName)
  ).length;

  useEffect(() => {
    const availableFieldNamesSet = new Set(availableFields.map(f => f.name));
    const selectedFieldsSet = new Set(selectedFields);
    const uniqueKeysSet = new Set(uniqueKeys);

    const fieldsToAutoSelect = new Set<string>();

    uniqueKeys.forEach(keyName => {
      if (availableFieldNamesSet.has(keyName) && !selectedFieldsSet.has(keyName)) {
        fieldsToAutoSelect.add(keyName);
      }
    });

    const isEndpointSwitch = prevSelectedFieldRef.current !== selectedField;
    if (isEndpointSwitch) {
      prevSelectedFieldRef.current = selectedField;
      const hasFieldsBeyondUniqueKeys = selectedFields.some(
        f => !uniqueKeysSet.has(f) && availableFieldNamesSet.has(f)
      );
      if (!hasFieldsBeyondUniqueKeys) {
        const defaultFields = selectedFieldData?.defaultFields ?? [];
        defaultFields.forEach(fieldName => {
          if (availableFieldNamesSet.has(fieldName) && !selectedFieldsSet.has(fieldName)) {
            fieldsToAutoSelect.add(fieldName);
          }
        });
      }
    }

    if (fieldsToAutoSelect.size > 0) {
      const namesToAdd = Array.from(fieldsToAutoSelect);
      onSelectAllFields(namesToAdd, true);
    }
  }, [
    availableFields,
    uniqueKeys,
    selectedFields,
    selectedFieldData,
    onSelectAllFields,
    selectedField,
  ]);

  // HotKey for Selecting/Unselecting all fields
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifierPressed = event.ctrlKey || event.metaKey;
      const isHotkeyPressed =
        isModifierPressed && event.shiftKey && event.key.toLowerCase() === 'a';

      // Prevent triggering while typing in inputs
      const activeTag = (document.activeElement as HTMLElement).tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (isHotkeyPressed) {
        event.preventDefault();

        const availableNames = availableFields.map(field => field.name);
        const notYetSelected = availableNames.filter(name => !selectedFields.includes(name));
        const shouldSelectAll = notYetSelected.length > 0;

        onSelectAllFields(availableNames, shouldSelectAll);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [availableFields, selectedFields, onFieldToggle, onSelectAllFields]);

  if (!selectedField || !connectorFields) {
    return (
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title='No fields found'
          subtitle='This connector might not be fully implemented yet or there could be other issues.'
        />
        <OpenIssueLink label='Need fields?' />
      </AppWizardStep>
    );
  }

  if (!availableFields.length) {
    return (
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title='No fields found'
          subtitle='This connector might not be fully implemented yet or there could be other issues.'
        />
        <OpenIssueLink label='Need fields?' />
      </AppWizardStep>
    );
  }

  return (
    <AppWizardStep>
      <>
        <StepperHeroBlock connector={connector} />
        {/* Search & Sorting */}
        <div className='border-border -mt-6 mb-6 flex w-full items-center gap-2 border-b'>
          <div className='relative flex-1'>
            <Search
              className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 cursor-text'
              onClick={() => {
                filterInputRef.current?.focus();
              }}
            />
            <input
              ref={filterInputRef}
              type='text'
              placeholder='Search field'
              value={filterText}
              onChange={e => {
                setFilterText(e.target.value);
              }}
              className='h-12 w-full rounded-none border-0 pl-9 text-sm outline-none'
            />
            {filterText && (
              <button
                type='button'
                onClick={() => {
                  setFilterText('');
                }}
                className='text-muted-foreground hover:text-foreground absolute top-1/2 right-0 -translate-y-1/2'
              >
                <X className='h-4 w-4' />
              </button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Sort fields'>
                {sortOrder === ConnectorFieldSortOrder.ASC && (
                  <ArrowUpAZ className='text-muted-foreground h-4 w-4' />
                )}
                {sortOrder === ConnectorFieldSortOrder.DESC && (
                  <ArrowDownZA className='text-muted-foreground h-4 w-4' />
                )}
                {sortOrder === ConnectorFieldSortOrder.ORIGINAL && (
                  <ArrowUpDown className='text-muted-foreground h-4 w-4' />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                onSelect={() => {
                  setSortOrder(ConnectorFieldSortOrder.ASC);
                }}
              >
                <ArrowUpAZ className='text-muted-foreground mr-2 h-4 w-4' />
                A–Z
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setSortOrder(ConnectorFieldSortOrder.DESC);
                }}
              >
                <ArrowDownZA className='text-muted-foreground mr-2 h-4 w-4' />
                Z–A
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setSortOrder(ConnectorFieldSortOrder.ORIGINAL);
                }}
              >
                <ArrowUpDown className='text-muted-foreground mr-2 h-4 w-4' />
                Original
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* end: Search & Sorting */}

        <AppWizardStepSection
          title={`Selected ${String(selectedTotalCount)} of ${String(availableFieldNames.length)} fields for "${selectedField}" data`}
        >
          {showDataLevelFieldsTip && (
            <div className='border-border bg-muted/30 text-muted-foreground flex gap-3 rounded-md border px-3 py-2 text-sm'>
              <Info className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
              <div className='space-y-1'>
                <p>
                  Required fields depend on Data Level. Current Data Level:{' '}
                  <span className='text-foreground font-medium'>{selectedDataLevel}</span>.
                </p>
                <p>
                  OWOX keeps{' '}
                  <span className='text-foreground font-medium'>{uniqueKeys.join(', ')}</span>{' '}
                  selected so rows merge correctly.
                </p>
                <p>If needed, change Data Level in connector settings before selecting fields.</p>
              </div>
            </div>
          )}

          <AppWizardStepCards>
            {filteredFields.map(field => {
              const isUniqueKey = uniqueKeys.includes(field.name);
              return (
                <AppWizardStepCardItem
                  key={field.name}
                  type='checkbox'
                  id={`field-${field.name}`}
                  name='selectedFields'
                  value={field.name}
                  checked={selectedFields.includes(field.name)}
                  selected={selectedFields.includes(field.name) || isUniqueKey}
                  disabled={isUniqueKey}
                  onChange={checked => {
                    onFieldToggle(field.name, checked as boolean);
                  }}
                  label={field.name}
                  tooltip={
                    <div className='flex flex-col gap-2 py-1'>
                      {isUniqueKey && (
                        <p className='flex items-center gap-2'>
                          <span className='font-semibold'>Unique key</span>{' '}
                          <KeyRound className='text-secondary h-3 w-3' />
                        </p>
                      )}
                      <p>
                        <span className='font-semibold'>Type:</span> {field.type}
                      </p>
                      {field.description && (
                        <p>
                          <span className='font-semibold'>Description:</span> {field.description}
                        </p>
                      )}
                    </div>
                  }
                  rightIcon={
                    isUniqueKey ? (
                      <KeyRound className='text-muted-foreground/75 h-4 w-4' />
                    ) : undefined
                  }
                />
              );
            })}
            {filteredFields.length === 0 && filterText && (
              <div className='text-muted-foreground p-8 text-center text-sm'>
                No fields match "{filterText}"
              </div>
            )}
          </AppWizardStepCards>

          <OpenIssueLink label='Need another field?' />
        </AppWizardStepSection>
      </>
    </AppWizardStep>
  );
}
