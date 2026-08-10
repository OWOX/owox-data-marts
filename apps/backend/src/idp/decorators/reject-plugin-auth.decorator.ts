import { SetMetadata } from '@nestjs/common';

export const REJECT_PLUGIN_AUTH_METADATA = 'rejectPluginAuth';

/** Prevent a plugin runtime token from calling an endpoint that returns credentials. */
export const RejectPluginAuth = () => SetMetadata(REJECT_PLUGIN_AUTH_METADATA, true);
