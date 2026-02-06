import { createBetterAuthConfig } from '../config/idp-better-auth-config.js';
import { logger } from '../logger.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';

export class UserManagementService {
  private readonly baseURL: string;

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly store: DatabaseStore
  ) {
    this.baseURL = this.auth.options.baseURL || 'http://localhost:3000';
  }

  async listUsers(): Promise<
    Array<{
      id: string;
      email: string;
      name?: string;
      createdAt?: string;
    }>
  > {
    try {
      return await this.store.getUsers();
    } catch (error) {
      logger.error('Error listing users', {}, error as Error);
      throw new Error('Failed to list users');
    }
  }

  async getUserByEmail(email: string) {
    try {
      return await this.store.getUserByEmail(email);
    } catch (error) {
      logger.error('Error getting user by email', { email }, error as Error);
      throw new Error('Failed to get user by email');
    }
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    try {
      await this.store.updateUserName(userId, name);
    } catch (error) {
      logger.error('Error updating user name', { userId, name }, error as Error);
      throw new Error('Failed to update user name');
    }
  }

  async removeUser(userId: string): Promise<void> {
    try {
      await this.store.deleteUserCascade(userId);
    } catch (error) {
      logger.error('Error removing user', { userId }, error as Error);
      throw new Error(
        `Failed to remove user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
