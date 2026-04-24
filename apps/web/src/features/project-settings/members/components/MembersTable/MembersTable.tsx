import { useMemo } from 'react';
import type { Row } from '@tanstack/react-table';
import { UserPlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  BaseTable,
  TableColumnSearch,
  TableCTAButton,
} from '../../../../../shared/components/Table';
import { useBaseTable } from '../../../../../shared/hooks/useBaseTable';
import { getMembersColumns, MembersColumnKey, type MembersTableItem } from './columns';
import type {
  ContextDto,
  MemberWithScopeDto,
} from '../../../../../features/contexts/types/context.types';

const ADMIN_ONLY_HINT = 'You need the Project Admin role to manage members.';

interface MembersTableProps {
  members: MemberWithScopeDto[];
  contexts: ContextDto[];
  isAdmin: boolean;
  onRowClick?: (member: MemberWithScopeDto) => void;
  onEditMember?: (userId: string) => void;
  onRemoveMember?: (userId: string) => void;
  onInvite?: () => void;
}

export function MembersTable({
  members,
  contexts,
  isAdmin,
  onRowClick,
  onEditMember,
  onRemoveMember,
  onInvite,
}: MembersTableProps) {
  const data: MembersTableItem[] = useMemo(() => {
    const contextMap = new Map(contexts.map(c => [c.id, c]));
    return members.map(m => ({
      ...m,
      contextsDetailed: m.contextIds
        .map(id => contextMap.get(id))
        .filter((c): c is ContextDto => c !== undefined),
    }));
  }, [members, contexts]);

  const columns = useMemo(
    () => getMembersColumns({ onEdit: onEditMember, onRemove: onRemoveMember, isAdmin }),
    [onEditMember, onRemoveMember, isAdmin]
  );

  const { table } = useBaseTable<MembersTableItem>({
    data,
    columns,
    storageKeyPrefix: 'members-settings',
    enableRowSelection: false,
  });

  const handleRowClick = (row: Row<MembersTableItem>, e: React.MouseEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('[role="checkbox"]') ||
        e.target.closest('button') ||
        e.target.closest('[role="menuitem"]'))
    ) {
      return;
    }
    onRowClick?.(row.original);
  };

  return (
    <div className='dm-card'>
      <BaseTable
        tableId='members-settings-table'
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Project members table'
        paginationProps={{ displaySelected: false }}
        renderToolbarLeft={() => (
          <TableColumnSearch
            table={table}
            columnId={MembersColumnKey.NAME}
            placeholder='Search by name'
          />
        )}
        renderToolbarRight={
          onInvite
            ? () => {
                const button = (
                  <TableCTAButton asChild>
                    <button
                      type='button'
                      onClick={isAdmin ? onInvite : undefined}
                      disabled={!isAdmin}
                      aria-disabled={!isAdmin}
                    >
                      <UserPlus className='h-4 w-4' />
                      <span className='hidden lg:block'>Invite member</span>
                    </button>
                  </TableCTAButton>
                );
                if (isAdmin) return button;
                return (
                  <Tooltip>
                    {/* Span wraps the disabled button so Radix still gets a
                        hoverable target — disabled buttons swallow pointer
                        events on their own. */}
                    <TooltipTrigger asChild>
                      <span className='inline-block'>{button}</span>
                    </TooltipTrigger>
                    <TooltipContent>{ADMIN_ONLY_HINT}</TooltipContent>
                  </Tooltip>
                );
              }
            : undefined
        }
        renderEmptyState={() => (
          <span role='status' aria-live='polite'>
            No members found
          </span>
        )}
      />
    </div>
  );
}
