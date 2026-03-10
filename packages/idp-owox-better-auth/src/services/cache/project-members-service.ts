import type { GetProjectMembersOptions, ProjectMember } from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/index.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';

export interface ProjectMembersServiceOptions {
  /**
   * TTL for data in seconds
   * @default 900 (15 minutes)
   */
  ttlSeconds?: number;

  /**
   * Request timeout to OWOX Client in milliseconds
   * @default 5000 (5 seconds)
   */
  owoxClientTimeoutMs?: number;
}

/**
 * Service for managing project members with persistent storage.
 * Implements TTL-based refresh and graceful degradation when OWOX Client is unavailable.
 */
export class ProjectMembersService {
  private readonly DEFAULT_TTL_SECONDS = 60; //15 * 60; // 15 minutes
  private readonly DEFAULT_OWOX_CLIENT_TIMEOUT_MS = 5000; // 5 seconds
  private readonly logger = createServiceLogger(ProjectMembersService.name);

  private readonly ttlSeconds: number;
  private readonly owoxClientTimeoutMs: number;

  constructor(
    private readonly store: DatabaseStore,
    private readonly identityClient: IdentityOwoxClient,
    options: ProjectMembersServiceOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? this.DEFAULT_TTL_SECONDS;
    this.owoxClientTimeoutMs = options.owoxClientTimeoutMs ?? this.DEFAULT_OWOX_CLIENT_TIMEOUT_MS;
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
    const forceFresh = options?.forceFresh ?? false;

    // If forceFresh is true, always fetch from OWOX Client
    if (forceFresh) {
      this.logger.debug('Force fresh requested, fetching from OWOX Client', { projectId });
      return this.refreshFromOwoxClient(projectId);
    }

    // Try to get from storage first
    const storedMembers = await this.store.getProjectMembers(projectId);

    if (!storedMembers) {
      // No data exists, fetch from OWOX Client
      this.logger.debug('No stored data found, fetching from OWOX Client', { projectId });
      return this.refreshFromOwoxClient(projectId);
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
      // Try to fetch from OWOX Client with timeout
      const freshMembers = await this.fetchFromOwoxClientWithTimeout(projectId);
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
  private async fetchFromOwoxClientWithTimeout(projectId: string): Promise<ProjectMember[]> {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`OWOX Client request timeout after ${this.owoxClientTimeoutMs}ms`));
      }, this.owoxClientTimeoutMs);
    });

    // Race between OWOX Client fetch and timeout
    const fetchPromise = this.refreshFromOwoxClient(projectId);

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  /**
   * Refresh data from OWOX Client.
   * Implements soft-delete: members not in OWOX Client get status=outbound.
   * Returns ALL members (including outbound).
   */
  private async refreshFromOwoxClient(projectId: string): Promise<ProjectMember[]> {
    try {
      const response = await this.identityClient.getProjectMembers(projectId);

      if (!response.projectMembers) {
        // No members in OWOX Client, save empty list
        await this.store.saveProjectMembers(projectId, [], this.ttlSeconds);
        return [];
      }

      // response.projectMembers = response.projectMembers.filter(m => m.email !== 'a.laskevych@owox.com');
      // for (const member of response.projectMembers) {
      //   if (member.email === 'a.laskevych@owox.com') {
      //     member.projectRole = 'viewer';
      //   }
      // }

      // Get current stored data for soft-delete logic
      const currentData = await this.store.getProjectMembers(projectId);
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
              userStatus: 'outbound',
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
}
