import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export class OwoxStorageStatementException extends BusinessViolationException {
  constructor(statementType: string) {
    super(`OWOX Storage runs SELECT queries only. This query is a ${statementType}.`);
  }
}

export class OwoxStorageQueryLimitException extends BusinessViolationException {
  constructor(
    message = "This project has used today's OWOX Storage query limit. It resets at midnight Pacific Time."
  ) {
    super(message);
  }

  static tooLarge(): OwoxStorageQueryLimitException {
    return new OwoxStorageQueryLimitException(
      "This query would scan more than what is left of today's OWOX Storage query limit. It resets at midnight Pacific Time."
    );
  }
}

export class OwoxStorageUsageUnavailableException extends BusinessViolationException {
  constructor() {
    super("OWOX Storage could not check today's query usage. Try again in a minute.");
  }
}

export class OwoxStorageProvisioningException extends BusinessViolationException {
  constructor() {
    super('OWOX Storage could not be created. Try again later.');
  }
}

export class OwoxStorageRestoreException extends BusinessViolationException {
  constructor() {
    super('The OWOX Storage could not be restored. Try again in a few minutes.');
  }
}

export class OwoxStorageUsageReadException extends BusinessViolationException {
  constructor() {
    super('OWOX Storage usage could not be read. Try again later.');
  }
}

export class OwoxStorageTableDeleteException extends BusinessViolationException {
  constructor() {
    super('The table could not be deleted. Try again later.');
  }
}
