import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit';

interface AddConfigurationButtonProps {
  storageType: DataStorageType;
  onAddConfiguration: (newConfig: Record<string, unknown>) => void;
  existingConnector?: ConnectorConfig;
}

export function AddConfigurationButton({
  storageType,
  onAddConfiguration,
  existingConnector,
}: AddConfigurationButtonProps) {
  return (
    <div>
      <DataMartConnectorView
        dataStorageType={storageType}
        onSubmit={(connector: ConnectorConfig) => {
          const newConfig = connector.source.configuration[0] || {};
          onAddConfiguration(newConfig);
        }}
        configurationOnly={true}
        existingConnector={
          existingConnector
            ? {
                source: {
                  ...existingConnector.source,
                  configuration: [],
                },
                storage: existingConnector.storage,
              }
            : undefined
        }
      >
        <Button type='button' variant='outline'>
          <Plus className='h-4 w-4' />
          <span>Configuration</span>
        </Button>
      </DataMartConnectorView>
    </div>
  );
}
