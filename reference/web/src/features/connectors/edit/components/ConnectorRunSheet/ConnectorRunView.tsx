import { ConnectorContextProvider } from '../../../shared/model/context';
import { useState } from 'react';
import { ConnectorRunSheet } from './ConnectorRunSheet';
import type {
  ConnectorDefinitionConfig,
  DataMartDefinitionConfig,
} from '../../../../data-marts/edit/model';
import type { ConnectorRunFormData } from '../../../shared/model/types/connector';

interface ConnectorRunViewProps {
  children: React.ReactNode;
  configuration: DataMartDefinitionConfig | null;
  onManualRun: (data: ConnectorRunFormData) => void;
  open?: boolean;
}

export function ConnectorRunView({
  children,
  configuration,
  onManualRun,
  open,
}: ConnectorRunViewProps) {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(open ?? false);

  const handleTriggerClick = () => {
    setIsEditSheetOpen(true);
  };

  const handleSubmit = (data: ConnectorRunFormData) => {
    onManualRun(data);
    setIsEditSheetOpen(false);
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
              setIsEditSheetOpen(false);
            }}
            configuration={configuration as ConnectorDefinitionConfig | null}
            onSubmit={handleSubmit}
          />
        </ConnectorContextProvider>
      )}
    </>
  );
}
