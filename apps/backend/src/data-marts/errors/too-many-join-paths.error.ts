import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

// Join paths are enumerated in memory, and a dense relationship graph has millions of them.
export const MAX_JOIN_PATHS = 5000;

export function throwTooManyJoinPathsError(): never {
  throw new BusinessViolationException(
    `The relationships of this storage give this Data Mart more than ${MAX_JOIN_PATHS} join paths. ` +
      'Remove the relationships that repeat an existing path, for example reverse relationships.',
    { maxJoinPaths: MAX_JOIN_PATHS },
    'TOO_MANY_JOIN_PATHS'
  );
}
