import { Button } from '@owox/ui/components/button';
import { Plug, ChevronRight } from 'lucide-react';
import { DataMartConnectorView } from '../../DataMartConnectorView';
import { DataStorageType } from '../../../../data-storage';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface ConnectorSetupButtonProps {
  storageType: DataStorageType;
  onSetupConnector: (connector: ConnectorConfig) => void;
  preset?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ConnectorSetupButton({
  storageType,
  onSetupConnector,
  preset,
  isOpen,
  onClose,
}: ConnectorSetupButtonProps) {
  return (
    <DataMartConnectorView
      dataStorageType={storageType}
      onSubmit={onSetupConnector}
      configurationOnly={false}
      preset={preset}
      isOpen={isOpen}
      onClose={onClose}
    >
      <Button
        type='button'
        variant='outline'
        className='flex h-24 w-full cursor-pointer items-center justify-center gap-2 border-0 shadow-none dark:border-transparent dark:bg-transparent dark:hover:bg-white/4'
      >
        <div className='text-foreground flex h-7 w-7 items-center justify-center rounded-sm bg-gray-200/50 transition-colors duration-200 group-hover:bg-gray-200/75 dark:bg-white/8 dark:group-hover:bg-white/10'>
          <Plug className='h-4 w-4' strokeWidth={2.25} />
        </div>
        <span>Setup Connector</span>
        <ChevronRight className='h-6 w-6' />
      </Button>
    </DataMartConnectorView>
  );
}
