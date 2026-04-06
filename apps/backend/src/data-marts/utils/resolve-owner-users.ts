import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';

export function resolveOwnerUsers(
  ownerIds: string[],
  userProjections: UserProjectionsListDto
): UserProjectionDto[] {
  if (!ownerIds || ownerIds.length === 0) {
    return [];
  }
  return ownerIds.map(
    userId => userProjections.getByUserId(userId) ?? new UserProjectionDto(userId, null, null, null)
  );
}
