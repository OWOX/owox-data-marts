import { ConnectorContextProvider } from '../../../shared/model/context';
import { useState, useEffect } from 'react';
import { ConnectorRunSheet } from './ConnectorRunSheet';
import type {
  ConnectorDefinitionConfig,
  DataMartDefinitionConfig,
} from '../../../../data-marts/edit/model';
import type { ConnectorRunFormData } from '../../../shared/model/types/connector';

interface ConnectorRunViewProps {
  children?: React.ReactNode;
  configuration: DataMartDefinitionConfig | null;
  onManualRun: (data: ConnectorRunFormData) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConnectorRunView({
  children,
  configuration,
  onManualRun,
  open,
  onOpenChange,
}: ConnectorRunViewProps) {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(open ?? false);

  // Sync with external open prop for controlled mode
  useEffect(() => {
    if (open !== undefined) {
      setIsEditSheetOpen(open);
    }
  }, [open]);

  const handleOpenChange = (newOpen: boolean) => {
    setIsEditSheetOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  const handleTriggerClick = () => {
    handleOpenChange(true);
  };

  const handleSubmit = (data: ConnectorRunFormData) => {
    onManualRun(data);
    handleOpenChange(false);
  };

  const renderTrigger = () => {
    if (!children) return null;

    return (
      <div onClick={handleTriggerClick} style={{ cursor: 'pointer' }}>
        {children}
      </div>
    );
  };
  return (
    <>
      {renderTrigger()}
      {isEditSheetOpen && (
        <ConnectorContextProvider>
          <ConnectorRunSheet
            isOpen={isEditSheetOpen}
            onClose={() => {
              handleOpenChange(false);
            }}
            configuration={configuration as ConnectorDefinitionConfig | null}
            onSubmit={handleSubmit}
          />
        </ConnectorContextProvider>
      )}
    </>
  );
}
