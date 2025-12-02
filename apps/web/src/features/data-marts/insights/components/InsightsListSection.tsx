import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
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
import InsightsEmptyState from './InsightsEmptyState';
import { InsightsTable } from './InsightsTable/InsightsTable';

export default function InsightsListSection() {
  const navigate = useNavigate();
  const { fetchInsights, deleteInsight, createInsight, insightLoading } = useInsights();
  const { insights, isLoading, error, hasInsights } = useInsightsList();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  const handleRowClick = (id: string) => {
    void navigate(id);
  };

  const handleCreateClick = () => {
    void (async () => {
      const created = await createInsight({ title: 'Untitled insight' });
      if (created) {
        void navigate(created.id);
      }
    })();
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
            <Button
              variant='outline'
              aria-label='Add new insight'
              disabled={insightLoading}
              onClick={handleCreateClick}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              New insight
            </Button>
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
