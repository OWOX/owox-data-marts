import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardHeaderActions,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useInsights, useInsightsList } from '../model';

export default function InsightsListSection() {
  const { fetchInsights } = useInsights();
  const { insights, isLoading, error, hasInsights } = useInsightsList();

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle tooltip='Manage and review your insights' icon={Brain}>
          Insights
        </CollapsibleCardHeaderTitle>
        <CollapsibleCardHeaderActions>
          <Link to={'new'}>
            <Button variant='outline' aria-label='Add new insight'>
              <Plus className='h-4 w-4' aria-hidden='true' />
              New insight
            </Button>
          </Link>
        </CollapsibleCardHeaderActions>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        <>Insight list</>
      </CollapsibleCardContent>
      <CollapsibleCardFooter></CollapsibleCardFooter>
    </CollapsibleCard>
  );
}
