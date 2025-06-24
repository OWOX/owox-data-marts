import { Button } from '@owox/ui/components/button';
import { ArrowRight, Trash2 } from 'lucide-react';
import { DataMartConnectorView } from '../../../../data-marts/edit/components/DataMartConnectorView.tsx';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig, ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { getStorageDisplayName } from './connector-definition.helpers';

interface ConnectorConfigurationItemProps {
  configIndex: number;
  connectorDef: ConnectorDefinitionConfig;
  storageType: DataStorageType;
  onRemoveConfiguration: (configIndex: number) => void;
  onUpdateConfiguration: (configIndex: number) => (connector: ConnectorConfig) => void;
}

export function ConnectorConfigurationItem({
  configIndex,
  connectorDef,
  storageType,
  onRemoveConfiguration,
  onUpdateConfiguration,
}: ConnectorConfigurationItemProps) {
  return (
    <div className='space-y-3 rounded-lg border bg-gray-50 p-4'>
      <div className='flex items-center justify-between'>
        <div></div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => {
            onRemoveConfiguration(configIndex);
          }}
          className='text-red-600 hover:bg-red-50 hover:text-red-700 disabled:text-gray-400'
        >
          <Trash2 className='h-4 w-4' />
        </Button>
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
          <div className='hover:border-primary/50 min-h-[80px] rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors'>
            <div className='flex items-center justify-between'>
              <div className='flex min-w-0 flex-1 flex-col'>
                <div className='truncate font-medium text-gray-900'>
                  {connectorDef.connector.source.name || 'Connector'}
                </div>
                <div className='mt-1 truncate text-sm text-gray-500'>
                  {connectorDef.connector.source.node || 'No node selected'}
                </div>
              </div>
              <div className='ml-4 flex items-center gap-2'>
                <div className='text-sm font-medium text-gray-700'>
                  {connectorDef.connector.source.fields.length.toString()}
                </div>
                <div className='text-xs text-gray-500'>fields</div>
                <ArrowRight className='ml-2 h-4 w-4 text-gray-400' />
              </div>
            </div>
          </div>
        </DataMartConnectorView>

        <div className='min-h-[80px] rounded-lg border border-gray-200 bg-white p-4 shadow-sm'>
          <div className='flex h-full flex-col justify-center'>
            <div className='font-medium text-gray-900'>{getStorageDisplayName(storageType)}</div>
            <div className='mt-1 text-sm text-gray-500'>
              <div className='flex gap-2'>
                <div className='text-sm'>
                  {storageType === DataStorageType.GOOGLE_BIGQUERY ? 'Dataset' : 'Database'}:
                </div>
                <div className='text-sm font-medium text-gray-700'>
                  {connectorDef.connector.storage.fullyQualifiedName.split('.')[0]}
                </div>
                <div className='ml-4 text-sm'>
                  {storageType === DataStorageType.GOOGLE_BIGQUERY ? 'Table' : 'Table'}:
                </div>
                <div className='text-sm font-medium text-gray-700'>
                  {connectorDef.connector.storage.fullyQualifiedName.split('.')[1]}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
