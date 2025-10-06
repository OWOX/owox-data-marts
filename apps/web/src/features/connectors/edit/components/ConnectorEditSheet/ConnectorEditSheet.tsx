import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import type { DataStorageType } from '../../../../data-storage';
import { ConnectorEditForm } from '../ConnectorEditForm/ConnectorEditForm';
import type { ConnectorConfig } from '../../../../data-marts/edit';
import { useEffect } from 'react';
import {
  raiseIntercomLauncher,
  resetIntercomLauncher,
} from '../../../../../app/intercom/intercomUtils';

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
  useEffect(() => {
    if (isOpen) {
      raiseIntercomLauncher(55);
    } else {
      resetIntercomLauncher();
    }
    return () => {
      resetIntercomLauncher();
    };
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {mode === 'fields-only'
              ? 'Edit Fields'
              : existingConnector?.source.name
                ? `Table filled by connector`
                : 'Connector Setup'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'fields-only'
              ? 'Select which fields to include in your Data Mart'
              : 'Follow these easy steps to configure it'}
          </SheetDescription>
        </SheetHeader>
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
      </SheetContent>
    </Sheet>
  );
}
