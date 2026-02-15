import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import type { InsightTemplateEntity } from '../model';
import {
  insightTemplatesService,
  mapInsightTemplateFromDto,
  mapInsightTemplateListFromDto,
} from '../model';

interface InsightTemplateTableItem {
  id: string;
  title: string;
  sourcesCount: number;
  modifiedAt: Date;
}

interface TemplateActionsCellProps {
  id: string;
  canDelete: boolean;
  onDelete: (id: string) => void;
}

function TemplateActionsCell({ id, canDelete, onDelete }: TemplateActionsCellProps) {
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
            aria-label='Template actions'
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
                  <span className='text-red-600'>Delete template</span>
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

export default function InsightTemplatesListView() {
  const navigate = useNavigate();
  const { dataMart } = useDataMartContext();
  const { canCreate, canDelete } = usePermissions();

  const [items, setItems] = useState<InsightTemplateEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!dataMart?.id) return;
    setLoading(true);
    try {
      const response = await insightTemplatesService.getInsightTemplates(dataMart.id);
      setItems(mapInsightTemplateListFromDto(response));
    } catch {
      toast.error('Failed to load insight templates');
    } finally {
      setLoading(false);
    }
  }, [dataMart?.id]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const tableItems = useMemo<InsightTemplateTableItem[]>(
    () =>
      items.map(item => ({
        id: item.id,
        title: item.title,
        sourcesCount: item.sourcesCount ?? item.sources.length,
        modifiedAt: item.modifiedAt,
      })),
    [items]
  );

  const columns = useMemo<ColumnDef<InsightTemplateTableItem>[]>(
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
        accessorKey: 'sourcesCount',
        size: 150,
        meta: { title: 'Sources' },
        header: ({ column }) => <SortableHeader column={column}>Sources</SortableHeader>,
        cell: ({ row }) => (
          <div className='text-muted-foreground text-xs'>Sources: {row.original.sourcesCount}</div>
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
          <TemplateActionsCell
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

  const { table } = useBaseTable<InsightTemplateTableItem>({
    data: tableItems,
    columns,
    storageKeyPrefix: 'data-mart-insight-templates',
    defaultSortingColumn: 'modifiedAt',
    enableRowSelection: false,
  });

  const handleCreate = useCallback(async () => {
    if (!dataMart?.id || creating) return;
    setCreating(true);
    try {
      const dto = await insightTemplatesService.createInsightTemplate(dataMart.id, {
        title: 'Untitled template',
        template: '### Result\n{{table source="main"}}',
        sources: [],
      });
      const insightTemplate = mapInsightTemplateFromDto(dto);
      setItems(prev => [insightTemplate, ...prev]);
      toast.success('Insight template created');
      void navigate(insightTemplate.id);
    } catch {
      toast.error('Failed to create insight template');
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
        toast.success('Template deleted');
      } catch {
        toast.error('Failed to delete template');
      } finally {
        setDeleteId(null);
      }
    })();
  }, [dataMart?.id, deleteId]);

  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={FileText}
          tooltip='Manage deterministic insight templates'
        >
          Insight Templates
        </CollapsibleCardHeaderTitle>
        <CollapsibleCardHeaderActions>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button onClick={() => void handleCreate()} disabled={!canCreate || creating}>
                  <Plus className='h-4 w-4' />
                  New template
                </Button>
              </div>
            </TooltipTrigger>
            {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </CollapsibleCardHeaderActions>
      </CollapsibleCardHeader>

      <CollapsibleCardContent>
        {loading && items.length === 0 ? (
          <div className='text-muted-foreground p-4 text-sm'>Loading templates…</div>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No templates yet</EmptyTitle>
              <EmptyDescription>
                Create your first template and render it with data-table sources.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => void handleCreate()} disabled={!canCreate || creating}>
                <Plus className='h-4 w-4' />
                Create template
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <BaseTable
            tableId='insight-templates-table'
            table={table}
            onRowClick={row => {
              void navigate(row.original.id);
            }}
            ariaLabel='Insight templates'
            paginationProps={{
              displaySelected: false,
            }}
            renderEmptyState={() => (
              <span role='status' aria-live='polite'>
                No insight templates found.
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
          title='Delete template'
          description='Are you sure you want to delete this template? This action cannot be undone.'
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
