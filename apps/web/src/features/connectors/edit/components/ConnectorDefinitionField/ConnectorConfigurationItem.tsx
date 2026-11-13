import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { Pencil, Trash2 } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import type { ConnectorConfig, ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { getStorageDisplayName } from './connector-definition.helpers';
import { getSourceFlowParams, getStorageFlowParams } from './connector-flow.utils';
import { useSheetTabUrl } from '../../../shared/model/hooks/useSheetTabUrl';
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
  onUpdateConfiguration: (
    configIndex: number
  ) => (connector: ConnectorConfig, runAfterSave: boolean) => void;
  dataMartStatus: DataMartStatus;
  totalConfigurations: number;
  dataStorage: DataStorage;
}

const SOURCE_HINT =
  'The connector extracts this data from the source on every run. Use Edit configuration to change what is loaded';

/**
 * One connector configuration shown as a data flow: Source → Storage. Edit sits under
 * the Source details; Delete, a rare action, sits apart on the right.
 * Lays out by its own width (container queries): side by side when wide, stacked when narrow.
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
  const sheetTab = useSheetTabUrl(connectorDef, configIndex);
  const sourceParams = getSourceFlowParams(connectorDef, configIndex, sheetTab);
  const storageParams = getStorageFlowParams(
    dataStorage,
    connectorDef.connector.storage.fullyQualifiedName
  );

  const configurationNumber = configIndex + 1;
  // A connector needs at least one configuration, so the only one shows no Delete.
  const canRemoveConfiguration = totalConfigurations > 1;
  const deleteButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={`Delete configuration ${String(configurationNumber)}`}
          className='text-muted-foreground hover:text-foreground'
          onClick={() => {
            onRemoveConfiguration(configIndex);
          }}
        >
          <Trash2 />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Delete configuration</TooltipContent>
    </Tooltip>
  );
  // The Source/Storage headings label the columns once, on the first configuration only.
  const showRoleHeadings = configIndex === 0;

  return (
    <article
      aria-label={`Configuration ${String(configurationNumber)}`}
      className='bg-muted/70 @container rounded-lg dark:bg-white/4'
    >
      {/* Container queries apply to descendants only, so the row layout lives on this wrapper. */}
      <div className='flex flex-col @2xl:flex-row'>
        <div className='grid min-w-0 flex-1 grid-cols-1 p-2 @2xl:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]'>
          <DataFlowNode
            role='Source'
            showRole={showRoleHeadings}
            roleAddon={<InfoHint text={SOURCE_HINT} />}
            narrowHeaderAction={canRemoveConfiguration ? deleteButton : null}
            icon={<RawBase64Icon base64={bundledConnector?.logoBase64} size={28} />}
            title={bundledTitle ?? customTitle ?? (sourceName || 'Connector')}
          >
            <DataFlowParams primary={sourceParams} />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-label={`Edit configuration ${String(configurationNumber)}`}
              className='text-muted-foreground hover:text-foreground -ml-2 h-8 px-2'
              onClick={() => {
                setIsEditOpen(true);
              }}
            >
              <Pencil />
              Edit configuration
            </Button>
          </DataFlowNode>

          <DataFlowConnector withHeadings={showRoleHeadings} />

          <DataFlowNode
            role='Storage'
            showRole={showRoleHeadings}
            roleAddon={storageParams.hint ? <InfoHint text={storageParams.hint} /> : null}
            icon={<StorageIcon size={28} />}
            title={getStorageDisplayName(dataStorage.type)}
          >
            <DataFlowParams primary={storageParams.primary} secondary={storageParams.secondary} />
          </DataFlowNode>
        </div>

        {/* Wide only: an icon centred on the cards' height, like the chevron (top padding skips
          grid padding 8px, plus the 28px heading row if shown). Narrow: it sits on the Source heading row. */}
        {canRemoveConfiguration && (
          <div
            className={cn(
              'hidden @2xl:flex @2xl:items-center @2xl:pt-2 @2xl:pr-2 @2xl:pb-2',
              showRoleHeadings && '@2xl:pt-9'
            )}
          >
            {deleteButton}
          </div>
        )}
      </div>

      <DataMartConnectorView
        dataStorageType={dataStorage.type}
        fixedDatasetName={dataStorage.owoxStorage?.datasetId}
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
