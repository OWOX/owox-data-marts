import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { IdpAuthGuard, IdpRoleGuard } from '../guards';
import { Role } from '@owox/idp-protocol';

/**
 * Decorator to require specific roles for a route
 * User must have at least one of the specified roles
 *
 * @param roles - Array of role names
 *
 * @example
 * ```typescript
 * @Roles('admin', 'editor')
 * @Get('admin-only')
 * async getAdminOrEditorData() {
 *   return { data: 'Admin or editor only' };
 * }
 * ```
 */
export const Roles = (...roles: Role[]) => {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(IdpAuthGuard, IdpRoleGuard),
    ApiForbiddenResponse({
      description: `Forbidden. Required role: ${roles.join(' or ')}`,
    })
  );
};

/**
 * Decorator for admin-only routes
 *
 * @example
 * ```typescript
 * @Admin()
 * @Delete('admin/delete/:id')
 * async deleteResource(@Param('id') id: string) {
 *   return await this.service.delete(id);
 * }
 * ```
 */
export const Admin = () => Roles('admin');

export const Editor = () => Roles('editor', 'admin');

export const Viewer = () => Roles('viewer', 'editor', 'admin');
