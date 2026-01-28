import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Payload, ProjectMember } from '@owox/idp-protocol';
import { In, Repository } from 'typeorm';
import { ProjectProjection } from '../entities/project-projection.entity';
import { UserProjection } from '../entities/user-projection.entity';
import { IdpProviderService } from './idp-provider.service';
import { ProjectMemberApiDto } from '../../notifications/dto/presentation/project-member-api.dto';

/**
 * Service for updating projections in the database based on authorization payload.
 */
@Injectable()
export class IdpProjectionsService {
  private readonly logger = new Logger(IdpProjectionsService.name);

  constructor(
    @InjectRepository(ProjectProjection)
    private readonly projectsRepository: Repository<ProjectProjection>,
    @InjectRepository(UserProjection)
    private readonly usersRepository: Repository<UserProjection>,
    private readonly idpProviderService: IdpProviderService
  ) {}

  public async getProjectProjection(projectId: string): Promise<ProjectProjection | null> {
    return await this.projectsRepository.findOne({ where: { projectId } });
  }

  public async getUserProjection(userId: string): Promise<UserProjection | null> {
    return await this.usersRepository.findOne({ where: { userId } });
  }

  public async getUserProjectionList(userIds: string[]): Promise<UserProjection[]> {
    if (!userIds || userIds.length === 0) {
      return [];
    }
    return await this.usersRepository.find({ where: { userId: In(userIds) } });
  }

  public async getAllUserProjections(): Promise<UserProjection[]> {
    return await this.usersRepository.find();
  }

  public async updateProjectionsFromIdpPayload(authorizationPayload: Payload): Promise<void> {
    await this.updateProjectProjection(authorizationPayload);
    await this.updateUserProjection(authorizationPayload);
  }

  private async updateProjectProjection(payload: Payload): Promise<void> {
    try {
      const { projectId, projectTitle } = payload;
      // Only update if the project title is known
      if (projectId && projectTitle) {
        await this.projectsRepository.upsert({ projectId, projectTitle, modifiedAt: new Date() }, [
          'projectId',
        ]);
      }
    } catch (error) {
      this.logger.error('Failed to update project projection', error);
    }
  }

  private async updateUserProjection(payload: Payload): Promise<void> {
    try {
      const { userId, fullName, email, avatar } = payload;
      // Only update if any user information is known
      if (userId && (fullName || email || avatar)) {
        await this.usersRepository.upsert(
          { userId, fullName, email, avatar, modifiedAt: new Date() },
          ['userId']
        );
      }
    } catch (error) {
      this.logger.error('Failed to update user projection', error);
    }
  }

  /**
   * Get project members from IDP provider and update projections
   */
  public async getProjectMembers(projectId: string): Promise<ProjectMemberApiDto[]> {
    try {
      const provider = this.idpProviderService.getProvider();
      const members = await provider.getProjectMembers(projectId);

      await this.updateUserProjections(members);

      return members
        .filter(m => m.userStatus !== 'locked' && m.userStatus !== 'erased')
        .map(m => ({
          userId: m.userId,
          email: m.email,
          displayName: m.fullName,
          avatarUrl: m.avatar,
          role: m.projectRole,
          hasNotificationsEnabled: m.hasNotificationsEnabled,
        }));
    } catch (error) {
      this.logger.error('Failed to get project members', error);
      return [];
    }
  }

  /**
   * Update or insert user projections for multiple members
   */
  private async updateUserProjections(members: ProjectMember[]): Promise<void> {
    if (members.length === 0) return;
    try {
      const now = new Date();
      await this.usersRepository.upsert(
        members.map(member => ({
          userId: member.userId,
          email: member.email,
          fullName: member.fullName,
          avatar: member.avatar,
          modifiedAt: now,
        })),
        ['userId']
      );
    } catch (error) {
      this.logger.error('Failed to update user projections', error);
    }
  }
}
