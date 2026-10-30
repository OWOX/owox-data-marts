import { BadRequestException } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

export async function assertProjectMembers(
  projectId: string,
  userIds: string[],
  idpProjectionsFacade: IdpProjectionsFacade
): Promise<void> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return;
  const members = await idpProjectionsFacade.getProjectMembers(projectId);
  const memberIds = new Set(members.filter(m => !m.isOutbound).map(m => m.userId));
  const invalidIds = uniqueIds.filter(id => !memberIds.has(id));
  if (invalidIds.length > 0) {
    throw new BadRequestException(
      `The following user IDs are not members of this project: ${invalidIds.join(', ')}`
    );
  }
}

export async function syncOwners<T extends ObjectLiteral>(
  repository: Repository<T>,
  entityIdField: string & keyof T,
  entityId: string,
  projectId: string,
  ownerIds: string[],
  idpProjectionsFacade: IdpProjectionsFacade,
  createOwner: (userId: string) => T
): Promise<void> {
  const uniqueOwnerIds = [...new Set(ownerIds)];
  await assertProjectMembers(projectId, uniqueOwnerIds, idpProjectionsFacade);

  await repository.delete({ [entityIdField]: entityId } as T);
  const owners = uniqueOwnerIds.map(createOwner);
  if (owners.length > 0) {
    await repository.save(owners);
  }
}
