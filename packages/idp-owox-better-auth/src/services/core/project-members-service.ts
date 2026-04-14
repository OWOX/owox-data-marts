import type {
  GetProjectMembersOptions,
  ProjectMember,
  ProjectMemberInvitation,
  Role,
} from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/index.js';
import {
  DEFAULT_OWOX_CLIENT_TIMEOUT_MS,
  DEFAULT_PROJECT_MEMBERS_CACHE_TTL_SECONDS,
} from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { ProjectMembersServiceOptions } from '../../types/project-members.js';

/**
 * Service for managing project members with persistent storage.
 * Implements TTL-based refresh and graceful degradation when OWOX Client is unavailable.
 */
export class ProjectMembersService {
  private readonly logger = createServiceLogger(ProjectMembersService.name);

  private readonly ttlSeconds: number;
  private readonly owoxClientTimeoutMs: number;

  constructor(
    private readonly store: DatabaseStore,
    private readonly identityClient: IdentityOwoxClient,
    options: ProjectMembersServiceOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_PROJECT_MEMBERS_CACHE_TTL_SECONDS;
    this.owoxClientTimeoutMs = options.owoxClientTimeoutMs ?? DEFAULT_OWOX_CLIENT_TIMEOUT_MS;
  }

  /**
   * Get project members with TTL-based refresh support.
   * Returns ALL members including those marked as outbound.
   *
   * Algorithm:
   * 1. If forceFresh=true → always fetch from OWOX Client
   * 2. If forceFresh=false/undefined:
   *    - Check project sync info (expires_at from project table)
   *    - If data is fresh → return stored members
   *    - If data is stale → try to refresh from OWOX Client:
   *      - If OWOX Client responds → update storage, return fresh data
   *      - If OWOX Client times out → return stale data (graceful degradation)
   *    - If no data → fetch from OWOX Client
   *
   * @param projectId - The project ID to get members for
   * @param options - Optional settings for controlling freshness
   * @returns Array of ALL project members (including outbound members)
   */
  async getMembers(
    projectId: string,
    options?: GetProjectMembersOptions
  ): Promise<ProjectMember[]> {
    const forceFresh = options?.forceFresh ?? true;

    // Try to get from storage first
    const storedMembers = await this.store.getProjectMembers(projectId);

    // If forceFresh is true and we have data, skip freshness check
    if (forceFresh && storedMembers) {
      this.logger.debug('Force fresh requested with existing data, fetching from OWOX Client', {
        projectId,
      });
      return this.refreshWithFallback(projectId, storedMembers);
    }

    // If forceFresh is true but no data exists, fetch without fallback
    if (forceFresh) {
      this.logger.debug('Force fresh requested, no stored data, fetching from OWOX Client', {
        projectId,
      });
      return this.refreshFromOwoxClient(projectId, undefined);
    }

    if (!storedMembers) {
      // No data exists, fetch from OWOX Client
      this.logger.debug('No stored data found, fetching from OWOX Client', { projectId });
      return this.refreshFromOwoxClient(projectId, undefined);
    }

    // Check if data is expired based on project sync info (expires_at from project table)
    const isExpired = await this.isDataExpired(projectId);

    if (!isExpired) {
      // Data is fresh, return all stored members (including outbound)
      this.logger.debug('Data is fresh, returning all stored members', { projectId });
      return storedMembers;
    }

    // Data is expired, try to refresh from OWOX Client with graceful degradation
    this.logger.debug('Data expired, attempting to refresh from OWOX Client', { projectId });
    return this.refreshWithFallback(projectId, storedMembers);
  }

  /**
   * Check if stored data is expired based on project table's expires_at timestamp.
   */
  private async isDataExpired(projectId: string): Promise<boolean> {
    const syncInfo = await this.store.getProjectSyncInfo(projectId);

    if (!syncInfo || !syncInfo.expiresAt) {
      // No sync info or no expiration set - consider data expired
      return true;
    }

    // Data is expired if expires_at is in the past
    return syncInfo.expiresAt.getTime() <= Date.now();
  }

