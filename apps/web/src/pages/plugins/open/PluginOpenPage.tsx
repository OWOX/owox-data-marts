import { useRef } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { routeFromLocation, usePluginInstallations } from '../../../features/plugins';
import { useProjectRoute } from '../../../shared/hooks';
import PluginDetailsPage from '../detail/PluginDetailsPage';
import { PluginRuntime } from '../runtime/PluginRuntimePage';

export default function PluginOpenPage() {
  const { pluginId = '' } = useParams<{ pluginId: string }>();
  const location = useLocation();
  const { scope } = useProjectRoute();
  const { installations, isLoading } = usePluginInstallations();
  /** The plugin this page last ran: losing its installation is an uninstall, not a visit. */
  const ranPluginIdRef = useRef<string | null>(null);

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
    // Uninstalled while running, from the sidebar's row menu. Offering the install here would
    // answer a question the member did not ask; the plugin's page is where they can install it
    // again.
    if (ranPluginIdRef.current === pluginId) {
      return <Navigate to={scope(`/plugins/${pluginId}`)} replace />;
    }

    // Another plugin's address: forget the last run, so coming back to one that was uninstalled
    // meanwhile offers the install instead of leaving.
    ranPluginIdRef.current = null;
    return <PluginDetailsPage key={pluginId} installOnOpen />;
  }

  ranPluginIdRef.current = pluginId;

  return (
    <PluginRuntime
      key={installation.installationId}
      installationId={installation.installationId}
      initialRoute={routeFromLocation(location, openBase)}
      openBase={openBase}
    />
  );
}
