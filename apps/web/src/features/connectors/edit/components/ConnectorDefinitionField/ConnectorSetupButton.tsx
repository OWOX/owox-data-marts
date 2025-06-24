import { Button } from '@owox/ui/components/button';
import { Database } from 'lucide-react';
import { DataMartConnectorView } from '../../../../data-marts/edit/components/DataMartConnectorView.tsx';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface ConnectorSetupButtonProps {
  storageType: DataStorageType;
  onSetupConnector: (connector: ConnectorConfig) => void;
}

export function ConnectorSetupButton({ storageType, onSetupConnector }: ConnectorSetupButtonProps) {
  return (
    <div className='space-y-4'>
      <div className='text-muted-foreground text-sm font-medium'>Input Source</div>
      <DataMartConnectorView
        dataStorageType={storageType}
        onSubmit={onSetupConnector}
        configurationOnly={false}
      >
        <Button
          type='button'
          variant='outline'
          className='flex h-24 w-full items-center justify-center gap-2 border-1'
        >
          <Database className='h-6 w-6' />
          <span>Setup Connector</span>
        </Button>
      </DataMartConnectorView>
    </div>
  );
}
