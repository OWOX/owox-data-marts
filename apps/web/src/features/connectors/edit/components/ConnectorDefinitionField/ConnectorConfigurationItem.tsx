import { Button } from '@owox/ui/components/button';
import { Pencil, Trash2 } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import type { ConnectorConfig, ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { getStorageDisplayName } from './connector-definition.helpers';
import { getSourceFlowParams, getStorageFlowParams } from './connector-flow.utils';
import { DataFlowNode } from './DataFlow/DataFlowNode';
import { DataFlowConnector } from './DataFlow/DataFlowConnector';
import { DataFlowParams } from './DataFlow/DataFlowParams';
import { InfoHint } from './DataFlow/DataFlowValueActions';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartStatus } from '../../../../data-marts/shared/enums';
import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage';
import { useConnector } from '../../../shared/model/hooks/useConnector';
import { getConnectorInfoByName } from '../../../shared/utils';
import { useEffect, useState } from 'react';
import { RawBase64Icon } from '../../../../../shared/icons';

interface ConnectorConfigurationItemProps {
  configIndex: number;
  connectorDef: ConnectorDefinitionConfig;
  onRemoveConfiguration: (configIndex: number) => void;
  onUpdateConfiguration: (configIndex: number) => (connector: ConnectorConfig) => void;
  dataMartStatus: DataMartStatus;
  totalConfigurations: number;
  dataStorage: DataStorage;
}

// Action buttons are labelled on a narrow container and icon-only on a wide one.
const actionButtonClassName =
  'text-muted-foreground hover:text-foreground h-10 @2xl:size-8 @2xl:p-0';

/**
 * One connector configuration shown as a data flow: Source → Storage, with
 * Edit and Delete actions for the whole configuration. Lays out by its own
 * width (container queries): side by side when wide, stacked when narrow.
 */
export function ConnectorConfigurationItem({
  configIndex,
  connectorDef,
  onRemoveConfiguration,
  onUpdateConfiguration,
  totalConfigurations,
  dataStorage,
}: ConnectorConfigurationItemProps) {
  const { connectors, fetchAvailableConnectors } = useConnector();
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

  // The manifest title ("Google Sheets"), not the technical name ("GoogleSheets").
  // Bundled titles come from the list `useConnector` already loaded; only a source
  // absent from it (a custom connector) needs the project-scoped lookup. The technical
  // name shows until either lands, and stays if the lookup fails.
  const sourceName = connectorDef.connector.source.name;
  const bundledConnector = connectors.find(c => c.name === sourceName);
  const bundledTitle = bundledConnector?.displayName;
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  useEffect(() => {
    if (bundledTitle || connectors.length === 0) return;
    let cancelled = false;
    setCustomTitle(null);
    getConnectorInfoByName(sourceName)
      .then(info => {
        if (!cancelled && info) setCustomTitle(info.displayName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bundledTitle, connectors.length, sourceName]);

  const StorageIcon = DataStorageTypeModel.getInfo(dataStorage.type).icon;
  const sourceParams = getSourceFlowParams(connectorDef, configIndex);
  const storageParams = getStorageFlowParams(
    dataStorage,
    connectorDef.connector.storage.fullyQualifiedName
  );

  const configurationNumber = configIndex + 1;
  // Can't remove the last configuration
  const canRemoveConfiguration = totalConfigurations > 1;

  return (
    <article
      aria-label={`Configuration ${String(configurationNumber)}`}
      className='bg-muted/70 @container rounded-lg dark:bg-white/4'
    >
      <div className='flex flex-col @2xl:flex-row'>
        <div className='grid min-w-0 flex-1 grid-cols-1 p-2 @2xl:grid-cols-[minmax(0,1fr)_44px_minmax(0,1.3fr)]'>
          <DataFlowNode
            role='Source'
            icon={<RawBase64Icon base64={bundledConnector?.logoBase64} size={28} />}
            title={bundledTitle ?? customTitle ?? (sourceName || 'Connector')}
          >
            <DataFlowParams primary={sourceParams} />
          </DataFlowNode>

          <DataFlowConnector />

          <DataFlowNode
            role='Storage'
            roleAddon={storageParams.hint ? <InfoHint text={storageParams.hint} /> : null}
            icon={<StorageIcon size={28} />}
            title={getStorageDisplayName(dataStorage.type)}
          >
            <DataFlowParams primary={storageParams.primary} secondary={storageParams.secondary} />
          </DataFlowNode>
        </div>

        {/* Wide: Edit sits level with the node icons (padding + overline + icon centre = 58px). */}
        <div className='flex justify-end gap-1 pr-2 pb-1 @2xl:flex-col @2xl:justify-start @2xl:pt-[42px] @2xl:pb-3'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                aria-label={`Edit configuration ${String(configurationNumber)}`}
                className={actionButtonClassName}
                onClick={() => {
                  setIsEditOpen(true);
                }}
              >
                <Pencil />
                <span className='@2xl:sr-only'>Edit</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side='left' align='start'>
              Edit connector configuration
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              {/* Disabled buttons emit no pointer events, so the span keeps the tooltip working. */}
              <span>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  aria-label={`Delete configuration ${String(configurationNumber)}`}
                  className={actionButtonClassName}
                  disabled={!canRemoveConfiguration}
                  onClick={() => {
                    onRemoveConfiguration(configIndex);
                  }}
                >
                  <Trash2 />
                  <span className='@2xl:sr-only'>Delete</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side='left' align='start'>
              {canRemoveConfiguration
                ? 'Delete configuration'
                : 'Remove last configuration only after adding a new one.'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <DataMartConnectorView
        dataStorageType={dataStorage.type}
        onSubmit={onUpdateConfiguration(configIndex)}
        configurationOnly={true}
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
        }}
        existingConnector={{
          source: {
            ...connectorDef.connector.source,
            configuration: [connectorDef.connector.source.configuration[configIndex]],
          },
          storage: connectorDef.connector.storage,
        }}
      />
    </article>
  );
}
