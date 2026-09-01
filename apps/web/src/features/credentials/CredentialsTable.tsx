import { useMemo, useState } from 'react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Input } from '@owox/ui/components/input';
import {
  CircleCheckBig,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useParams } from 'react-router';
import {
  BaseTable,
  SortableHeader,
  TableCTAButton,
  ToggleColumnsHeader,
} from '../../shared/components/Table';
import {
  TableFilters,
  TableFiltersContent,
  TableFiltersTrigger,
  applyFiltersToData,
} from '../../shared/components/TableFilters';
import { useBaseTable, usePersistentFilters } from '../../shared/hooks';
import {
  buildCredentialTableFilters,
  credentialFilterAccessors,
  matchesCredentialSearch,
  type CredentialFilterKey,
} from './CredentialsTableFilters';
import type { Credential } from './types';

interface CredentialsTableProps {
  credentials: Credential[];
  canAddCredential: boolean;
  canMaintainCredential: (credential: Credential) => boolean;
  isValidating: boolean;
  onAddCredential: () => void;
  onValidate: (credential: Credential) => void;
  onReplaceSecret: (credential: Credential) => void;
  onEdit: (credential: Credential) => void;
  onToggleEnabled: (credential: Credential) => void;
  onAcceptDefinition: (credential: Credential) => void;
  onDelete: (credential: Credential) => void;
}

export function CredentialsTable({
  credentials,
  canAddCredential,
  canMaintainCredential,
  isValidating,
  onAddCredential,
  onValidate,
  onReplaceSecret,
  onEdit,
  onToggleEnabled,
  onAcceptDefinition,
  onDelete,
}: CredentialsTableProps) {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const filtersConfig = useMemo(() => buildCredentialTableFilters(credentials), [credentials]);
  const { appliedState, apply, clear } = usePersistentFilters<CredentialFilterKey>({
    projectId,
    tableId: 'credentials-table',
    urlParam: 'filters',
    config: filtersConfig,
  });
  const filteredCredentials = useMemo(
    () =>
      applyFiltersToData(credentials, appliedState, credentialFilterAccessors).filter(credential =>
        matchesCredentialSearch(credential, searchQuery)
      ),
    [appliedState, credentials, searchQuery]
  );
  const columns = useMemo(
    () =>
      getCredentialColumns({
        isValidating,
        canMaintainCredential,
        onValidate,
        onReplaceSecret,
        onEdit,
        onToggleEnabled,
        onAcceptDefinition,
        onDelete,
      }),
    [
      isValidating,
      canMaintainCredential,
      onAcceptDefinition,
      onDelete,
      onEdit,
      onReplaceSecret,
      onToggleEnabled,
      onValidate,
    ]
  );
  const { table } = useBaseTable({
    data: filteredCredentials,
    columns,
    storageKeyPrefix: 'credentials-list',
    defaultSortingColumn: 'title',
    enableRowSelection: false,
    getRowId: credential => credential.id,
  });

  const handleRowClick = (row: Row<Credential>, event: React.MouseEvent) => {
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest('.actions-cell') || event.target.closest('[role="menuitem"]'))
    ) {
      return;
    }
    if (!canMaintainCredential(row.original)) return;
    onEdit(row.original);
  };

  return (
    <div className='dm-card'>
      <BaseTable
        tableId='credentials-table'
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Credentials table'
        paginationProps={{ displaySelected: false }}
        renderEmptyState={() => (
          <div className='py-8'>No Credentials match the current search and filters.</div>
        )}
        renderToolbarLeft={() => (
          <>
            <TableFilters
              appliedState={appliedState}
              onApply={state => {
                apply(state);
                table.setPageIndex(0);
              }}
              onClear={() => {
                clear();
                table.setPageIndex(0);
              }}
            >
              <TableFiltersTrigger />
              <TableFiltersContent config={filtersConfig} />
            </TableFilters>
            <div className='relative max-w-md min-w-0 flex-1'>
              <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
              <Input
                placeholder='Search'
                aria-label='Search Credentials'
                value={searchQuery}
                onChange={event => {
                  setSearchQuery(event.target.value);
                  table.setPageIndex(0);
                }}
                className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
              />
            </div>
          </>
        )}
        renderToolbarRight={() => (
          <TableCTAButton onClick={onAddCredential} disabled={!canAddCredential}>
            Add Credential
          </TableCTAButton>
        )}
      />
    </div>
  );
}

interface CredentialColumnActions {
  isValidating: boolean;
  canMaintainCredential: (credential: Credential) => boolean;
  onValidate: (credential: Credential) => void;
  onReplaceSecret: (credential: Credential) => void;
  onEdit: (credential: Credential) => void;
  onToggleEnabled: (credential: Credential) => void;
  onAcceptDefinition: (credential: Credential) => void;
  onDelete: (credential: Credential) => void;
}

