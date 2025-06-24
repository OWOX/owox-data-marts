import { DialogDescription, DialogTitle } from '@owox/ui/components/dialog';
import { Sheet, SheetContent, SheetHeader } from '@owox/ui/components/sheet';
import type { Connector, DataStorageType } from '../../../../data-storage/shared/model/types';
import { ConnectorEditForm } from '../ConnectorEditForm/ConnectorEditForm';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface ConnectorEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  connector: Connector | null;
  dataStorageType: DataStorageType;
  onSubmit: (configuredConnector: ConnectorConfig) => void;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
}

export function ConnectorEditSheet({
  isOpen,
  onClose,
  connector,
  dataStorageType,
  onSubmit,
  configurationOnly = false,
  existingConnector = null,
}: ConnectorEditSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className='flex h-screen min-w-[480px] flex-col'>
        <SheetHeader>
          <DialogTitle>
            {connector?.name ? `Table filled by connector` : 'Setup Connector'}
          </DialogTitle>
          <DialogDescription>Setup your connector to use in your data mart</DialogDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto'>
          <ConnectorEditForm
            onSubmit={configuredConnector => {
              onSubmit(configuredConnector);
              onClose();
            }}
            dataStorageType={dataStorageType}
            configurationOnly={configurationOnly}
            existingConnector={existingConnector}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
