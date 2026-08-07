import { BusinessViolationException } from './business-violation.exception';

/**
 * A run cannot execute for commercial reasons (balance, subscription, or license state).
 * Runs mapped from this become RESTRICTED rather than FAILED.
 */
export class RunRestrictedException extends BusinessViolationException {}
