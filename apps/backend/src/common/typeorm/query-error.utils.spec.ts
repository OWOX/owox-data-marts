import { QueryFailedError } from 'typeorm';
import { isUniqueConstraintViolation } from './query-error.utils';

function queryError(code: string, message: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], { code, message });
}

describe('isUniqueConstraintViolation', () => {
  it('recognizes the SQLite unique subtype', () => {
    expect(
      isUniqueConstraintViolation(
        queryError('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: item.id')
      )
    ).toBe(true);
  });

  it('does not classify a generic SQLite foreign-key constraint as unique', () => {
    expect(
      isUniqueConstraintViolation(queryError('SQLITE_CONSTRAINT', 'FOREIGN KEY constraint failed'))
    ).toBe(false);
  });
});
