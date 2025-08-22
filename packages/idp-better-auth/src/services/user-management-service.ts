import { createBetterAuthConfig } from '../auth/auth-config.js';
import { MagicLinkService } from './magic-link-service.js';
import { CryptoService } from './crypto-service.js';
import { Payload, AddUserCommandResponse } from '@owox/idp-protocol';
import { type Role } from '../types/index.js';
import { DatabaseUser, OrganizationMembersResponse } from '../types/database-models.js';
import { type Request as ExpressRequest } from 'express';

export class UserManagementService {
  private static readonly DEFAULT_ORGANIZATION_ID = 'owox_data_marts_organization';
  private static readonly DEFAULT_ORGANIZATION_NAME = 'OWOX Data Marts';
  private static readonly DEFAULT_ORGANIZATION_SLUG = 'owox-data-marts';
  private readonly baseURL: string;

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly magicLinkService: MagicLinkService,
    private readonly cryptoService?: CryptoService
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
      } catch {
        return await this.listUsersDirectly();
      }
    } catch (error) {
      console.error('Error listing users:', error);
      throw new Error('Failed to list users');
    }
  }

  private async listUsersDirectly(): Promise<Payload[]> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        return [];
      }

      const stmt = db.prepare('SELECT id, email, name FROM user ORDER BY createdAt DESC');
      const users = stmt.all() as DatabaseUser[];

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
      } catch {
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
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations');
        throw new Error('Database adapter does not support direct operations');
      }

      // Clean up user's sessions
      try {
        const deleteSessionsStmt = db.prepare('DELETE FROM session WHERE userId = ?');
        deleteSessionsStmt.run(userId);
      } catch {
        // Session cleanup may not be needed
      }

      // Clean up user's accounts
      try {
        const deleteAccountsStmt = db.prepare('DELETE FROM account WHERE userId = ?');
        deleteAccountsStmt.run(userId);
      } catch {
        // Account cleanup may not be needed
      }

      // Clean up organization memberships
      try {
        const deleteMembershipsStmt = db.prepare('DELETE FROM member WHERE userId = ?');
        deleteMembershipsStmt.run(userId);
      } catch {
        // Organization membership cleanup may not be needed
      }

      // Finally, remove the user
      const deleteUserStmt = db.prepare('DELETE FROM user WHERE id = ?');
      const result = deleteUserStmt.run(userId);

      if (result.changes === 0) {
        console.error(`User ${userId} not found`);
        throw new Error(`User ${userId} not found`);
      }
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

    if (!(await this.ensureDefaultOrganization())) {
      await this.createDefaultOrganizationForUser(session.user.id, role);
    } else {
      await this.addUserToOrganization(session.user.id, role);
    }
  }

  private async ensureDefaultOrganization(): Promise<boolean> {
    try {
      const db = this.auth.options.database;

      if (!db || typeof db.prepare !== 'function') {
        console.error('Database adapter does not support direct operations for organization check');
        throw new Error(
          'Database adapter does not support direct operations for organization check'
        );
      }
      const stmt = db.prepare('SELECT id FROM organization WHERE slug = ? LIMIT 1');
      const existingOrg = stmt.get(UserManagementService.DEFAULT_ORGANIZATION_SLUG);
      if (existingOrg) {
        return true;
      }
    } catch (error) {
      console.error('Error checking default organization:', error);
      throw new Error('Error checking default organization');
    }

    return false;
  }

  private async createDefaultOrganizationForUser(userId: string, role: Role): Promise<void> {
    try {
      const db = this.getDbInstance();

      const orgId = UserManagementService.DEFAULT_ORGANIZATION_ID;

      try {
        const insertOrgStmt = db.prepare(`
          INSERT INTO organization (id, name, slug, metadata, createdAt) 
          VALUES (?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();
        insertOrgStmt.run(
          orgId,
          UserManagementService.DEFAULT_ORGANIZATION_NAME,
          UserManagementService.DEFAULT_ORGANIZATION_SLUG,
          JSON.stringify({ isDefault: true, createdBy: userId }),
          now
        );

        const insertMemberStmt = db.prepare(`
          INSERT INTO member (id, organizationId, userId, role, createdAt) 
          VALUES (?, ?, ?, ?, ?)
        `);

        const memberId = `${orgId}_${userId}`;
        insertMemberStmt.run(memberId, orgId, userId, role, now);
      } catch (dbError) {
        if (
          String(dbError).includes('UNIQUE constraint failed') ||
          String(dbError).includes('already exists')
        ) {
          await this.addUserToOrganization(userId, role);
        } else {
          throw dbError;
        }
      }
    } catch (error) {
      console.error('Error creating default organization for user:', error);
      throw new Error('Error creating default organization for user');
    }
  }

  private async addUserToOrganization(userId: string, role: Role): Promise<void> {
    const db = this.getDbInstance();

    try {
      // First check if user already exists in organization
      const checkStmt = db.prepare(
        'SELECT role FROM member WHERE userId = ? AND organizationId = ?'
      );
      const existingMember = checkStmt.get(userId, UserManagementService.DEFAULT_ORGANIZATION_ID);

      if (existingMember) {
        // Update existing member role
        const updateStmt = db.prepare(
          'UPDATE member SET role = ? WHERE userId = ? AND organizationId = ?'
        );
        updateStmt.run(role, userId, UserManagementService.DEFAULT_ORGANIZATION_ID);
      } else {
        // Insert new member
        const insertMemberStmt = db.prepare(`
          INSERT INTO member (id, organizationId, userId, role, createdAt) 
          VALUES (?, ?, ?, ?, ?)
        `);

        const memberId = `${UserManagementService.DEFAULT_ORGANIZATION_ID}_${userId}`;
        const now = new Date().toISOString();
        insertMemberStmt.run(
          memberId,
          UserManagementService.DEFAULT_ORGANIZATION_ID,
          userId,
          role,
          now
        );
      }
    } catch (error) {
      console.error('Error in addUserToOrganization:', error);
      if (!String(error).includes('UNIQUE constraint failed')) {
        throw error;
      }
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
      const db = this.getDbInstance();

      const stmt = db.prepare(`
        SELECT 
          u.id, 
          u.email, 
          u.name, 
          u.createdAt,
          u.updatedAt,
          COALESCE(m.role, 'viewer') as role
        FROM user u
        LEFT JOIN member m ON u.id = m.userId
        ORDER BY u.createdAt DESC
      `);

      const users = stmt.all() as Array<{
        id: string;
        email: string;
        name: string | null;
        role: string;
        createdAt: string;
        updatedAt: string | null;
      }>;

      return users;
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
      const db = this.getDbInstance();

      const stmt = db.prepare(`
        SELECT 
          u.id, 
          u.email, 
          u.name, 
          u.createdAt,
          u.updatedAt,
          COALESCE(m.role, 'viewer') as role,
          m.organizationId
        FROM user u
        LEFT JOIN member m ON u.id = m.userId
        WHERE u.id = ?
      `);

      const user = stmt.get(userId) as
        | {
            id: string;
            email: string;
            name: string | null;
            role: string;
            createdAt: string;
            updatedAt: string | null;
            organizationId: string | null;
          }
        | undefined;

      return user || null;
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
      const db = this.getDbInstance();

      const updateStmt = db.prepare('UPDATE user SET name = ? WHERE id = ?');
      const result = updateStmt.run(name, userId);

      if (result.changes === 0) {
        throw new Error(`User ${userId} not found or name not updated`);
      }
    } catch (error) {
      console.error('Error updating user name:', error);
      throw new Error('Failed to update user name');
    }
  }

  async getUserRole(userId: string): Promise<string | null> {
    try {
      const db = this.getDbInstance();

      const stmt = db.prepare(`
        SELECT role FROM member 
        WHERE userId = ? AND organizationId = ?
      `);

      const member = stmt.get(userId, UserManagementService.DEFAULT_ORGANIZATION_ID) as
        | { role: string }
        | undefined;

      return member ? member.role : null;
    } catch (error) {
      console.error('Failed to get user role:', error);
      throw new Error('Failed to get user role');
    }
  }

  private getDbInstance(): Awaited<
    ReturnType<typeof createBetterAuthConfig>
  >['options']['database'] {
    const db = this.auth.options.database;

    if (!db || typeof db.prepare !== 'function') {
      throw new Error('Database adapter does not support direct operations');
    }

    return db;
  }
}
