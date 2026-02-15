import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderActions,
  CollapsibleCardHeaderTitle,
} from '../../../../shared/components/CollapsibleCard';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import {
  BaseTable,
  SortableHeader,
  ToggleColumnsHeader,
} from '../../../../shared/components/Table';
import { useBaseTable } from '../../../../shared/hooks';
import { useDataMartContext } from '../../edit/model';
import { NO_PERMISSION_MESSAGE, usePermissions } from '../../../../app/permissions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { formatDateShort } from '../../../../utils/date-formatters';
import type { InsightArtifactEntity } from '../model';
import {
  insightArtifactsService,
  mapInsightArtifactFromDto,
  mapInsightArtifactListFromDto,
} from '../model';

interface InsightArtifactTableItem {
  id: string;
  title: string;
  validationStatus: string;
  modifiedAt: Date;
}

interface ArtifactActionsCellProps {
  id: string;
  canDelete: boolean;
  onDelete: (id: string) => void;
}

function ArtifactActionsCell({ id, canDelete, onDelete }: ArtifactActionsCellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div
      className='text-right'
      onClick={e => {
        e.stopPropagation();
      }}
    >
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${
              isMenuOpen ? 'opacity-100' : 'group-hover:opacity-100'
            }`}
            aria-label='Artifact actions'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='end'>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='w-full'>
                <DropdownMenuItem
                  className='text-destructive'
                  onClick={() => {
                    onDelete(id);
                  }}
                  disabled={!canDelete}
                >
                  <Trash2 className='h-4 w-4 text-red-600' />
                  <span className='text-red-600'>Delete artifact</span>
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            {!canDelete && <TooltipContent side='left'>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function InsightArtifactsListView() {
  const navigate = useNavigate();
  const { dataMart } = useDataMartContext();
  const { canCreate, canDelete } = usePermissions();

  const [items, setItems] = useState<InsightArtifactEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadArtifacts = useCallback(async () => {
    if (!dataMart?.id) return;
    setLoading(true);
    try {
      const response = await insightArtifactsService.getInsightArtifacts(dataMart.id);
      setItems(mapInsightArtifactListFromDto(response));
    } catch {
      toast.error('Failed to load insight artifacts');
    } finally {
      setLoading(false);
    }
  }, [dataMart?.id]);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts]);

  const tableItems = useMemo<InsightArtifactTableItem[]>(
    () =>
      items.map(item => ({
        id: item.id,
        title: item.title,
        validationStatus: item.validationStatus === 'VALID' ? 'Valid SQL' : 'SQL has errors',
        modifiedAt: item.modifiedAt,
      })),
    [items]
  );

  const columns = useMemo<ColumnDef<InsightArtifactTableItem>[]>(
    () => [
      {
        accessorKey: 'title',
        size: 320,
        meta: { title: 'Title' },
        header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
        cell: ({ row }) => (
          <div className='overflow-hidden text-ellipsis'>{row.original.title}</div>
        ),
      },
      {
        accessorKey: 'validationStatus',
        size: 200,
        meta: { title: 'Validation' },
        header: ({ column }) => <SortableHeader column={column}>Validation</SortableHeader>,
        cell: ({ row }) => (
          <div className='text-muted-foreground text-xs'>{row.original.validationStatus}</div>
        ),
      },
      {
        accessorKey: 'modifiedAt',
        size: 170,
        sortDescFirst: true,
        meta: { title: 'Updated' },
        header: ({ column }) => <SortableHeader column={column}>Updated</SortableHeader>,
        cell: ({ row }) => (
          <div className='text-muted-foreground'>{formatDateShort(row.original.modifiedAt)}</div>
        ),
      },
      {
        id: 'actions',
        size: 80,
        enableResizing: false,
        header: ({ table }) => <ToggleColumnsHeader table={table} />,
        cell: ({ row }) => (
          <ArtifactActionsCell
            id={row.original.id}
            canDelete={canDelete}
            onDelete={id => {
              setDeleteId(id);
            }}
          />
        ),
      },
    ],
    [canDelete]
  );

  const { table } = useBaseTable<InsightArtifactTableItem>({
    data: tableItems,
    columns,
    storageKeyPrefix: 'data-mart-insight-artifacts',
    defaultSortingColumn: 'modifiedAt',
    enableRowSelection: false,
  });

  const handleCreate = useCallback(async () => {
    if (!dataMart?.id || creating) return;
    setCreating(true);
    try {
      const dto = await insightArtifactsService.createInsightArtifact(dataMart.id, {
        title: 'Untitled artifact',
        sql: 'SELECT * FROM ${DATA_MART_TABLE}',
      });
      const artifact = mapInsightArtifactFromDto(dto);
      setItems(prev => [artifact, ...prev]);
      toast.success('Insight artifact created');
      void navigate(artifact.id);
    } catch {
      toast.error('Failed to create insight artifact');
    } finally {
      setCreating(false);
    }
  }, [creating, dataMart?.id, navigate]);

  const handleConfirmDelete = useCallback(() => {
    void (async () => {
      if (!dataMart?.id || !deleteId) return;

      try {
        await insightArtifactsService.deleteInsightArtifact(dataMart.id, deleteId);
        setItems(prev => prev.filter(item => item.id !== deleteId));
        toast.success('Artifact deleted');
      } catch {
        toast.error('Failed to delete artifact');
      } finally {
        setDeleteId(null);
      }
    })();
  }, [dataMart?.id, deleteId]);

  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={FileCode2} tooltip='Manage SQL sources for templates'>
          Insight Artifacts
        </CollapsibleCardHeaderTitle>
        <CollapsibleCardHeaderActions>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button onClick={() => void handleCreate()} disabled={!canCreate || creating}>
                  <Plus className='h-4 w-4' />
                  New artifact
                </Button>
              </div>
            </TooltipTrigger>
            {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </CollapsibleCardHeaderActions>
      </CollapsibleCardHeader>

      <CollapsibleCardContent>
        {loading && items.length === 0 ? (
          <div className='text-muted-foreground p-4 text-sm'>Loading artifacts…</div>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FileCode2 />
              </EmptyMedia>
              <EmptyTitle>No artifacts yet</EmptyTitle>
              <EmptyDescription>
                Create your first artifact to use it as a source in Insight Templates.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => void handleCreate()} disabled={!canCreate || creating}>
                <Plus className='h-4 w-4' />
                Create artifact
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <BaseTable
            tableId='insight-artifacts-table'
            table={table}
            onRowClick={row => {
              void navigate(row.original.id);
            }}
            ariaLabel='Insight artifacts'
            paginationProps={{
              displaySelected: false,
            }}
            renderEmptyState={() => (
              <span role='status' aria-live='polite'>
                No insight artifacts found.
              </span>
            )}
          />
        )}

        <ConfirmationDialog
          open={Boolean(deleteId)}
          onOpenChange={open => {
            if (!open) {
              setDeleteId(null);
            }
          }}
          title='Delete artifact'
          description='Are you sure you want to delete this artifact? This action cannot be undone.'
          confirmLabel='Delete'
          cancelLabel='Cancel'
          variant='destructive'
          onConfirm={handleConfirmDelete}
        />
      </CollapsibleCardContent>
      <CollapsibleCardFooter />
    </CollapsibleCard>
  );
}
