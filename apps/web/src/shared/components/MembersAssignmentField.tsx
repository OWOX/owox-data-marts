import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Input } from '@owox/ui/components/input';
import { FormItem, FormLabel } from '@owox/ui/components/form';
import { Search, X } from 'lucide-react';
import { MembersCheckboxList, type CheckableMember } from './MembersCheckboxList';

interface MembersAssignmentFieldProps {
  label: ReactNode;
  tooltip?: ReactNode | string;
  idPrefix: string;
  members: CheckableMember[];
  selectedIds: string[];
  onToggle: (userId: string, checked: boolean) => void;
  /** When provided, enables the master "select all / reset" row above the
   * list. Locked members (admins, project-wide scope) are never touched. */
  onSetSelected?: (ids: string[]) => void;
  disabled?: boolean;
  excludeAdmins?: boolean;
  emptyText?: string;
  /** Optional content rendered below the list, inside the same FormItem
   * (e.g. an accordion explaining why some users are missing). */
  footer?: ReactNode;
}

/**
 * Members assignment field with toggleable inline search.
 *
 * Layout: [label + tooltip-info]   [🔍/X toggle]   →   [search input on its
 * own row when open]   →   [checkbox list, filtered by query].
 *
 * Used by AddContextSheet and ContextDetailsSheet so the assignment UX stays
 * identical across "create context" and "edit context" flows.
 */
export function MembersAssignmentField({
  label,
  tooltip,
  idPrefix,
  members,
  selectedIds,
  onToggle,
  onSetSelected,
  disabled,
  excludeAdmins,
  emptyText,
  footer,
}: MembersAssignmentFieldProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleToggleSearch = () => {
    setSearchOpen(prev => {
      if (prev) setSearchQuery('');
      return !prev;
    });
  };

  // Locked members (admin, entire_project) are force-checked by the list and
  // never live in `selectedIds`, so the master row only ever touches the
  // honestly-selectable subset.
  const selectableIds = useMemo(
    () =>
      members
        .filter(m => m.role !== 'admin' && m.roleScope !== 'entire_project')
        .map(m => m.userId),
    [members]
  );
  const selectableIdSet = useMemo(() => new Set(selectableIds), [selectableIds]);
  const selectedSelectableCount = useMemo(
    () => selectedIds.filter(id => selectableIdSet.has(id)).length,
    [selectedIds, selectableIdSet]
  );

  const masterState: boolean | 'indeterminate' =
    selectableIds.length === 0
      ? false
      : selectedSelectableCount === 0
        ? false
        : selectedSelectableCount === selectableIds.length
          ? true
          : 'indeterminate';

  const showMaster = onSetSelected !== undefined && selectableIds.length > 0;

  const handleMasterChange = (val: boolean | 'indeterminate') => {
    if (!onSetSelected) return;
    if (val === true) {
      onSetSelected(Array.from(new Set([...selectedIds, ...selectableIds])));
    } else {
      onSetSelected(selectedIds.filter(id => !selectableIdSet.has(id)));
    }
  };

  const handleReset = () => {
    if (!onSetSelected) return;
    onSetSelected(selectedIds.filter(id => !selectableIdSet.has(id)));
  };

  return (
    <FormItem>
      <div className='flex items-center gap-2'>
        <FormLabel className='shrink-0' tooltip={tooltip}>
          {label}
        </FormLabel>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='ml-auto h-7 w-7 shrink-0'
          onClick={handleToggleSearch}
          aria-label={searchOpen ? 'Hide search' : 'Search members'}
          aria-pressed={searchOpen}
          disabled={disabled}
        >
          {searchOpen ? <X className='h-4 w-4' /> : <Search className='h-4 w-4' />}
        </Button>
      </div>
      {searchOpen && (
        <div className='relative'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2'
            aria-hidden='true'
          />
          <Input
            type='search'
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
            }}
            placeholder='Search by name or email'
            disabled={disabled}
            className='h-8 pl-8'
            aria-label='Search members'
            autoFocus
          />
        </div>
      )}
      {showMaster && (
        <div className='flex items-center gap-2 px-3'>
          <Checkbox
            id={`${idPrefix}-master`}
            checked={masterState}
            onCheckedChange={handleMasterChange}
            disabled={disabled === true}
            aria-label='Select all members'
          />
          <label
            htmlFor={`${idPrefix}-master`}
            className='cursor-pointer text-sm font-medium select-none'
          >
            {selectedSelectableCount > 0
              ? `${selectedSelectableCount} of ${selectableIds.length} selected`
              : 'Select all'}
          </label>
          {selectedSelectableCount > 0 && (
            <button
              type='button'
              onClick={handleReset}
              disabled={disabled === true}
              className='text-muted-foreground hover:text-foreground ml-auto text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50'
            >
              Reset
            </button>
          )}
        </div>
      )}
      <MembersCheckboxList
        idPrefix={idPrefix}
        members={members}
        selectedIds={selectedIds}
        onToggle={onToggle}
        disabled={disabled}
        excludeAdmins={excludeAdmins}
        emptyText={emptyText}
        searchQuery={searchOpen ? searchQuery : undefined}
      />
      {footer}
    </FormItem>
  );
}
