import { Navigate, useParams } from 'react-router';
import { usePluginInstallations } from '../../../features/plugins';
import { useProjectRoute } from '../../../shared/hooks';

export default function LegacyPluginRunRedirect() {
  const { installationId } = useParams<{ installationId: string }>();
  const { installations, isLoading } = usePluginInstallations(true);
  const { scope } = useProjectRoute();

  if (isLoading) {
    return null;
  }

  const installation = installations.find(item => item.installationId === installationId);
  return (
    <Navigate
      replace
      to={installation ? scope(`/plugins/${installation.pluginId}/open`) : scope('/plugins')}
    />
  );
}
