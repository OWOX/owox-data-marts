import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { RoleConfig } from '../types/role-config.types';
import { IdpGuard } from '../guards/idp.guard';
import { OWOX_AUTHORIZATION_SECURITY_SCHEME } from '../openapi/authentication.openapi';

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Project Admin',
  editor: 'Technical User',
  viewer: 'Business User',
};

/**
 * Decorator to require authentication and/or authorization for a route
 *
 * @param roleConfig - Role configuration object
 *
 * @example
 * ```typescript
 * import { RoleBuilder, Strategy } from '@owox/idp-protocol';
 *
 * @Auth(RoleBuilder.none())
 * @Get('public')
 * async getPublicData() {
 *   return { data: 'No authentication required' };
 * }
 *
 * @Auth(RoleBuilder.viewer(Strategy.INTROSPECT))
 * @Get('viewer-data')
 * async getViewerData() {
 *   return { data: 'Viewer data with introspect strategy' };
 * }
 *
 * @Auth(RoleBuilder.editor(Strategy.PARSE))
 * @Get('editor-data')
 * async getEditorData() {
 *   return { data: 'Editor data with parse strategy' };
 * }
 * ```
 */
export const Auth = (roleConfig: RoleConfig) => {
  const decorators = [SetMetadata('roleConfig', roleConfig), UseGuards(IdpGuard)];

  if (!roleConfig.optional) {
    decorators.push(ApiSecurity(OWOX_AUTHORIZATION_SECURITY_SCHEME));

    decorators.push(ApiUnauthorizedResponse({ description: 'Authentication required' }));
  }

  if (roleConfig.role) {
    decorators.push(
      ApiForbiddenResponse({
        description: `Forbidden. Required role: ${ROLE_DISPLAY_NAMES[roleConfig.role] ?? roleConfig.role}`,
      })
    );
  }

  return applyDecorators(...decorators);
};
