import toast from 'react-hot-toast';
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
 * Renders nothing until the connector is configured and the Data Mart is published.
 */
export function ConnectorManualRunButton() {
  const { dataMart, runDataMart, hasActiveRuns } = useDataMartContext();

  if (
    dataMart?.definitionType !== DataMartDefinitionType.CONNECTOR ||
    dataMart.status.code === DataMartStatus.DRAFT ||
    !dataMart.definition ||
    !isConnectorConfigured(dataMart.definition as ConnectorDefinitionConfig)
  ) {
    return null;
  }

  const handleManualRun = (data: ConnectorRunFormData) => {
    if (dataMart.status.code !== DataMartStatus.PUBLISHED) {
      toast.error('Manual run is only available for published data marts');
      return;
    }
    void runDataMart({
      id: dataMart.id,
      payload: { runType: data.runType, data: data.data },
    });
  };

  const button = (
    <Button type='button' variant='outline' size='sm' disabled={hasActiveRuns}>
      <Play className='h-4 w-4' />
      <span>Manual Run</span>
    </Button>
  );

  if (hasActiveRuns) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{button}</div>
        </TooltipTrigger>
        <TooltipContent>Please wait for the current run to complete.</TooltipContent>
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
