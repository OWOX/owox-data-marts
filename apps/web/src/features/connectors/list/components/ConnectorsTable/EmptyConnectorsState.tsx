import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Plug, Plus } from 'lucide-react';
import { NO_PERMISSION_MESSAGE } from '../../../../../app/permissions';

export function EmptyConnectorsState({
  onCreate,
  canCreate,
}: {
  onCreate: () => void;
  canCreate: boolean;
}) {
  return (
    <div className='dm-empty-state'>
      <Plug className='dm-empty-state-ico' strokeWidth={1} />
      <h2 className='dm-empty-state-title'>No custom connectors yet</h2>
      <p className='dm-empty-state-subtitle'>
        Build your own no-code connector to pull data from any API into your data marts.
      </p>
      <Tooltip>
        {/* A disabled button fires no pointer events, so the wrapper is what the tooltip hangs on. */}
        <TooltipTrigger asChild>
          <div className='inline-flex'>
            <Button variant='outline' onClick={onCreate} disabled={!canCreate}>
              <Plus className='h-4 w-4' />
              New connector
            </Button>
          </div>
        </TooltipTrigger>
        {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
      </Tooltip>
    </div>
  );
}
