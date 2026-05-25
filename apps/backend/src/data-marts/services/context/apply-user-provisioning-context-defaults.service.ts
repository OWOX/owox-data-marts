import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MemberRoleScope } from '../../entities/member-role-scope.entity';
import { RoleScope } from '../../enums/role-scope.enum';

@Injectable()
export class ApplyUserProvisioningContextDefaultsService {
  constructor(
    @InjectRepository(MemberRoleScope)
    private readonly memberRoleScopeRepository: Repository<MemberRoleScope>
  ) {}

  async preserveExistingMembersAsEntireProject(
    projectId: string,
    userIds: string[]
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const existingRows = await this.memberRoleScopeRepository.find({
      where: { projectId, userId: In(userIds) },
    });
    const existingUserIds = new Set(existingRows.map(row => row.userId));
    const missingRows = userIds
      .filter(userId => !existingUserIds.has(userId))
      .map(userId => ({
        userId,
        projectId,
        roleScope: RoleScope.ENTIRE_PROJECT,
      }));

    if (missingRows.length === 0) {
      return;
    }

    await this.memberRoleScopeRepository.upsert(missingRows, ['userId', 'projectId']);
  }
}
