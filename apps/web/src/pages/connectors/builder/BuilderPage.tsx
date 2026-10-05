import { useLocation, useNavigate, useParams } from 'react-router';
import type { BuilderEntryPoint } from '../../../features/connector-builder/create/ConnectorBuilderPage';
import { ConnectorBuilderRoute } from './ConnectorBuilderRoute';

/** The last path segment that opens the builder on a connector that does not exist yet. */
export const NEW_CONNECTOR_SEGMENT = 'new';

const ENTRY_POINTS: readonly BuilderEntryPoint[] = ['connectors_list', 'data_mart_wizard'];

/** The entry point a link into the builder put in the navigation state, if it is a known one. */
function entryPointOf(state: unknown): BuilderEntryPoint | undefined {
  const value = (state as { builderEntryPoint?: unknown } | null)?.builderEntryPoint;
  return ENTRY_POINTS.find(entryPoint => entryPoint === value);
}

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
  const location = useLocation();
  return (
    <ConnectorBuilderRoute
      id={id === NEW_CONNECTOR_SEGMENT ? undefined : id}
      entryPoint={entryPointOf(location.state)}
      onBack={() => void navigate(-1)}
      // Path-relative so the project scope prefix is preserved; replace keeps Back working.
      onCreated={created => void navigate(`../${created}`, { replace: true, relative: 'path' })}
    />
  );
}
