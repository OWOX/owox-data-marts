import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { useInsights } from '../model';

/**
 * Empty state component for insights.
 * @constructor
 */
export const InsightsEmptyState = () => {
  const navigate = useNavigate();
  const { createInsight, createInsightWithAi, insightLoading } = useInsights();

  const handleCreateInsight = () => {
    void (async () => {
      const created = await createInsight({ title: 'Untitled insight' });
      if (created) {
        void navigate(created.id);
      }
    })();
  };

  const handleCreateInsightWithAi = () => {
    void (async () => {
      const created = await createInsightWithAi();
      if (created) {
        void navigate(created.id);
      }
    })();
  };

  return (
    <Empty>
      <EmptyHeader className='max-w-xl'>
        <EmptyMedia variant='icon'>
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>Create your first Insight</EmptyTitle>
        <EmptyDescription>
          Create an Insight to prompt your Data Mart and discover the story behind your data.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className='max-w-xl'>
        <div className='flex w-full items-center justify-center gap-4'>
          <Button onClick={handleCreateInsightWithAi} disabled={insightLoading}>
            <Sparkles className='h-4 w-4' />
            Generate Insight with AI
          </Button>
          <Button variant='outline' onClick={handleCreateInsight} disabled={insightLoading}>
            <Plus className='h-4 w-4' />
            Blank Insight
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
};

export default InsightsEmptyState;
