import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PLUGIN_AUTH_METADATA = 'requirePluginAuth';

/** Restricts an endpoint to an active plugin runtime token. */
export const RequirePluginAuth = () => SetMetadata(REQUIRE_PLUGIN_AUTH_METADATA, true);
