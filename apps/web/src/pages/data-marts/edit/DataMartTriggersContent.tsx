import { useState, useCallback } from 'react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardHeaderActions,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../shared/components/CollapsibleCard';
import { Button } from '@owox/ui/components/button';
import { CalendarClock, Plus } from 'lucide-react';
import { ScheduledTriggerFormSheet } from '../../../features/data-marts/scheduled-triggers';
import {
  ScheduledTriggerList,
  ScheduledTriggerProvider,
} from '../../../features/data-marts/scheduled-triggers';
import { useDataMartContext } from '../../../features/data-marts/edit/model';
import { ConnectorContextProvider } from '../../../features/connectors/shared/model/context';

export default function DataMartTriggersContent() {
  const { dataMart } = useDataMartContext();
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);

  const handleOpenFormSheet = useCallback(() => {
    setIsFormSheetOpen(true);
  }, []);

  const handleCloseFormSheet = useCallback(() => {
    setIsFormSheetOpen(false);
  }, []);

  return (
    <CollapsibleCard>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={CalendarClock}
          tooltip='Time triggers allow you to schedule Data Mart runs at specific times'
        >
          Time triggers
        </CollapsibleCardHeaderTitle>
        <CollapsibleCardHeaderActions>
          <Button variant='outline' onClick={handleOpenFormSheet} aria-label='Add new trigger'>
            <Plus className='h-4 w-4' aria-hidden='true' />
            Add Trigger
          </Button>
        </CollapsibleCardHeaderActions>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        <ConnectorContextProvider>
          <ScheduledTriggerProvider>
            {dataMart && (
              <>
                <ScheduledTriggerList dataMartId={dataMart.id} />
                <ScheduledTriggerFormSheet
                  isOpen={isFormSheetOpen}
                  onClose={handleCloseFormSheet}
                  dataMartId={dataMart.id}
                />
              </>
            )}
          </ScheduledTriggerProvider>
        </ConnectorContextProvider>
      </CollapsibleCardContent>
      <CollapsibleCardFooter></CollapsibleCardFooter>
    </CollapsibleCard>
  );
}
