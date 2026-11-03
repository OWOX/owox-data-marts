import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { getConnectProjectTarget } from './connect-project';

const routes = [{ path: '/ui/:projectId/connect/credentials/:setupId' }];

describe('connect project target', () => {
  it.each([
    '/UI/Project-A/CONNECT/credentials/setup-1',
    '/%75i/Project-A/connect/credentials/setup-1',
    '/ui/Project-A/%63onnect/credentials/setup-1',
    '/ui/%50roject-A/connect/credentials/setup-1',
  ])('checks the project for a path that React Router accepts: %s', path => {
    const value = `${path}?source=chat#form`;
    expect(matchRoutes(routes, value)).not.toBeNull();
    expect(getConnectProjectTarget(value)).toEqual({
      projectId: 'Project-A',
      url: '/ui/Project-A/connect/credentials/setup-1?source=chat#form',
    });
  });

  it.each([
    'https://example.com/ui/Project-A/connect/credentials/setup-1',
    '//example.com/ui/Project-A/connect/credentials/setup-1',
    '/ui/project%2FA/connect/credentials/setup-1',
    '/ui/project%5CA/connect/credentials/setup-1',
    '/ui/none/connect/credentials/setup-1',
  ])('rejects an unsafe target: %s', value => {
    expect(getConnectProjectTarget(value)).toBeNull();
  });
});
