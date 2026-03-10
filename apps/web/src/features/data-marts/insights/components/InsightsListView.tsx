import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Plus, Sparkles, Trash2 } from 'lucide-react';
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
import { formatDateShort } from '../../../../utils';
import type { InsightTemplateEntity } from '../model';
import {
  insightTemplatesService,
  mapInsightTemplateFromDto,
  mapInsightTemplateListFromDto,
} from '../model';

interface InsightTableItem {
  id: string;
  title: string;
  sourcesCount: number;
  modifiedAt: Date;
}

interface RowActionsProps {
  id: string;
  canDelete: boolean;
  onDelete: (id: string) => void;
}

function RowActions({ id, canDelete, onDelete }: RowActionsProps) {
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
            aria-label='Insight actions'
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
                  <span className='text-red-600'>Delete insight</span>
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

export default function InsightsListView() {
  const navigate = useNavigate();
  const { dataMart } = useDataMartContext();
  const { canCreate, canDelete } = usePermissions();

  const [items, setItems] = useState<InsightTemplateEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    if (!dataMart?.id) return;
    setLoading(true);
    try {
      const response = await insightTemplatesService.getInsightTemplates(dataMart.id);
      setItems(mapInsightTemplateListFromDto(response));
    } catch {
      toast.error('Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [dataMart?.id]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  const tableItems = useMemo<InsightTableItem[]>(
    () =>
      items.map(item => ({
        id: item.id,
        title: item.title,
        sourcesCount: item.sourcesCount ?? item.sources.length,
        modifiedAt: item.modifiedAt,
      })),
    [items]
  );

  const columns = useMemo<ColumnDef<InsightTableItem>[]>(
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
          <RowActions
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

  const { table } = useBaseTable<InsightTableItem>({
    data: tableItems,
    columns,
    storageKeyPrefix: 'data-mart-insights',
    defaultSortingColumn: 'modifiedAt',
    enableRowSelection: false,
  });

  const handleCreate = useCallback(async () => {
    if (!dataMart?.id || creating) return;
    setCreating(true);
    try {
      const dto = await insightTemplatesService.createInsightTemplate(dataMart.id, {
        title: 'Untitled insight',
      });
      const insight = mapInsightTemplateFromDto(dto);
      setItems(prev => [insight, ...prev]);
      toast.success('Insight created');
      void navigate(insight.id);
    } catch {
      toast.error('Failed to create insight');
    } finally {
      setCreating(false);
    }
  }, [creating, dataMart?.id, navigate]);

  const handleConfirmDelete = useCallback(() => {
    void (async () => {
      if (!dataMart?.id || !deleteId) return;

      try {
        await insightTemplatesService.deleteInsightTemplate(dataMart.id, deleteId);
        setItems(prev => prev.filter(item => item.id !== deleteId));
        toast.success('Insight deleted');
      } catch {
        toast.error('Failed to delete insight');
      } finally {
        setDeleteId(null);
      }
    })();
  }, [dataMart?.id, deleteId]);

  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={Sparkles} tooltip='Manage and review your insights'>
          Insights
        </CollapsibleCardHeaderTitle>
        <CollapsibleCardHeaderActions>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='inline-flex'>
                <Button
                  variant='outline'
                  onClick={() => void handleCreate()}
                  disabled={!canCreate || creating}
                >
                  <Plus className='h-4 w-4' />
                  New insight
                </Button>
              </div>
            </TooltipTrigger>
            {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </CollapsibleCardHeaderActions>
      </CollapsibleCardHeader>

      <CollapsibleCardContent>
        {loading && items.length === 0 ? (
          <div className='text-muted-foreground p-4 text-sm'>Loading insights…</div>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>Create your first Insight</EmptyTitle>
              <EmptyDescription>
                Create insights to build scheduled reports and deliver them to your preferred
                channels (Email, Slack, etc.)
              </EmptyDescription>
            </EmptyHeader>

            <EmptyContent>
              <div className='inline-flex'>
                <Button onClick={() => void handleCreate()}>
                  <Plus className='h-4 w-4' />
                  New Insight
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <BaseTable
            tableId='insights-table'
            table={table}
            onRowClick={row => {
              void navigate(row.original.id);
            }}
            ariaLabel='Insights'
            paginationProps={{
              displaySelected: false,
            }}
            renderEmptyState={() => (
              <span role='status' aria-live='polite'>
                No insights found.
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
          title='Delete insight'
          description='Are you sure you want to delete this insight? This action cannot be undone.'
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
