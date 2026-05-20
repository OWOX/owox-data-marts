import { AccessDecisionService, Action, EntityType } from '../services/access-decision';

export function createDataMartUseAccessFilter(
  accessDecisionService: AccessDecisionService,
  userId: string,
  roles: string[],
  projectId: string
): (dmId: string) => Promise<boolean> {
  const cache = new Map<string, boolean>();
  return async (dmId: string): Promise<boolean> => {
    const cached = cache.get(dmId);
    if (cached !== undefined) return cached;
    const result = await accessDecisionService.canAccess(
      userId,
      roles,
      EntityType.DATA_MART,
      dmId,
      Action.USE,
      projectId
    );
    cache.set(dmId, result);
    return result;
  };
}
