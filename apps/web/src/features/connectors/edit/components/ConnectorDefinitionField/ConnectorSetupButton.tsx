import { Button } from '@owox/ui/components/button';
import { Server, ChevronRight } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface ConnectorSetupButtonProps {
  storageType: DataStorageType;
  onSetupConnector: (connector: ConnectorConfig) => void;
}

export function ConnectorSetupButton({ storageType, onSetupConnector }: ConnectorSetupButtonProps) {
  return (
    <div className='space-y-4'>
      <DataMartConnectorView
        dataStorageType={storageType}
        onSubmit={onSetupConnector}
        configurationOnly={false}
      >
        <Button
          type='button'
          variant='outline'
          className='flex h-24 w-full items-center justify-center gap-2 rounded-md border-0 border-b border-gray-200 bg-white shadow-none hover:bg-white hover:shadow-xs dark:bg-white/2'
        >
          <div className='text-foreground flex h-7 w-7 items-center justify-center rounded-sm bg-gray-200/50 transition-colors duration-200 group-hover:bg-gray-200/75 dark:bg-white/8 dark:group-hover:bg-white/10'>
            <Server className='h-4 w-4' strokeWidth={2.25} />
          </div>
          <span>Setup Connector</span>
          <ChevronRight className='h-6 w-6' />
        </Button>
      </DataMartConnectorView>
    </div>
  );
}
