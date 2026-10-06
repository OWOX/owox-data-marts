import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useParams } from 'react-router';
import { PluginPageMessage, pluginsService } from '../../../features/plugins';
import { useProjectId, useProjectRoute } from '../../../shared/hooks';

export default function PluginRepoRedirect() {
  const { owner = '', repo = '' } = useParams();
  const location = useLocation();
  const projectId = useProjectId();
  const { scope } = useProjectRoute();
  const repository = `${owner}/${repo}`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['plugin-lookup', projectId, repository.toLowerCase()],
    queryFn: () => pluginsService.lookupByRepository(repository),
    enabled: Boolean(projectId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return null;
  }

  if (isError || !data) {
    return (
      <PluginPageMessage title="This plugin isn't available here" backHref={scope('/plugins')} />
    );
  }

  // The splat param arrives decoded; the raw path keeps %3F, %2F and %25 in the inner route intact.
  const tail = location.pathname.replace(/^.*?\/plugins\/github\/[^/]*\/[^/]*/i, '');
  return (
    <Navigate
      replace
      to={`${scope(`/plugins/${data.pluginId}`)}${tail}${location.search}${location.hash}`}
    />
  );
}
