import { Sheet, SheetContent, SheetHeader } from '@owox/ui/components/sheet';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { DialogTitle } from '@owox/ui/components/dialog';
import { ConnectorRunForm } from './ConnectorRunForm';
import type { ConnectorRunFormData } from '../../../shared/model/types/connector';

interface ConnectorRunSheetProps {
  isOpen: boolean;
  onClose: () => void;
  configuration: ConnectorDefinitionConfig | null;
  onSubmit: (data: ConnectorRunFormData) => void;
}

export function ConnectorRunSheet({
  isOpen,
  onClose,
  configuration,
  onSubmit,
}: ConnectorRunSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className='flex h-screen min-w-[480px] flex-col'>
        <SheetHeader>
          <DialogTitle>Connector Run</DialogTitle>
        </SheetHeader>
        <ConnectorRunForm configuration={configuration} onClose={onClose} onSubmit={onSubmit} />
      </SheetContent>
    </Sheet>
  );
}
