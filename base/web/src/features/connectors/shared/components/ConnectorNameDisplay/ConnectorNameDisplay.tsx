import { useConnector } from '../../model/hooks/useConnector.ts';
import type { ConnectorConfig } from '../../../../data-marts/edit';
import { getConnectorDisplayName } from '../../utils';

interface ConnectorNameDisplayProps {
  connector: ConnectorConfig;
}

/**
 * Inner component that uses the connector context
 */
function ConnectorNameDisplayInner({ connector }: ConnectorNameDisplayProps) {
  const { connectors } = useConnector();
  const displayName = getConnectorDisplayName(connector, connectors);
  return <>{displayName}</>;
}

/**
 * Component to display a connector name using its display name when available
 * Wrapped with ConnectorContextProvider to ensure context is available
 */
export function ConnectorNameDisplay({ connector }: ConnectorNameDisplayProps) {
  return <ConnectorNameDisplayInner connector={connector} />;
}
