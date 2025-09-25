import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@owox/ui/components/sheet';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Manual Run</SheetTitle>
        </SheetHeader>
        <ConnectorRunForm configuration={configuration} onClose={onClose} onSubmit={onSubmit} />
      </SheetContent>
    </Sheet>
  );
}
