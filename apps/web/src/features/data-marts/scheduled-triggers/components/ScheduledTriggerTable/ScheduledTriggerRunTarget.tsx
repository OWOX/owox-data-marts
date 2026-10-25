import React from 'react';
import { Database, FileText, ShieldCheck } from 'lucide-react';
import { RawBase64Icon } from '../../../../../shared';
import { ConnectorHoverCard, ConnectorNameDisplay } from '../../../../connectors/shared/components';
import { useConnector } from '../../../../connectors/shared/model/hooks/useConnector';
import { DataDestinationTypeModel } from '../../../../data-destination';
import {
  ReportHoverCard,
  ReportOpenDocumentAction,
  reportTitleCellQuickActionClassName,
} from '../../../reports/shared/components';
import { ScheduledTriggerType } from '../../enums';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import type {
  ScheduledConnectorRunConfig,
  ScheduledReportRunConfig,
} from '../../model/trigger-config.types';

/**
 * Renders the target for a report run trigger
 */
function renderReportRunTarget(trigger: ScheduledTrigger) {
  const config = trigger.triggerConfig as ScheduledReportRunConfig | undefined;
  if (!config?.report) {
    return (
      <div className='text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden text-sm whitespace-nowrap'>
        <FileText className='h-4 w-4 shrink-0' size={16} />
        <span className='max-w-full flex-1 truncate' title={config?.reportId}>
          Report
        </span>
      </div>
    );
  }

  const Icon = DataDestinationTypeModel.getInfo(config.report.dataDestination.type).icon;
  // Same row-hover quick actions as the Reports tables: the title names the report, the info
  // button opens its details, and the document button opens the Google Sheet it writes into.
  return (
    <div className='inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap'>
      <Icon className='h-4 w-4 shrink-0' size={16} />
      <span className='max-w-full min-w-0 flex-1 truncate' title={config.report.title}>
        {config.report.title}
      </span>
      <div className='flex shrink-0 items-center'>
        <ReportHoverCard report={config.report} className={reportTitleCellQuickActionClassName} />
        <ReportOpenDocumentAction
          report={config.report}
          className={reportTitleCellQuickActionClassName}
        />
      </div>
    </div>
  );
}

/**
 * Renders the target for a connector run trigger
 */
function renderConnectorRunTarget(trigger: ScheduledTrigger, connectors: ConnectorListItem[]) {
  const triggerConfig = trigger.triggerConfig as ScheduledConnectorRunConfig | undefined;
  if (!triggerConfig?.connector) {
    return (
      <div className='text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden text-sm whitespace-nowrap'>
        <Database className='h-4 w-4 shrink-0' size={16} />
        <span className='max-w-full flex-1 truncate'>Connector</span>
      </div>
    );
  }

  const { connector } = triggerConfig.connector;
  const connectorInfo = connectors.find(item => item.name === connector.source.name);
  const connectorLogo = connector.info?.logoBase64 ?? connectorInfo?.logoBase64;
  const connectorIcon = connectorLogo ? (
    <RawBase64Icon base64={connectorLogo} className='h-4 w-4 shrink-0' size={16} />
  ) : (
    <Database className='h-4 w-4' size={16} />
  );
  return (
    <div className='inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap'>
      {connectorIcon}
      <span className='max-w-full min-w-0 flex-1 truncate'>
        <ConnectorNameDisplay connector={connector} />
      </span>
      <ConnectorHoverCard connector={connector} className={reportTitleCellQuickActionClassName} />
    </div>
  );
}

function renderDataQualityRunTarget() {
  return (
    <div className='text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden text-sm whitespace-nowrap'>
      <ShieldCheck className='h-4 w-4 shrink-0' size={16} />
      <span className='max-w-full flex-1 truncate'>Data Quality checks</span>
    </div>
  );
}

/**
 * Main component that renders the appropriate target based on trigger type
 */
export const ScheduledTriggerRunTarget = React.memo(
  function ScheduledTriggerRunTarget({ trigger }: { trigger: ScheduledTrigger }) {
    const { connectors } = useConnector();

    switch (trigger.type) {
      case ScheduledTriggerType.REPORT_RUN:
        return renderReportRunTarget(trigger);
      case ScheduledTriggerType.CONNECTOR_RUN:
        return renderConnectorRunTarget(trigger, connectors);
      case ScheduledTriggerType.DATA_QUALITY_RUN:
        return renderDataQualityRunTarget();
      default:
        return <div className='text-muted-foreground text-sm'>—</div>;
    }
  },
  (prevProps, nextProps) => {
    return (
      prevProps.trigger.id === nextProps.trigger.id &&
      prevProps.trigger.type === nextProps.trigger.type &&
      prevProps.trigger.triggerConfig === nextProps.trigger.triggerConfig
    );
  }
);
