import { Role as RoleType } from '@owox/idp-protocol';

/**
 * Authentication strategies for token validation
 *
 * @enum {string}
 * @description The strategy to use for authentication.
 * @default INTROSPECT
 *
 * INTROSPECT - Introspect with the IDP to get the user information.
 * PARSE - Parse the token (JWT) to get the user information.
 */
export enum Strategy {
  INTROSPECT = 'introspect',
  PARSE = 'parse',
}

/**
 * Role configuration with authentication strategy
 *
 * @param role - The role to check for.
 * @param strategy - The strategy to use for authentication.
 * @param optional - Whether the authentication is optional. if true, the authentication is optional.
 */
export interface RoleConfig {
  role?: RoleType;
  strategy: Strategy;
  optional?: boolean;
}

/**
 * Helper functions for creating role configurations
 */
export function none(): RoleConfig {
  return {
    strategy: Strategy.INTROSPECT,
    optional: true,
  };
}

export function viewer(strategy: Strategy = Strategy.INTROSPECT): RoleConfig {
  return {
    role: 'viewer',
    strategy,
  };
}

export function editor(strategy: Strategy = Strategy.INTROSPECT): RoleConfig {
  return {
    role: 'editor',
    strategy,
  };
}

export function admin(strategy: Strategy = Strategy.INTROSPECT): RoleConfig {
  return {
    role: 'admin',
    strategy,
  };
}

/**
 * Role builder object containing helper methods for creating role configurations
 */
export const Role = {
  none,
  viewer,
  editor,
  admin,
};
