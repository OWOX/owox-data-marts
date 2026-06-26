import { SetMetadata } from '@nestjs/common';

export const REJECT_API_KEY_AUTH_METADATA = 'rejectApiKeyAuth';

export const RejectApiKeyAuth = () => SetMetadata(REJECT_API_KEY_AUTH_METADATA, true);
