import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export class OwoxStorageStatementException extends BusinessViolationException {
  constructor(statementType: string) {
    super(`OWOX Storage runs SELECT queries only. This query is a ${statementType}.`);
  }
}

export class OwoxStorageQueryLimitException extends BusinessViolationException {
  constructor() {
    super(
      "This project has used today's OWOX Storage query limit. It resets at midnight Pacific Time."
    );
  }
}

export class OwoxStorageUsageUnavailableException extends BusinessViolationException {
  constructor() {
    super("OWOX Storage could not check today's query usage. Try again in a minute.");
  }
}
