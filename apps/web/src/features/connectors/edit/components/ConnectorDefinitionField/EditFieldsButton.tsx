import { useState } from 'react';
import { Button } from '../../../../../shared/components/Button';
import { Edit3 } from 'lucide-react';
import { ConnectorEditSheet } from '../ConnectorEditSheet/ConnectorEditSheet';
import { ConnectorContextProvider } from '../../../shared/model/context';
import { DataStorageType } from '../../../../data-storage/shared/model/types';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface EditFieldsButtonProps {
  existingConnector: ConnectorConfig;
  storageType: DataStorageType;
  onUpdateFields: (updatedConnector: ConnectorConfig) => void;
  disabled?: boolean;
}

export function EditFieldsButton({
  existingConnector,
  storageType,
  onUpdateFields,
  disabled = false,
}: EditFieldsButtonProps) {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  const handleUpdateFields = (updatedConnector: ConnectorConfig) => {
    onUpdateFields(updatedConnector);
    setIsEditSheetOpen(false);
  };

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        onClick={() => {
          setIsEditSheetOpen(true);
        }}
        disabled={disabled}
        className='flex items-center gap-2'
      >
        <Edit3 className='h-4 w-4' />
        Edit Fields
      </Button>

      <ConnectorContextProvider>
        <ConnectorEditSheet
          isOpen={isEditSheetOpen}
          onClose={() => {
            setIsEditSheetOpen(false);
          }}
          onSubmit={handleUpdateFields}
          dataStorageType={storageType}
          existingConnector={existingConnector}
          mode='fields-only'
        />
      </ConnectorContextProvider>
    </>
  );
}