  /**
   * Refresh data from OWOX Client with fallback to stale data on timeout/error.
   */
  private async refreshWithFallback(
    projectId: string,
    staleMembers: ProjectMember[]
  ): Promise<ProjectMember[]> {
    try {
      // Try to fetch from OWOX Client with timeout, passing existing members for soft-delete
      const freshMembers = await this.fetchFromOwoxClientWithTimeout(projectId, staleMembers);
      return freshMembers;
    } catch (error) {
      // Log warning and return stale data (graceful degradation)
      this.logger.warn('OWOX Client unavailable, returning stale data', {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return all stale members (including outbound)
      return staleMembers;
    }
  }

  /**
   * Fetch members from OWOX Client with timeout support.
   */
  private async fetchFromOwoxClientWithTimeout(
    projectId: string,
    existingMembers?: ProjectMember[]
  ): Promise<ProjectMember[]> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`OWOX Client request timeout after ${this.owoxClientTimeoutMs}ms`));
      }, this.owoxClientTimeoutMs);
    });
    try {
      return await Promise.race([
        this.refreshFromOwoxClient(projectId, existingMembers),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Refresh data from OWOX Client.
   * Implements soft-delete: members not in OWOX Client get status=outbound.
   * Returns ALL members (including outbound).
   */
  private async refreshFromOwoxClient(
    projectId: string,
    existingMembers?: ProjectMember[]
  ): Promise<ProjectMember[]> {
    try {
      const response = await this.identityClient.getProjectMembers(projectId);

      // Use provided existing members or fetch from store if not provided
      const currentData = existingMembers ?? (await this.store.getProjectMembers(projectId));
      const freshMemberIds = new Set(response.projectMembers.map(m => String(m.userId)));

      // Build merged members list with soft-delete support
      const mergedMembers: ProjectMember[] = response.projectMembers.map(member => ({
        userId: String(member.userId),
        email: member.email,
        fullName: member.fullName || undefined,
        avatar: member.avatar || undefined,
        projectRole: member.projectRole,
        userStatus: member.userStatus,
        hasNotificationsEnabled: member.subscriptions?.serviceNotifications ?? true,
        isOutbound: false,
      }));

      // Mark removed members as outbound (soft-delete)
      if (currentData) {
        for (const storedMember of currentData) {
          // If member is not in fresh data and not already outbound
          if (!freshMemberIds.has(storedMember.userId) && !storedMember.isOutbound) {
            mergedMembers.push({
              ...storedMember,
              isOutbound: true,
            });
          }
        }
      }

      // Save to storage
      await this.store.saveProjectMembers(projectId, mergedMembers, this.ttlSeconds);

      this.logger.debug('Data refreshed from OWOX Client', {
        projectId,
        totalMembers: mergedMembers.length,
        activeMembers: mergedMembers.filter(m => !m.isOutbound).length,
        outboundMembers: mergedMembers.filter(m => m.isOutbound).length,
      });

      // Return ALL members (including outbound)
      return mergedMembers;
    } catch (error) {
      this.logger.error(
        'Failed to refresh data from OWOX Client',
        { projectId },
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Invite a new member to the project by delegating to the Identity OWOX API.
   * The Java upstream owns email delivery, so the response surfaces
   * `kind: 'email-sent'` unconditionally. We compose `email` / `message` on
   * this side because the Java contract only returns `userUid` — everything
   * else is already known from the request. Returning `userId` lets the
   * caller controller attach scope + contexts immediately.
   */
  async inviteMember(
    projectId: string,
    email: string,
    role: Role,
    actorUserId: string
  ): Promise<ProjectMemberInvitation> {
    const response = await this.identityClient.inviteProjectMember(
      projectId,
      email,
      role,
      actorUserId
    );
    return {
      projectId,
      email,
      role,
      kind: 'email-sent',
      userId: response.userUid,
      message: `Invitation email sent to ${email}`,
    };
  }

  /**
   * Remove a member from the project. The next `getMembers` call will re-sync
   * from the remote source because `forceFresh` defaults to true in consumers.
   */
  async removeMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    await this.identityClient.removeProjectMember(projectId, userId, actorUserId);
  }

  /**
   * Change a member's role via the Identity OWOX API.
   */
  async changeMemberRole(
    projectId: string,
    userId: string,
    newRole: Role,
    actorUserId: string
  ): Promise<void> {
    await this.identityClient.changeProjectMemberRole(projectId, userId, newRole, actorUserId);
  }
}
