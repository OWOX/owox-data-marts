import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus, ChevronDown } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardHeaderActions,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useInsights, useInsightsList } from '../model';
import { useInsightsPermissions } from '../hooks/useInsightsPermissions';
import InsightsEmptyState from './InsightsEmptyState';
import { InsightsTable } from './InsightsTable/InsightsTable';
import { NO_PERMISSION_MESSAGE } from '../../../../app/permissions';

export default function InsightsListSection() {
  const navigate = useNavigate();
  const {
    fetchInsights,
    deleteInsight,
    insightLoading,
    handleCreateInsight,
    handleCreateInsightWithAi,
  } = useInsights();
  const { insights, isLoading, error, hasInsights } = useInsightsList();
  const { canCreate, canGenerateAI } = useInsightsPermissions();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  const handleRowClick = (id: string) => {
    void navigate(id);
  };

  const handleConfirmDelete = () => {
    void (async () => {
      if (deleteId) {
        try {
          await deleteInsight(deleteId);
        } finally {
          setDeleteId(null);
        }
      }
    })();
  };

  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle tooltip='Manage and review your insights' icon={Sparkles}>
          Insights
        </CollapsibleCardHeaderTitle>
        {hasInsights && (
          <CollapsibleCardHeaderActions>
            <div className='inline-flex -space-x-px'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='inline-flex'>
                    <Button
                      variant='outline'
                      className='rounded-r-none'
                      onClick={() => void handleCreateInsight()}
                      disabled={insightLoading || !canCreate}
                    >
                      <Plus className='h-4 w-4' aria-hidden='true' />
                      New insight
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='outline'
                    className='rounded-l-none px-2'
                    aria-label='More options'
                    disabled={insightLoading}
                  >
                    <ChevronDown className='h-4 w-4' aria-hidden='true' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='w-full'>
                        <DropdownMenuItem
                          onClick={() => void handleCreateInsightWithAi()}
                          disabled={insightLoading || !canGenerateAI}
                        >
                          <Sparkles className='h-4 w-4' aria-hidden='true' />
                          Generate insight with AI
                        </DropdownMenuItem>
                      </div>
                    </TooltipTrigger>
                    {!canGenerateAI && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='w-full'>
                        <DropdownMenuItem
                          onClick={() => void handleCreateInsight()}
                          disabled={insightLoading || !canCreate}
                        >
                          <Plus className='h-4 w-4' aria-hidden='true' />
                          Blank insight
                        </DropdownMenuItem>
                      </div>
                    </TooltipTrigger>
                    {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                  </Tooltip>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CollapsibleCardHeaderActions>
        )}
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        {isLoading && !hasInsights ? (
          <div className='text-muted-foreground p-4 text-sm'>Loading insights…</div>
        ) : error ? (
          <div className='text-destructive p-4 text-sm'>Failed to load insights</div>
        ) : hasInsights ? (
          <InsightsTable
            items={insights.map(r => ({
              id: r.id,
              title: r.title,
              lastRun: r.outputUpdatedAt,
            }))}
            onRowClick={handleRowClick}
            onDelete={id => {
              setDeleteId(id);
            }}
          />
        ) : (
          <InsightsEmptyState />
        )}

        <ConfirmationDialog
          open={Boolean(deleteId)}
          onOpenChange={open => {
            if (!open) setDeleteId(null);
          }}
          title='Delete Insight'
          description='Are you sure you want to delete this insight? This action cannot be undone.'
          confirmLabel='Delete'
          cancelLabel='Cancel'
          variant='destructive'
          onConfirm={handleConfirmDelete}
        />
      </CollapsibleCardContent>
      <CollapsibleCardFooter></CollapsibleCardFooter>
    </CollapsibleCard>
  );
}
