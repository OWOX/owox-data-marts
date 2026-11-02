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
import {
  HoverCard,
  HoverCardBody,
  HoverCardContent,
  HoverCardHeader,
  HoverCardHeaderDescription,
  HoverCardHeaderText,
  HoverCardHeaderTitle,
  HoverCardTrigger,
} from '@owox/ui/components/hover-card';
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
import { isUnavailableCredential, type Credential, type UnavailableCredential } from './types';
import { ProviderIcon } from './components/ProviderCombobox';
import { servedConnector } from './served-connector';
import { CredentialConsumerList } from './components/CredentialUsedByList';

type TableRow = Credential | UnavailableCredential;

interface CredentialsTableProps {
  credentials: Credential[];
  unavailableCredentials?: UnavailableCredential[];
  /** Whether the viewer may delete a Credential whose connector is gone. */
  canDeleteUnavailable?: boolean;
  canAddCredential: boolean;
  canMaintainCredential: (credential: Credential) => boolean;
  isValidating: boolean;
  onAddCredential: () => void;
  onValidate: (credential: Credential) => void;
  onReplaceSecret: (credential: Credential) => void;
  onEdit: (credential: Credential) => void;
  onToggleEnabled: (credential: Credential) => void;
  onAcceptDefinition: (credential: Credential) => void;
  onDelete: (credential: TableRow) => void;
}

export function CredentialsTable({
  credentials,
  unavailableCredentials = [],
  canDeleteUnavailable = false,
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
  const filteredCredentials = useMemo<TableRow[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return [
      ...applyFiltersToData(credentials, appliedState, credentialFilterAccessors).filter(
        credential => matchesCredentialSearch(credential, searchQuery)
      ),
      // Filters describe fields an unavailable row does not have.
      ...(appliedState.filters.length === 0
        ? unavailableCredentials.filter(row => row.title.toLocaleLowerCase().includes(query))
        : []),
    ];
  }, [appliedState, credentials, unavailableCredentials, searchQuery]);
  const columns = useMemo(
    () =>
      getCredentialColumns({
        isValidating,
        canMaintainCredential,
        canDeleteUnavailable,
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
      canDeleteUnavailable,
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

  const handleRowClick = (row: Row<TableRow>, event: React.MouseEvent) => {
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest('.actions-cell') || event.target.closest('[role="menuitem"]'))
    ) {
      return;
    }
    if (isUnavailableCredential(row.original) || !canMaintainCredential(row.original)) return;
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
  canDeleteUnavailable: boolean;
  canMaintainCredential: (credential: Credential) => boolean;
  onValidate: (credential: Credential) => void;
  onReplaceSecret: (credential: Credential) => void;
  onEdit: (credential: Credential) => void;
  onToggleEnabled: (credential: Credential) => void;
  onAcceptDefinition: (credential: Credential) => void;
  onDelete: (credential: TableRow) => void;
}

function getCredentialColumns(actions: CredentialColumnActions): ColumnDef<TableRow>[] {
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
      accessorFn: credential =>
        isUnavailableCredential(credential) ? '' : credential.definition.displayName,
      size: 180,
      meta: { title: 'Provider' },
      header: ({ column }) => <SortableHeader column={column}>Provider</SortableHeader>,
      cell: ({ row }) =>
        isUnavailableCredential(row.original) ? (
          <span className='text-muted-foreground'>
            Unavailable — its connector is no longer installed
          </span>
        ) : (
          <div className='flex items-center gap-2'>
            <ProviderIcon
              icon={row.original.definition.icon}
              connector={servedConnector(row.original.definition)}
            />
            {row.original.definition.displayName}
          </div>
        ),
    },
    {
      id: 'availability',
      accessorFn: credential =>
        isUnavailableCredential(credential)
          ? ''
          : credential.definitionConsentRequired
            ? 'definition-update-pending'
            : credential.enabled
              ? 'enabled'
              : 'disabled',
      size: 300,
      meta: { title: 'Availability' },
      header: ({ column }) => <SortableHeader column={column}>Availability</SortableHeader>,
      cell: ({ row }) =>
        isUnavailableCredential(row.original) ? null : (
          <CredentialAvailability credential={row.original} />
        ),
    },
    {
      id: 'usedBy',
      accessorFn: credential =>
        isUnavailableCredential(credential) ? 0 : credential.usedBy.length,
      size: 120,
      meta: { title: 'Used by' },
      header: ({ column }) => <SortableHeader column={column}>Used by</SortableHeader>,
      cell: ({ row }) =>
        isUnavailableCredential(row.original) ? null : <UsedByCell credential={row.original} />,
    },
    {
      id: 'lastUsedAt',
      accessorFn: credential =>
        isUnavailableCredential(credential) ? '' : (credential.lastUsedAt ?? ''),
      size: 190,
      meta: { title: 'Last used' },
      header: ({ column }) => <SortableHeader column={column}>Last used</SortableHeader>,
      cell: ({ row }) =>
        isUnavailableCredential(row.original) ? null : formatDate(row.original.lastUsedAt),
    },
    {
      id: 'actions',
      size: 80,
      enableResizing: false,
      header: ({ table }) => <ToggleColumnsHeader table={table} />,
      cell: ({ row }) =>
        isUnavailableCredential(row.original) ? (
          actions.canDeleteUnavailable ? (
            <UnavailableActionsCell credential={row.original} onDelete={actions.onDelete} />
          ) : null
        ) : actions.canMaintainCredential(row.original) ? (
          <CredentialActionsCell credential={row.original} {...actions} />
        ) : null,
    },
  ];
}

function UnavailableActionsCell({
  credential,
  onDelete,
}: {
  credential: UnavailableCredential;
  onDelete: (credential: UnavailableCredential) => void;
}) {
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

function UsedByCell({ credential }: { credential: Credential }) {
  const count = credential.usedBy.length;
  if (count === 0) return '—';
  const label = `${count} consumer${count === 1 ? '' : 's'}`;
  return (
    <HoverCard openDelay={200}>
      {/* Enter or Space on the focused button clicks it; that must not open the editor. */}
      <HoverCardTrigger asChild>
        <button
          type='button'
          className='cursor-default'
          onClick={event => {
            event.stopPropagation();
          }}
        >
          {label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align='start'>
        <HoverCardHeader>
          <HoverCardHeaderText>
            <HoverCardHeaderTitle>Used by</HoverCardHeaderTitle>
            <HoverCardHeaderDescription>{label}</HoverCardHeaderDescription>
          </HoverCardHeaderText>
        </HoverCardHeader>
        <HoverCardBody className='pt-4'>
          <CredentialConsumerList
            consumers={credential.usedBy}
            className='max-h-64 overflow-y-auto'
          />
        </HoverCardBody>
      </HoverCardContent>
    </HoverCard>
  );
}
