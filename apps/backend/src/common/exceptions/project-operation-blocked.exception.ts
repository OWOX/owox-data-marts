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
      message += 'Project is not active.';
    }
    if (blockedReasons.includes(ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED)) {
      message += ' Project credits limit is reached.';
    }
    message = message.trim();

    if (message.length === 0) {
      message = 'Project operation is blocked. Please check your subscription and credits balance.';
    }
    super(message, { blockedReasons });
  }
}
