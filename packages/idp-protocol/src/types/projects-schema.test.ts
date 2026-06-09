import { describe, expect, it } from '@jest/globals';
import { ProjectsSchema } from './models.js';

describe('ProjectsSchema', () => {
  it('parses project status returned by the IDP project list', () => {
    const actual = ProjectsSchema.parse([
      {
        id: 'blocked-project',
        title: 'Blocked Project',
        status: 'blocked',
      },
    ]);

    expect(actual[0].status).toBe('blocked');
  });

  it('rejects unknown project statuses', () => {
    expect(() =>
      ProjectsSchema.parse([
        {
          id: 'archived-project',
          title: 'Archived Project',
          status: 'archived',
        },
      ])
    ).toThrow();
  });
});
