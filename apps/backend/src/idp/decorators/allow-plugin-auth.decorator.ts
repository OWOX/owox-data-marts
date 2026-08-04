import { SetMetadata } from '@nestjs/common';

export const ALLOW_PLUGIN_AUTH_METADATA = 'allowPluginAuth';

/**
 * Opens one endpoint to a plugin runtime token. Everything else refuses them.
 *
 * Default-deny is the point: a plugin's authority has to be a list someone wrote, not
 * whatever the app happens to expose. Under the old default-allow, `POST
 * /api/project-member-api-keys` answered a plugin with a fresh API-key secret, which
 * outlives both the runtime token and the installation -- and every endpoint added later
 * would have inherited the same opening silently.
 *
 * Grant this only where a plugin genuinely needs the data, and never on an endpoint that
 * returns a credential or manages plugin publication.
 */
export const AllowPluginAuth = () => SetMetadata(ALLOW_PLUGIN_AUTH_METADATA, true);
