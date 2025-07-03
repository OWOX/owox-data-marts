import { Button } from '@owox/ui/components/button';
import { Trash2, Info } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig, ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { getStorageDisplayName } from './connector-definition.helpers';
import { ListItemCard } from '../../../../../shared/components/ListItemCard';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartStatus } from '../../../../data-marts/shared/enums/data-mart-status.enum';

interface ConnectorConfigurationItemProps {
  configIndex: number;
  connectorDef: ConnectorDefinitionConfig;
  storageType: DataStorageType;
  onRemoveConfiguration: (configIndex: number) => void;
  onUpdateConfiguration: (configIndex: number) => (connector: ConnectorConfig) => void;
  dataMartStatus: DataMartStatus;
  totalConfigurations: number;
}

export function ConnectorConfigurationItem({
  configIndex,
  connectorDef,
  storageType,
  onRemoveConfiguration,
  onUpdateConfiguration,
  dataMartStatus,
  totalConfigurations,
}: ConnectorConfigurationItemProps) {
  const dataStorageInfo = DataStorageTypeModel.getInfo(storageType);

  const getConnectorSubtitle = () => {
    const node = connectorDef.connector.source.node || 'No node selected';
    return (
      <div className='flex flex-wrap gap-2'>
        <span>
          <span className='font-semibold'>Node:</span> <span className='text-primary'>{node}</span>
        </span>
      </div>
    );
  };

  const getStorageSubtitle = () => {
    const [dataset, table] = connectorDef.connector.storage.fullyQualifiedName.split('.');
    const datasetLabel = storageType === DataStorageType.GOOGLE_BIGQUERY ? 'Dataset' : 'Database';
    const tableLabel = 'Table';

    return (
      <div className='flex flex-wrap gap-2'>
        <span>
          <span className='font-semibold'>{datasetLabel}:</span>{' '}
          <span className='text-muted-foreground'>{dataset}</span>
        </span>
        <span className='text-muted-foreground'>•</span>
        <span>
          <span className='font-semibold'>{tableLabel}:</span>{' '}
          <span className='text-muted-foreground'>{table}</span>
        </span>
      </div>
    );
  };

  const getConnectorRightContent = () => {
    const fieldsCount = connectorDef.connector.source.fields.length;
    const fields = connectorDef.connector.source.fields;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className='text-muted-foreground/75 dark:text-muted-foreground/50 flex cursor-help items-center gap-1 text-sm'>
            Fields: {fieldsCount}
            <Info className='h-3 w-3' />
          </div>
        </TooltipTrigger>
        <TooltipContent side='left' className='max-w-sm'>
          <div className='space-y-1'>
            <div className='text-sm font-semibold'>Selected fields ({fieldsCount}):</div>
            <div className='scrollbar-thin max-h-48 overflow-y-auto'>
              {fields.length > 0 ? (
                <ul className='space-y-0.5 text-xs'>
                  {fields.map((field, index) => (
                    <li key={index} className='truncate'>
                      • {field}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className='text-muted-foreground text-xs'>No fields selected</div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const canRemoveConfiguration = () => {
    // Can't remove the last configuration in published pipeline
    if (dataMartStatus === DataMartStatus.PUBLISHED && totalConfigurations === 1) {
      return false;
    }
    return true;
  };

  return (
    <div className='bg-muted/50 space-y-3 rounded-lg border p-4 dark:bg-white/4'>
      <div className='flex items-center justify-between'>
        <div></div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  if (canRemoveConfiguration()) {
                    onRemoveConfiguration(configIndex);
                  }
                }}
                disabled={!canRemoveConfiguration()}
                className='disabled:text-muted-foreground/50 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50'
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          </TooltipTrigger>
          {!canRemoveConfiguration() && (
            <TooltipContent>
              Cannot remove the last configuration in published pipeline
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <DataMartConnectorView
          dataStorageType={storageType}
          onSubmit={onUpdateConfiguration(configIndex)}
          configurationOnly={true}
          existingConnector={{
            source: {
              ...connectorDef.connector.source,
              configuration: [connectorDef.connector.source.configuration[configIndex]],
            },
            storage: connectorDef.connector.storage,
          }}
        >
          <ListItemCard
            title={connectorDef.connector.source.name || 'Connector'}
            subtitle={getConnectorSubtitle()}
            className='min-h-[80px] cursor-pointer transition-colors'
            rightContent={getConnectorRightContent()}
          />
        </DataMartConnectorView>

        <ListItemCard
          title={getStorageDisplayName(storageType)}
          icon={dataStorageInfo.icon}
          subtitle={getStorageSubtitle()}
          className='bg-background min-h-[80px] cursor-default border-0 hover:shadow-none dark:bg-white/4'
        />
      </div>
    </div>
  );
}
