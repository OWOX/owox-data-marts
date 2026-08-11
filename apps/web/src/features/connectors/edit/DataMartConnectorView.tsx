import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ConnectorEditSheet } from './components/ConnectorEditSheet/ConnectorEditSheet';
import { DataStorageType } from '../../data-storage/shared/model/types';
import type { ConnectorConfig } from '../../data-marts/edit/model';
import { ConnectorContextProvider } from '../shared/model/context';

interface DataMartConnectorViewProps {
  dataStorageType: DataStorageType;
  onSubmit: (configuredConnector: ConnectorConfig) => void;
  children?: ReactNode;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
  preset?: string;
  connectorName?: string | null;
  isOpen?: boolean;
  onClose?: () => void;
}

export const DataMartConnectorView = ({
  dataStorageType,
  onSubmit,
  children,
  configurationOnly = false,
  existingConnector = null,
  preset,
  connectorName,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
}: DataMartConnectorViewProps) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [initialStep, setInitialStep] = useState<number>(1);
  const [preselectedConnector, setPreselectedConnector] = useState<string | undefined>();

  // External open state sync
  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsSheetOpen(externalIsOpen);
    }
  }, [externalIsOpen]);

  // Manual open (trigger button)
  const handleTriggerClick = () => {
    setPreselectedConnector(undefined);
    setInitialStep(1);
    setIsSheetOpen(true);
  };

  const handleClose = () => {
    setIsSheetOpen(false);
    externalOnClose?.();
  };

  // Auto-open logic based on preset.
  // connectorName (below) takes priority when both are present, so this is
  // skipped in that case rather than racing with the connectorName effect.
  useEffect(() => {
    if (!preset || connectorName) return;

    if (preset === 'connector') {
      setPreselectedConnector(undefined);
      setInitialStep(1);
      setIsSheetOpen(true);
    } else {
      setPreselectedConnector(preset);
      setInitialStep(2);
      setIsSheetOpen(true);
    }
  }, [preset, connectorName]);

  // Auto-open logic based on connectorName. Parallel to the preset effect
  // above, but wins when both preset and connectorName are set: connectorName
  // is a precise connector source name (no "connector"-only ambiguity), so it
  // always jumps straight to step 2 pre-selected.
  useEffect(() => {
    if (!connectorName) return;

    setPreselectedConnector(connectorName);
    setInitialStep(2);
    setIsSheetOpen(true);
  }, [connectorName]);

  return (
    <>
      {children && (
        <div onClick={handleTriggerClick} style={{ cursor: 'pointer' }}>
          {children}
        </div>
      )}

      <ConnectorContextProvider>
        <ConnectorEditSheet
          isOpen={isSheetOpen}
          onClose={handleClose}
          dataStorageType={dataStorageType}
          onSubmit={onSubmit}
          configurationOnly={configurationOnly}
          existingConnector={existingConnector}
          initialStep={initialStep}
          preselectedConnector={preselectedConnector}
        />
      </ConnectorContextProvider>
    </>
  );
};
