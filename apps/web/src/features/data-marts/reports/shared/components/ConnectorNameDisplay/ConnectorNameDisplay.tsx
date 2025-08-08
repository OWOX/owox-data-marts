import { useEffect } from 'react';
import { useConnector } from '../../../../../connectors/shared/model/hooks/useConnector';
import { ConnectorContextProvider } from '../../../../../connectors/shared/model/context';
import type { ConnectorConfig } from '../../../../edit/model/types/connector-definition-config';
import { getConnectorDisplayName } from '../ConnectorHoverCard/utils';

interface ConnectorNameDisplayProps {
  connector: ConnectorConfig;
}

/**
 * Inner component that uses the connector context
 */
function ConnectorNameDisplayInner({ connector }: ConnectorNameDisplayProps) {
  const { connectors, fetchAvailableConnectors } = useConnector();

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

  // Get the display name using the utility function
  const displayName = getConnectorDisplayName(connector, connectors);

  return <>{displayName}</>;
}

/**
 * Component to display a connector name using its display name when available
 * Wrapped with ConnectorContextProvider to ensure context is available
 */
export function ConnectorNameDisplay({ connector }: ConnectorNameDisplayProps) {
  return (
    <ConnectorContextProvider>
      <ConnectorNameDisplayInner connector={connector} />
    </ConnectorContextProvider>
  );
}
