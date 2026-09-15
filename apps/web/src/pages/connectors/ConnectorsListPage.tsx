import { useProjectRoute } from '../../shared/hooks/useProjectRoute';
import { useConnectorsList } from '../../features/connectors/list/model/useConnectorsList';
import { ConnectorsTable } from '../../features/connectors/list/components/ConnectorsTable/ConnectorsTable';

export const ConnectorsListPage = () => {
  // Project-scoped navigate: the builder routes live under /ui/:projectId, so a
  // raw useNavigate('/connectors/builder/...') would drop the project prefix and 404.
  const { navigate } = useProjectRoute();
  const { connectors, loading, error, deleteConnector } = useConnectorsList();

  return (
    <div className='dm-page' data-testid='connectorsListPage'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Connectors</h1>
      </header>

      <div className='dm-page-content'>
        {error ? (
          <div className='dm-card text-destructive p-6'>{error}</div>
        ) : loading ? (
          <div className='dm-card text-muted-foreground p-6'>Loading…</div>
        ) : (
          <ConnectorsTable
            data={connectors}
            onOpen={id => {
              navigate(`/connectors/builder/${id}`);
            }}
            onCreate={() => {
              navigate('/connectors/builder/new');
            }}
            onDelete={id => void deleteConnector(id)}
          />
        )}
      </div>
    </div>
  );
};
