import { Play } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useDataMartContext } from '../../model';
import type { ConnectorDefinitionConfig } from '../../model';
import { DataMartDefinitionType, DataMartStatus } from '../../../shared';
import { isConnectorConfigured } from '../../../../connectors/edit/components/ConnectorDefinitionField';
import { ConnectorRunView } from '../../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView';
import type { ConnectorRunFormData } from '../../../../connectors/shared/model/types/connector';

/**
 * Starts a manual run of a published connector Data Mart.
 * Rendered in the Input Source card header, so it stays reachable while the card is collapsed.
 * Renders nothing until the connector is configured; disabled with a reason while the Data Mart
 * is a draft or a run is in progress, like the Manual Run item in the Data Mart menu.
 */
export function ConnectorManualRunButton() {
  const { dataMart, runDataMart, hasActiveRuns } = useDataMartContext();

  if (
    dataMart?.definitionType !== DataMartDefinitionType.CONNECTOR ||
    !dataMart.definition ||
    !isConnectorConfigured(dataMart.definition as ConnectorDefinitionConfig)
  ) {
    return null;
  }

  const isDraft = dataMart.status.code === DataMartStatus.DRAFT;
  const disabledReason = hasActiveRuns
    ? 'Please wait for the current run to complete.'
    : isDraft
      ? 'Manual run is available only for published Data Marts.'
      : null;

  const handleManualRun = (data: ConnectorRunFormData) => {
    void runDataMart({
      id: dataMart.id,
      payload: { runType: data.runType, data: data.data },
    });
  };

  const button = (
    <Button type='button' variant='outline' size='sm' disabled={disabledReason !== null}>
      <Play className='h-4 w-4' />
      <span>Manual Run</span>
    </Button>
  );

  if (disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{button}</div>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <ConnectorRunView
      configuration={dataMart.definition as ConnectorDefinitionConfig}
      onManualRun={handleManualRun}
    >
      {button}
    </ConnectorRunView>
  );
}
