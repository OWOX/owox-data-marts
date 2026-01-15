import { ProjectBlockedReason } from '../../data-marts/enums/project-blocked-reason.enum';
import { BusinessViolationException } from './business-violation.exception';

/**
 * Represents an exception thrown when an operation on a project is blocked due to specific reasons.
 * This exception provides detailed reasons for the block, which can be referenced externally.
 *
 * The exception message is dynamically constructed based on the reasons provided in the `blockedReasons` parameter.
 *
 * @extends {BusinessViolationException}
 */
export class ProjectOperationBlockedException extends BusinessViolationException {
  constructor(readonly blockedReasons: ProjectBlockedReason[]) {
    let message = '';
    if (blockedReasons.includes(ProjectBlockedReason.BI_PROJECT_NOT_ACTIVE)) {
      message += 'This OWOX Data Marts project is inactive. Activate the project to continue.';
    }
    if (blockedReasons.includes(ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED)) {
      message +=
        ' You’ve reached the credit limit for this OWOX Data Marts project. Upgrade your plan to get more credits.';
    }
    message = message.trim();

    if (message.length === 0) {
      message =
        'This operation is blocked for this OWOX Data Marts project. Check the project status and your subscription to continue.';
    }
    super(message, { blockedReasons });
  }
}
