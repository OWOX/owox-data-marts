import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

export class OwoxStorageStatementException extends BusinessViolationException {
  constructor(statementType: string) {
    super(`OWOX Storage runs SELECT queries only. This query is a ${statementType}.`);
  }
}

/** Google's daily query quota stopped the job: of this storage, or of all storages together. */
export class OwoxStorageQueryLimitException extends BusinessViolationException {
  constructor() {
    super(
      'OWOX Storage has used its query capacity for today. It resets at midnight Pacific Time. If you need it sooner, contact support.'
    );
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
