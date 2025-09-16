import { createBetterAuthConfig } from '../auth/auth-config.js';
import { MagicLinkService } from './magic-link-service.js';
import { CryptoService } from './crypto-service.js';
import { Payload, AddUserCommandResponse } from '@owox/idp-protocol';
import { type Role } from '../types/index.js';
import { OrganizationMembersResponse } from '../types/index.js';
import { type Request as ExpressRequest } from 'express';
import type { DatabaseStore } from '../store/DatabaseStore.js';

export class UserManagementService {
  private static readonly DEFAULT_ORGANIZATION_ID = 'owox_data_marts_organization';
  private static readonly DEFAULT_ORGANIZATION_NAME = 'OWOX Data Marts';
  private static readonly DEFAULT_ORGANIZATION_SLUG = 'owox-data-marts';
  private readonly baseURL: string;

  /**
   * Role hierarchy permissions
   * admin can invite: admin, editor, viewer
   * editor can invite: editor, viewer
   * viewer can invite: viewer
   */
  private static readonly roleHierarchy: Record<Role, Role[]> = {
    admin: ['admin', 'editor', 'viewer'],
    editor: ['editor', 'viewer'],
    viewer: ['viewer'],
  };

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly magicLinkService: MagicLinkService,
    private readonly cryptoService: CryptoService | undefined,
    private readonly store: DatabaseStore
  ) {
    this.baseURL = this.auth.options.baseURL || 'http://localhost:3000';
  }

  async addUserViaMagicLink(username: string): Promise<AddUserCommandResponse> {
    try {
      const magicLink = await this.magicLinkService.generateMagicLink(username);

      return {
        username,
        magicLink,
      };
    } catch (error) {
      console.error('Error adding user:', error);
      throw new Error(
        `Failed to add user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async listUsers(): Promise<Payload[]> {
    try {
      const listMembersRequest = new Request(
        `${this.baseURL}/auth/better-auth/organization/list-members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId: UserManagementService.DEFAULT_ORGANIZATION_ID,
          }),
        }
      );

      try {
        const response = await this.auth.handler(listMembersRequest);

        if (response.ok) {
          const result: OrganizationMembersResponse = await response.json();
          const members = result.members || [];

          return members.map(
            (member): Payload => ({
              userId: member.user?.id || member.userId,
              projectId: UserManagementService.DEFAULT_ORGANIZATION_ID,
              email: member.user?.email || 'unknown@email.com',
              fullName: member.user?.name || member.user?.email || 'Unknown User',
              roles: ['editor'],
            })
          );
        } else {
          return await this.listUsersDirectly();
        }
      } catch (error) {
        console.warn('Fallback to direct users listing due to Better Auth handler error:', error);
        return await this.listUsersDirectly();
      }
    } catch (error) {
      console.error('Error listing users:', error);
      throw new Error('Failed to list users');
    }
  }

  private async listUsersDirectly(): Promise<Payload[]> {
    try {
      const users = await this.store.getUsers();

      return users.map(
        (user): Payload => ({
          userId: user.id,
          projectId: UserManagementService.DEFAULT_ORGANIZATION_ID,
          email: user.email,
          fullName: user.name || user.email,
          roles: ['editor'],
        })
      );
    } catch (error) {
      console.error('Error listing users directly from database:', error);
      return [];
    }
  }

  async removeUser(userId: string): Promise<void> {
    try {
      // Step 1: Remove user from organization first
      const removeMemberRequest = new Request(
        `${this.baseURL}/auth/better-auth/organization/remove-member`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            organizationId: UserManagementService.DEFAULT_ORGANIZATION_ID,
          }),
        }
      );

      try {
        await this.auth.handler(removeMemberRequest);
      } catch (error) {
        console.warn('Failed to remove user from organization (continuing with deletion):', error);
        // Continue with user deletion even if organization removal fails
      }

      // Step 2: Remove user from Better Auth system
      await this.removeUserDirectly(userId);
    } catch (error) {
      console.error('Error removing user:', error);
      throw new Error(
        `Failed to remove user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async removeUserDirectly(userId: string): Promise<void> {
    try {
      await this.store.deleteUserCascade(userId);
    } catch (error) {
      console.error(`Failed to delete user ${userId}:`, error);
      throw new Error(
        `Failed to delete user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async addMemberToOrganization(req: ExpressRequest, role: Role): Promise<void> {
    const session = await this.auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });

    if (!session) {
      throw new Error('No session found');
    }

    const defaultOrg = {
      id: UserManagementService.DEFAULT_ORGANIZATION_ID,
      name: UserManagementService.DEFAULT_ORGANIZATION_NAME,
      slug: UserManagementService.DEFAULT_ORGANIZATION_SLUG,
    } as const;

    if (!(await this.store.defaultOrganizationExists(defaultOrg.slug))) {
      await this.store.createDefaultOrganizationForUser(defaultOrg, session.user.id, role);
    } else {
      await this.store.addUserToOrganization(defaultOrg.id, session.user.id, role);
    }
  }

  async getUsersForAdmin(): Promise<
    Array<{
      id: string;
      email: string;
      name: string | null;
      role: string;
      createdAt: string;
      updatedAt: string | null;
    }>
  > {
    try {
      return await this.store.getUsersForAdmin();
    } catch (error) {
      console.error('Error getting users for admin:', error);
      throw new Error('Failed to get users for admin');
    }
  }

  async getUserDetails(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
    updatedAt: string | null;
    organizationId: string | null;
  } | null> {
    try {
      return await this.store.getUserDetails(userId);
    } catch (error) {
      console.error('Error getting user details:', error);
      throw new Error('Failed to get user details');
    }
  }

  async generateMagicLinkForUser(email: string, role: Role): Promise<string> {
    try {
      if (!this.cryptoService) {
        throw new Error('CryptoService not available for magic link generation');
      }

      const magicLink = await this.magicLinkService.generateMagicLink(email, role);
      return magicLink;
    } catch (error) {
      console.error('Error generating magic link for user:', error);
      throw new Error('Failed to generate magic link');
    }
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    try {
      await this.store.updateUserName(userId, name);
    } catch (error) {
      console.error('Error updating user name:', error);
      throw new Error('Failed to update user name');
    }
  }

  async getUserRole(userId: string): Promise<string | null> {
    try {
      return await this.store.getUserRole(UserManagementService.DEFAULT_ORGANIZATION_ID, userId);
    } catch (error) {
      console.error('Failed to get user role:', error);
      throw new Error('Failed to get user role');
    }
  }

  // ========== Role Permission Methods ==========

  /**
   * Check if current user role can invite target role
   */
  canInviteRole(currentUserRole: Role, targetRole: Role): boolean {
    const allowedRoles = UserManagementService.roleHierarchy[currentUserRole];
    return allowedRoles.includes(targetRole);
  }

  /**
   * Get roles that current user can invite
   */
  getAllowedRolesForInvite(currentUserRole: Role): Role[] {
    return UserManagementService.roleHierarchy[currentUserRole];
  }

  /**
   * Validate if role exists
   */
  isValidRole(role: string): role is Role {
    return ['admin', 'editor', 'viewer'].includes(role);
  }

  /**
   * Get role priority (higher number = more permissions)
   */
  getRolePriority(role: Role): number {
    const priorities: Record<Role, number> = {
      admin: 3,
      editor: 2,
      viewer: 1,
    };
    return priorities[role];
  }

  /**
   * Check if current role has higher or equal priority than target role
   */
  hasHigherOrEqualPriority(currentRole: Role, targetRole: Role): boolean {
    return this.getRolePriority(currentRole) >= this.getRolePriority(targetRole);
  }
}
