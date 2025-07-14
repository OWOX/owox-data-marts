import { DialogDescription, DialogTitle } from '@owox/ui/components/dialog';
import { Sheet, SheetContent, SheetHeader } from '@owox/ui/components/sheet';
import type { DataStorageType } from '../../../../data-storage/shared/model/types';
import { ConnectorEditForm } from '../ConnectorEditForm/ConnectorEditForm';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface ConnectorEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataStorageType: DataStorageType;
  onSubmit: (configuredConnector: ConnectorConfig) => void;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
  mode?: 'full' | 'configuration-only' | 'fields-only';
}

export function ConnectorEditSheet({
  isOpen,
  onClose,
  dataStorageType,
  onSubmit,
  configurationOnly = false,
  existingConnector = null,
  mode = 'full',
}: ConnectorEditSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className='flex h-screen min-w-[480px] flex-col'>
        <SheetHeader>
          <DialogTitle>
            {mode === 'fields-only'
              ? 'Edit Fields'
              : existingConnector?.source.name
                ? `Table filled by connector`
                : 'Setup Connector'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'fields-only'
              ? 'Select which fields to include in your data mart'
              : 'Setup your connector to use in your data mart'}
          </DialogDescription>
        </SheetHeader>
        <div className='flex-1 overflow-x-visible overflow-y-auto'>
          <ConnectorEditForm
            onSubmit={configuredConnector => {
              onSubmit(configuredConnector);
              onClose();
            }}
            dataStorageType={dataStorageType}
            configurationOnly={configurationOnly || mode === 'configuration-only'}
            existingConnector={existingConnector}
            mode={mode}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
