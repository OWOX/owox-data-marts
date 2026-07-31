import { RoleEnum } from '@owox/idp-protocol';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import type { AuthorizationContext } from '../../../../idp';
import { IdpProjectionsFacade } from '../../../../idp/facades/idp-projections.facade';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';

export async function resolveScheduledDataQualityRunContext(
  idpProjectionsFacade: IdpProjectionsFacade,
  trigger: DataMartScheduledTrigger
): Promise<AuthorizationContext> {
  const projectId = trigger.dataMart.projectId;
  const userId = trigger.createdById;
  const member = await idpProjectionsFacade.getProjectMemberOrThrow(projectId, userId);
  if (!member) {
    throw new BusinessViolationException(
      'User is no longer a member of this project; Data Quality checks cannot run on their behalf.',
      { userId, projectId }
    );
  }
  const role = RoleEnum.safeParse(member.role);
  if (!role.success) {
    throw new BusinessViolationException(
      'User project role is not supported; Data Quality checks cannot run on their behalf.',
      { userId, projectId, role: member.role }
    );
  }

  return {
    projectId,
    userId,
    roles: [role.data],
  };
}
