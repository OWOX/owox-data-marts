import type { RouteObject } from 'react-router';
import { LayoutErrorBoundary } from '../../components/errors';
import PluginDetailsPage from '../../pages/plugins/detail/PluginDetailsPage';
import PluginsGalleryPage from '../../pages/plugins/gallery/PluginsGalleryPage';
import PluginHistoryPage from '../../pages/plugins/history/PluginHistoryPage';
import PluginOpenPage from '../../pages/plugins/open/PluginOpenPage';
import PluginRepoRedirect from '../../pages/plugins/repository/PluginRepoRedirect';
import LegacyPluginRunRedirect from '../../pages/plugins/runtime/LegacyPluginRunRedirect';

/**
 * Project-scoped plugin routes.
 *
 * The plugin page is reachable by direct link on purpose: §1 makes a link its own
 * discovery path, so it resolves even when nothing publishes the plugin to this member.
 */
export const pluginsRoutes: RouteObject[] = [
  {
    path: 'plugins',
    element: <PluginsGalleryPage />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    // Before :pluginId, or the router would read "history" as a plugin id.
    path: 'plugins/history',
    element: <PluginHistoryPage />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    // Before :pluginId, so "github" is never read as a plugin id.
    path: 'plugins/github/:owner/:repo/*',
    element: <PluginRepoRedirect />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'plugins/run/:installationId',
    element: <LegacyPluginRunRedirect />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'plugins/:pluginId/open/*',
    element: <PluginOpenPage />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'plugins/:pluginId',
    element: <PluginDetailsPage />,
    errorElement: <LayoutErrorBoundary />,
  },
];
