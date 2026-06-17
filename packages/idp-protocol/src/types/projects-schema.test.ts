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

  it('parses project member roles and creation timestamp returned by the IDP project list', () => {
    const actual = ProjectsSchema.parse([
      {
        id: 'project-1',
        title: 'Project 1',
        status: 'active',
        roles: ['admin'],
        createdAt: '2026-06-01 12:30:45',
      },
    ]);

    expect(actual[0].roles).toEqual(['admin']);
    expect(actual[0].createdAt).toBe('2026-06-01 12:30:45');
  });

  it('rejects unknown project member roles in the IDP project list', () => {
    expect(() =>
      ProjectsSchema.parse([
        {
          id: 'project-1',
          title: 'Project 1',
          roles: ['owner'],
        },
      ])
    ).toThrow();
  });
});
