import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import { OWOX_API_KEY_AUTH_EXTENSION } from '../openapi/authentication.openapi';

export const REJECT_API_KEY_AUTH_METADATA = 'rejectApiKeyAuth';

export const RejectApiKeyAuth = () =>
  applyDecorators(
    SetMetadata(REJECT_API_KEY_AUTH_METADATA, true),
    ApiExtension(OWOX_API_KEY_AUTH_EXTENSION, false)
  );
