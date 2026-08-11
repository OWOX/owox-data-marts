import { Input } from '@owox/ui/components/input';
import { SlidersHorizontal } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { InfoLabel } from './fields';

export function AdvancedSettingsEditor() {
  const { manifest, setPath } = useBuilder();
  const setRateLimit = (key: 'requests' | 'perSeconds', raw: string) => {
    const num = raw.trim() === '' ? undefined : Number(raw);
    const merged = { ...manifest.rateLimit, [key]: num };
    const requests =
      typeof merged.requests === 'number' && Number.isFinite(merged.requests)
        ? merged.requests
        : undefined;
    const perSeconds =
      typeof merged.perSeconds === 'number' && Number.isFinite(merged.perSeconds)
        ? merged.perSeconds
        : undefined;
    if (requests === undefined && perSeconds === undefined) {
      setPath(['rateLimit'], undefined);
    } else {
      setPath(['rateLimit'], { requests, perSeconds });
    }
  };

  return (
    <div data-testid='advanced-settings-editor'>
      <CollapsibleCard collapsible defaultCollapsed name='connector-advanced'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={SlidersHorizontal}
            tooltip='Request budget & fine-tuning'
          >
            Advanced settings
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2'>
            <label className='flex flex-col'>
              <InfoLabel hint='Maximum number of requests the connector may send within each time window (set in “per seconds”). Use it to stay under the API’s quota and avoid 429 errors. Leave empty for no limit.'>
                Rate limit — requests
              </InfoLabel>
              <Input
                type='number'
                min={1}
                aria-label='Rate limit requests'
                value={manifest.rateLimit?.requests ?? ''}
                onChange={e => {
                  setRateLimit('requests', e.target.value);
                }}
                placeholder='100'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Length of the throttling window in seconds. The connector sends at most the “requests” value per this many seconds — e.g. 100 requests every 60 seconds. Leave empty for no limit.'>
                Rate limit — per seconds
              </InfoLabel>
              <Input
                type='number'
                min={1}
                aria-label='Rate limit window seconds'
                value={manifest.rateLimit?.perSeconds ?? ''}
                onChange={e => {
                  setRateLimit('perSeconds', e.target.value);
                }}
                placeholder='60'
              />
            </label>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
