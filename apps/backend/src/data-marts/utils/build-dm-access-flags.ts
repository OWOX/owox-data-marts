import { RelationshipDataMartAccess } from '../dto/domain/relationship.dto';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';

export async function buildDmAccessFlags(
  uniqueDmIds: Set<string>,
  userId: string,
  roles: string[],
  projectId: string,
  accessDecisionService: AccessDecisionService
): Promise<Map<string, RelationshipDataMartAccess>> {
  const accessByDmId = new Map<string, RelationshipDataMartAccess>();
  await Promise.all(
    [...uniqueDmIds].map(async dmId => {
      const [canSee, canUse, canEdit] = await Promise.all([
        accessDecisionService.canAccess(
          userId,
          roles,
          EntityType.DATA_MART,
          dmId,
          Action.SEE,
          projectId
        ),
        accessDecisionService.canAccess(
          userId,
          roles,
          EntityType.DATA_MART,
          dmId,
          Action.USE,
          projectId
        ),
        accessDecisionService.canAccess(
          userId,
          roles,
          EntityType.DATA_MART,
          dmId,
          Action.EDIT,
          projectId
        ),
      ]);
      accessByDmId.set(dmId, { canSee, canUse, canEdit });
    })
  );
  return accessByDmId;
}
