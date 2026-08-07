import { Express, json } from 'express';

export const PLUGIN_COLLECTIONS_JSON_BODY_LIMIT = '2mb';
const PLUGIN_COLLECTIONS_ROUTE = '/api/plugins/runtime/collections';
const configuredApps = new WeakSet<Express>();

/**
 * Registers the larger JSON parser only for collection documents.
 *
 * This must run before IDP providers install their default 100 KiB parser. The public
 * helper lets both supported entrypoints do that, while bootstrap calls it as a safe
 * default for embedders that do not pre-register middleware.
 */
export function registerPluginCollectionsBodyParser(app: Express): void {
  if (configuredApps.has(app)) return;
  app.use(PLUGIN_COLLECTIONS_ROUTE, json({ limit: PLUGIN_COLLECTIONS_JSON_BODY_LIMIT }));
  configuredApps.add(app);
}
