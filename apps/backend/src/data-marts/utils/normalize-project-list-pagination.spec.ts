import { normalizeProjectListPagination } from './normalize-project-list-pagination';

const MAX_PROJECT_LIST_OFFSET = 100_000;

describe('normalizeProjectListPagination', () => {
  it('caps offset to the maximum supported project-list offset', () => {
    expect(normalizeProjectListPagination(100, MAX_PROJECT_LIST_OFFSET + 1).offset).toBe(
      MAX_PROJECT_LIST_OFFSET
    );
  });
});