function getCredentialColumns(actions: CredentialColumnActions): ColumnDef<Credential>[] {
  return [
    {
      accessorKey: 'title',
      size: 260,
      meta: { title: 'Name' },
      header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
      cell: ({ row }) => <span className='font-medium'>{row.original.title}</span>,
    },
    {
      id: 'provider',
      accessorFn: credential => credential.definition.displayName,
      size: 180,
      meta: { title: 'Provider' },
      header: ({ column }) => <SortableHeader column={column}>Provider</SortableHeader>,
    },
    {
      id: 'availability',
      accessorFn: credential =>
        credential.definitionConsentRequired
          ? 'definition-update-pending'
          : credential.enabled
            ? 'enabled'
            : 'disabled',
      size: 300,
      meta: { title: 'Availability' },
      header: ({ column }) => <SortableHeader column={column}>Availability</SortableHeader>,
      cell: ({ row }) => <CredentialAvailability credential={row.original} />,
    },
    {
      id: 'usedBy',
      accessorFn: credential => credential.usedBy.length,
      size: 120,
      meta: { title: 'Used by' },
      header: ({ column }) => <SortableHeader column={column}>Used by</SortableHeader>,
      cell: ({ row }) => (
        <span title={usedByTitle(row.original)}>
          {row.original.usedBy.length === 0
            ? '—'
            : `${row.original.usedBy.length} consumer${row.original.usedBy.length === 1 ? '' : 's'}`}
        </span>
      ),
    },
    {
      id: 'lastUsedAt',
      accessorFn: credential => credential.lastUsedAt ?? '',
      size: 190,
      meta: { title: 'Last used' },
      header: ({ column }) => <SortableHeader column={column}>Last used</SortableHeader>,
      cell: ({ row }) => formatDate(row.original.lastUsedAt),
    },
    {
      id: 'actions',
      size: 80,
      enableResizing: false,
      header: ({ table }) => <ToggleColumnsHeader table={table} />,
      cell: ({ row }) =>
        actions.canMaintainCredential(row.original) ? (
          <CredentialActionsCell credential={row.original} {...actions} />
        ) : null,
    },
  ];
}

function CredentialAvailability({ credential }: { credential: Credential }) {
  return (
    <div className='flex flex-wrap gap-1'>
      <Badge variant={credential.enabled ? 'secondary' : 'outline'}>
        {credential.enabled ? 'Enabled' : 'Disabled'}
      </Badge>
      {credential.availableForUse && credential.availableForMaintenance ? (
        <Badge variant='outline'>Shared for use and maintenance</Badge>
      ) : credential.availableForMaintenance ? (
        <Badge variant='outline'>Shared for maintenance</Badge>
      ) : credential.availableForUse ? (
        <Badge variant='outline'>Shared for use</Badge>
      ) : null}
      {credential.definitionConsentRequired && (
        <Badge variant='destructive'>Definition update pending</Badge>
      )}
    </div>
  );
}

function CredentialActionsCell({
  credential,
  isValidating,
  onValidate,
  onReplaceSecret,
  onEdit,
  onToggleEnabled,
  onAcceptDefinition,
  onDelete,
}: { credential: Credential } & CredentialColumnActions) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className='actions-cell text-right'>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${isOpen ? 'opacity-100' : 'group-hover:opacity-100'}`}
            aria-label={`Open actions for ${credential.title}`}
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {!credential.definitionConsentRequired && (
            <>
              <DropdownMenuItem
                disabled={isValidating}
                onClick={() => {
                  onValidate(credential);
                }}
              >
                <ShieldCheck className='text-foreground h-4 w-4' aria-hidden='true' />
                Validate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onReplaceSecret(credential);
                }}
              >
                <RefreshCw className='text-foreground h-4 w-4' aria-hidden='true' />
                Replace secret
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onClick={() => {
              onEdit(credential);
            }}
          >
            <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onToggleEnabled(credential);
            }}
          >
            <Power className='text-foreground h-4 w-4' aria-hidden='true' />
            {credential.enabled ? 'Disable' : 'Enable'}
          </DropdownMenuItem>
          {credential.definitionConsentRequired && (
            <DropdownMenuItem
              onClick={() => {
                onAcceptDefinition(credential);
              }}
            >
              <CircleCheckBig className='text-foreground h-4 w-4' aria-hidden='true' />
              Accept definition update
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onDelete(credential);
            }}
          >
            <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
            <span className='text-red-600'>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function usedByTitle(credential: Credential): string {
  return credential.usedBy
    .map(reference => `${reference.consumerType}: ${reference.requirementKey}`)
    .join('\n');
}
