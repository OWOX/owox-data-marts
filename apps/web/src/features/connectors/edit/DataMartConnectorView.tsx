import { useState } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { ConnectorEditSheet } from './components/ConnectorEditSheet/ConnectorEditSheet';
import { DataStorageType } from '../../data-storage/shared/model/types';
import type { ConnectorConfig } from '../../data-marts/edit/model';
import { ConnectorContextProvider } from '../../data-storage/shared/model/context/connector';

interface DataMartConnectorViewProps {
  dataStorageType: DataStorageType;
  onSubmit: (configuredConnector: ConnectorConfig) => void;
  children?: ReactNode;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
}

export const DataMartConnectorView = ({
  dataStorageType,
  onSubmit,
  children,
  configurationOnly = false,
  existingConnector = null,
}: DataMartConnectorViewProps) => {
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  const handleTriggerClick = () => {
    setIsEditSheetOpen(true);
  };

  const handleClose = () => {
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
      <Toaster />
      {renderTrigger()}
      {isEditSheetOpen && (
        <ConnectorContextProvider>
          <ConnectorEditSheet
            isOpen={isEditSheetOpen}
            onClose={handleClose}
            connector={null}
            dataStorageType={dataStorageType}
            onSubmit={onSubmit}
            configurationOnly={configurationOnly}
            existingConnector={existingConnector}
          />
        </ConnectorContextProvider>
      )}
    </>
  );
};
