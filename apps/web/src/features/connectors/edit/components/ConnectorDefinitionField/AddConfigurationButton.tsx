import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { DataMartConnectorView } from '../../../../data-marts/edit/components/DataMartConnectorView.tsx';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface AddConfigurationButtonProps {
  storageType: DataStorageType;
  onAddConfiguration: (newConfig: Record<string, unknown>) => void;
}

export function AddConfigurationButton({
  storageType,
  onAddConfiguration,
}: AddConfigurationButtonProps) {
  return (
    <div className='border-t pt-4'>
      <DataMartConnectorView
        dataStorageType={storageType}
        onSubmit={(connector: ConnectorConfig) => {
          const newConfig = connector.source.configuration[0] || {};
          onAddConfiguration(newConfig);
        }}
        configurationOnly={true}
      >
        <Button
          type='button'
          variant='outline'
          className='hover:border-primary/50 flex h-12 w-full items-center justify-center gap-2 border-1 text-sm'
        >
          <Plus className='h-4 w-4' />
          <span>Add more configuration</span>
        </Button>
      </DataMartConnectorView>
    </div>
  );
}
