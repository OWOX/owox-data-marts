import { Express, json } from 'express';
import { PLUGIN_ACTION_LIMITS } from '../plugin-host/constants/plugin-action-limits';

export const PLUGIN_COLLECTIONS_JSON_BODY_LIMIT = '2mb';
const PLUGIN_COLLECTIONS_ROUTE = '/api/plugins/runtime/collections';
const PLUGIN_ACTIONS_ROUTE = '/api/plugins/runtime/actions';
const configuredApps = new WeakSet<Express>();

/**
 * Registers the route-specific JSON parsers for collection documents and for action input.
 *
 * This must run before IDP providers install their default 100 KiB parser. The public
 * helper lets both supported entrypoints do that, while bootstrap calls it as a safe
 * default for embedders that do not pre-register middleware.
 */
export function registerPluginCollectionsBodyParser(app: Express): void {
  if (configuredApps.has(app)) return;
  app.use(PLUGIN_COLLECTIONS_ROUTE, json({ limit: PLUGIN_COLLECTIONS_JSON_BODY_LIMIT }));
  app.use(PLUGIN_ACTIONS_ROUTE, json({ limit: PLUGIN_ACTION_LIMITS.routeBodyLimit }));
  configuredApps.add(app);
}
