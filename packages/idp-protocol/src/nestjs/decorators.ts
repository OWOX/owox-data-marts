import { SetMetadata } from '@nestjs/common';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from '../types/types.js';

//this is a decorator to make a route as public
export const Public = () => SetMetadata('isPublic', true);

//this is a decorator to make a route as introspect
export const Introspect = () => SetMetadata('isIntrospect', true);

//this is a decorator to make a route as roles
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

//this is a decorator to make a route as permissions
export const Permissions = (...permissions: string[]) => SetMetadata('permissions', permissions);

//this is a decorator to get the current user
export const CurrentUser = createParamDecorator(
  (data: keyof TokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  }
);
