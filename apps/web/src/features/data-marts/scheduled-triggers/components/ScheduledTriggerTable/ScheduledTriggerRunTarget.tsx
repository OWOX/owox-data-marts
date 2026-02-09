import React from 'react';
import { Database, Info } from 'lucide-react';
import { RawBase64Icon } from '../../../../../shared';
import { ConnectorHoverCard, ConnectorNameDisplay } from '../../../../connectors/shared/components';
import { DataDestinationTypeModel } from '../../../../data-destination';
import { ReportHoverCard } from '../../../reports/shared/components/ReportHoverCard';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import type {
  ScheduledConnectorRunConfig,
  ScheduledReportRunConfig,
} from '../../model/trigger-config.types';

/**
 * Renders the target for a report run trigger
 */
function renderReportRunTarget(trigger: ScheduledTrigger) {
  const config = trigger.triggerConfig as ScheduledReportRunConfig;
  const Icon = DataDestinationTypeModel.getInfo(config.report.dataDestination.type).icon;
  return (
    <div className='group inline-flex items-center gap-2 whitespace-nowrap'>
      <Icon className='h-4 w-4' size={16} />
      {config.report.title}
      <ReportHoverCard report={config.report}>
        <Info className='inline-block h-4 w-4 align-text-bottom opacity-0 transition-opacity duration-200 group-hover:opacity-100' />
      </ReportHoverCard>
    </div>
  );
}

/**
 * Renders the target for a connector run trigger
 */
function renderConnectorRunTarget(trigger: ScheduledTrigger) {
  const triggerConfig = trigger.triggerConfig as ScheduledConnectorRunConfig;
  const { connector } = triggerConfig.connector;
  const connectorIcon = connector.info?.logoBase64 ? (
    <RawBase64Icon base64={connector.info.logoBase64} className='h-4 w-4' size={16} />
  ) : (
    <Database className='h-4 w-4' size={16} />
  );
  return (
    <div className='group inline-flex items-center gap-2 whitespace-nowrap'>
      {connectorIcon}
      <ConnectorNameDisplay connector={connector} />
      <ConnectorHoverCard connector={connector}>
        <Info className='inline-block h-4 w-4 align-text-bottom opacity-0 transition-opacity duration-200 group-hover:opacity-100' />
      </ConnectorHoverCard>
    </div>
  );
}

/**
 * Main component that renders the appropriate target based on trigger type
 */
export const ScheduledTriggerRunTarget = React.memo(
  function ScheduledTriggerRunTarget({ trigger }: { trigger: ScheduledTrigger }) {
    switch (trigger.type) {
      case ScheduledTriggerType.REPORT_RUN:
        return renderReportRunTarget(trigger);
      case ScheduledTriggerType.CONNECTOR_RUN:
        return renderConnectorRunTarget(trigger);
      default:
        return <div className='text-muted-foreground text-sm'>—</div>;
    }
  },
  (prevProps, nextProps) => {
    // Only re-render if trigger ID or type changes
    return (
      prevProps.trigger.id === nextProps.trigger.id &&
      prevProps.trigger.type === nextProps.trigger.type
    );
  }
);
