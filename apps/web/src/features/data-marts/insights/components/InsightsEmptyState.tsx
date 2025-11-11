import { Brain, ArrowUpRightIcon } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';

/**
 * Empty state component for insights.
 * @constructor
 */
export const InsightsEmptyState = () => {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Brain />
        </EmptyMedia>
        <EmptyTitle>No Insights Yet</EmptyTitle>
        <EmptyDescription>
          You haven't created any insights yet. Get started by creating your first insight.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className='flex gap-2'>
          <Button>Create Insight</Button>
        </div>
      </EmptyContent>
      <Button variant='link' asChild className='text-muted-foreground' size='sm'>
        <a href='#'>
          Learn More <ArrowUpRightIcon />
        </a>
      </Button>
    </Empty>
  );
};

export default InsightsEmptyState;
