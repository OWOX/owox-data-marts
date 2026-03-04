import { Plus, Sparkles } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { useInsights } from '../model';
import { useInsightsPermissions } from '../hooks/useInsightsPermissions';
import { NO_PERMISSION_MESSAGE } from '../../../../app/permissions';

/**
 * Empty state component for insights.
 * @constructor
 */
export const InsightsEmptyState = () => {
  const { handleCreateInsight, handleCreateInsightWithAi, insightLoading } = useInsights();
  const { canCreate, canGenerateAI } = useInsightsPermissions();

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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='inline-flex'>
                <Button
                  onClick={() => void handleCreateInsightWithAi()}
                  disabled={insightLoading || !canGenerateAI}
                >
                  <Sparkles className='h-4 w-4' />
                  Generate Insight with AI
                </Button>
              </div>
            </TooltipTrigger>
            {!canGenerateAI && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='inline-flex'>
                <Button
                  variant='outline'
                  onClick={() => void handleCreateInsight()}
                  disabled={insightLoading || !canCreate}
                >
                  <Plus className='h-4 w-4' />
                  Blank Insight
                </Button>
              </div>
            </TooltipTrigger>
            {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </div>
      </EmptyContent>
    </Empty>
  );
};

export default InsightsEmptyState;
