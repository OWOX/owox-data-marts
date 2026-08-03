import { normalizeProjectListPagination } from './normalize-project-list-pagination';

const PUBLIC_DEFAULT_LIMIT = 100;
const PUBLIC_MAX_LIMIT = 100;
const PUBLIC_MAX_OFFSET = 100_000;

describe('normalizeProjectListPagination', () => {
  it.each([undefined, null, '', 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'uses the documented defaults for absent or non-positive values (%p)',
    value => {
      expect(normalizeProjectListPagination(value, value)).toEqual({
        limit: PUBLIC_DEFAULT_LIMIT,
        offset: 0,
      });
    }
  );

  it('floors finite fractional values', () => {
    expect(normalizeProjectListPagination(12.9, 34.9)).toEqual({
      limit: 12,
      offset: 34,
    });
  });

  it('caps limit to the maximum supported project-list page size', () => {
    expect(normalizeProjectListPagination(PUBLIC_MAX_LIMIT + 1, 0).limit).toBe(PUBLIC_MAX_LIMIT);
  });

  it('caps offset to the maximum supported project-list offset', () => {
    expect(normalizeProjectListPagination(100, PUBLIC_MAX_OFFSET + 1).offset).toBe(
      PUBLIC_MAX_OFFSET
    );
  });
});
