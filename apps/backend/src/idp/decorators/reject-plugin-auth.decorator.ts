import { SetMetadata } from '@nestjs/common';

export const REJECT_PLUGIN_AUTH_METADATA = 'rejectPluginAuth';

/** Prevent a plugin runtime token from calling an endpoint, or every endpoint of a controller. */
export const RejectPluginAuth = () => SetMetadata(REJECT_PLUGIN_AUTH_METADATA, true);

/** Re-admit a plugin runtime token on one handler of a controller that refuses it at class level. */
export const AllowPluginAuth = () => SetMetadata(REJECT_PLUGIN_AUTH_METADATA, false);
