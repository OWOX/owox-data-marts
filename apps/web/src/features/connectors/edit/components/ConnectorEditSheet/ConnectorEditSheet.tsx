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
  initialStep?: number;
  preselectedConnector?: string | null;
}

export function ConnectorEditSheet({
  isOpen,
  onClose,
  dataStorageType,
  onSubmit,
  configurationOnly = false,
  existingConnector = null,
  mode = 'full',
  initialStep,
  preselectedConnector,
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
              ? 'Connector Fields'
              : existingConnector?.source.name
                ? `Edit Connector`
                : 'Set Up Connector'}
          </SheetTitle>
          <SheetDescription>
            {mode === 'fields-only'
              ? 'Select fields for your Data Mart'
              : existingConnector?.source.name
                ? 'Update configuration'
                : 'Follow these steps to set it up'}
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
          initialStep={initialStep}
          preselectedConnector={preselectedConnector}
        />
      </SheetContent>
    </Sheet>
  );
}
