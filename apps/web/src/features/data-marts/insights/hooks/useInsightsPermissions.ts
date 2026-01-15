import { type BasePermissions, usePermissions } from '../../../../app/permissions';

export interface InsightsPermissions extends BasePermissions {
  canGenerateAI: boolean;
  canRun: boolean;
  canSendAndSchedule: boolean;
}

export function useInsightsPermissions(): InsightsPermissions {
  return usePermissions<InsightsPermissions>(({ canEdit }) => {
    return {
      canGenerateAI: canEdit,
      canRun: canEdit,
      canSendAndSchedule: canEdit,
    };
  });
}
