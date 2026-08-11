import { Input } from '@owox/ui/components/input';
import { Checkbox } from '@owox/ui/components/checkbox';
import { GitCompare } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { InfoLabel } from '../fields';

/** Node-level "General" block — identity, output table and the time-series flag. */
export function NodeGeneralEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const node = manifest.nodes[nodeName];

  return (
    <div data-testid='node-general-editor'>
      <CollapsibleCard collapsible name='connector-node-general'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={GitCompare}
            tooltip="This node's identity, output table and response format."
          >
            General
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex flex-col gap-3.5'>
            <label className='flex flex-col'>
              <InfoLabel hint="Shown when picking this node's data in a data mart.">
                Overview
              </InfoLabel>
              <Input
                value={node.overview ?? ''}
                onChange={e => {
                  setPath(['nodes', nodeName, 'overview'], e.target.value || undefined);
                }}
                placeholder="Shown when picking this node's data in a data mart"
                className='h-[34px]'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Name of the table this node writes to. Defaults to the node name.'>
                Destination table name
              </InfoLabel>
              <Input
                value={node.destinationName ?? ''}
                onChange={e => {
                  setPath(['nodes', nodeName, 'destinationName'], e.target.value || undefined);
                }}
                placeholder={nodeName}
                className='h-[34px]'
              />
            </label>
            <label className='text-foreground flex items-center gap-2.5 text-[13px]'>
              <Checkbox
                checked={Boolean(node.isTimeSeries)}
                onCheckedChange={c => {
                  setPath(['nodes', nodeName, 'isTimeSeries'], c === true || undefined);
                }}
                aria-label='Time-series node'
              />
              <span>Time-series node</span>
              <span className='text-muted-foreground text-[11px]'>
                — rows are dated facts (e.g. daily metrics); enables date-based incremental backfill
              </span>
            </label>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
