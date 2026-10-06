import { useLocation, useParams } from 'react-router';
import { routeFromLocation, usePluginInstallations } from '../../../features/plugins';
import { useProjectRoute } from '../../../shared/hooks';
import PluginDetailsPage from '../detail/PluginDetailsPage';
import { PluginRuntime } from '../runtime/PluginRuntimePage';

export default function PluginOpenPage() {
  const { pluginId = '' } = useParams<{ pluginId: string }>();
  const location = useLocation();
  const { scope } = useProjectRoute();
  const { installations, isLoading } = usePluginInstallations();

  if (isLoading) {
    return (
      <div className='dm-page'>
        <div className='dm-page-content'>Loading…</div>
      </div>
    );
  }

  const openBase = scope(`/plugins/${pluginId}/open`);
  const installation = installations.find(
    item => item.pluginId === pluginId && item.uninstalledAt === null
  );

  if (!installation) {
    return <PluginDetailsPage key={pluginId} installOnOpen />;
  }

  return (
    <PluginRuntime
      key={installation.installationId}
      installationId={installation.installationId}
      initialRoute={routeFromLocation(location, openBase)}
      openBase={openBase}
    />
  );
}
