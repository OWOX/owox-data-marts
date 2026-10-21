import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/** Column references supplied by a query do not match the reporting schema. */
export class InvalidQueryColumnsException extends BusinessViolationException {}
