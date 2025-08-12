import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthMethod } from '../types/auth.types';
import { IdpAuthGuard } from '../guards/idp-auth.guard';

/**
 * Decorator to require authentication for a route
 *
 * @example
 * ```typescript
 * @Auth()
 * @Get('protected')
 * async getProtectedData() {
 *   return { data: 'This requires authentication' };
 * }
 * ```
 */
export const Auth = (method: AuthMethod = 'introspect') => {
  return applyDecorators(
    SetMetadata('authMethod', method),
    UseGuards(IdpAuthGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Authentication required' })
  );
};

/**
 * Decorator to make authentication optional for a route
 *
 * @example
 * ```typescript
 * @OptionalAuth()
 * @Get('optional')
 * async getOptionalData(@AuthContext() context?: AuthorizationContext) {
 *   if (context) {
 *     return { data: 'Authenticated user data', context };
 *   }
 *   return { data: 'Public data' };
 * }
 * ```
 */
export const OptionalAuth = () => {
  return applyDecorators(
    SetMetadata('isOptionalAuth', true),
    UseGuards(IdpAuthGuard),
    ApiBearerAuth()
  );
};
