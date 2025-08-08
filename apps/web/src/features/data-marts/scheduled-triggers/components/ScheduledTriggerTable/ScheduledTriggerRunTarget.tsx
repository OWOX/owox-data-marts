import { Info } from 'lucide-react';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ReportHoverCard } from '../../../reports/shared/components/ReportHoverCard';
import { ConnectorHoverCard } from '../../../reports/shared/components/ConnectorHoverCard';
import { ConnectorNameDisplay } from '../../../reports/shared/components/ConnectorNameDisplay';
import { isConnectorDefinition } from '../../../../connectors/edit/components/ConnectorDefinitionField/connector-definition.helpers';

/**
 * Renders the target for a report run trigger
 */
function renderReportRunTarget(trigger: ScheduledTrigger) {
  if (!trigger.triggerConfig) return null;

  const config = trigger.triggerConfig;
  return (
    <div className='inline gap-1'>
      {config.report.title}
      <ReportHoverCard report={config.report}>
        <Info className='ml-1 inline-block h-4 w-4 align-text-bottom opacity-0 transition-opacity duration-200 group-hover:opacity-100' />
      </ReportHoverCard>
    </div>
  );
}

/**
 * Renders the target for a connector run trigger
 */
function renderConnectorRunTarget(trigger: ScheduledTrigger) {
  if (!trigger.dataMart?.definition || !isConnectorDefinition(trigger.dataMart.definition)) {
    return <div className='text-muted-foreground text-sm'>Connector Run</div>;
  }

  const connector = trigger.dataMart.definition.connector;
  return (
    <div className='inline gap-1'>
      <ConnectorNameDisplay connector={connector} />
      <ConnectorHoverCard connector={connector}>
        <Info className='ml-1 inline-block h-4 w-4 align-text-bottom opacity-0 transition-opacity duration-200 group-hover:opacity-100' />
      </ConnectorHoverCard>
    </div>
  );
}

/**
 * Main component that renders the appropriate target based on trigger type
 */
export function ScheduledTriggerRunTarget({ trigger }: { trigger: ScheduledTrigger }) {
  switch (trigger.type) {
    case ScheduledTriggerType.REPORT_RUN:
      return renderReportRunTarget(trigger);
    case ScheduledTriggerType.CONNECTOR_RUN:
      return renderConnectorRunTarget(trigger);
    default:
      return <div className='text-muted-foreground text-sm'>—</div>;
  }
}
