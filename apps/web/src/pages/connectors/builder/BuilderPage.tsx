import { useNavigate, useParams } from 'react-router';
import { ConnectorBuilderRoute } from './ConnectorBuilderRoute';

/** The last path segment that opens the builder on a connector that does not exist yet. */
export const NEW_CONNECTOR_SEGMENT = 'new';

/**
 * /connectors/builder/new and /connectors/builder/:id, served by ONE route.
 *
 * The first Save draft of a new connector swaps /new for /:id. As two routes they were two
 * elements, so the swap unmounted the builder and dropped its test results, test inputs and
 * sample; one route keeps the same builder mounted through it.
 */
export default function ConnectorBuilderRoutePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <ConnectorBuilderRoute
      id={id === NEW_CONNECTOR_SEGMENT ? undefined : id}
      onBack={() => void navigate(-1)}
      // Path-relative so the project scope prefix is preserved; replace keeps Back working.
      onCreated={created => void navigate(`../${created}`, { replace: true, relative: 'path' })}
    />
  );
}
