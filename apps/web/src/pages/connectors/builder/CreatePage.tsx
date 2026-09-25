import { useNavigate } from 'react-router';
import { ConnectorBuilderRoute } from './ConnectorBuilderRoute';
export default function ConnectorBuilderCreatePage() {
  const navigate = useNavigate();
  return (
    <ConnectorBuilderRoute
      onBack={() => void navigate(-1)}
      // After the first Save draft creates the connector, swap the URL
      // /connectors/builder/new → /connectors/builder/:id (path-relative so the
      // project scope prefix is preserved). replace keeps Back working naturally.
      onCreated={id => void navigate(`../${id}`, { replace: true, relative: 'path' })}
    />
  );
}
