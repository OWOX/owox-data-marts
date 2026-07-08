import { pathToRegexp } from 'path-to-regexp';
import { addLeadingSlash } from '@nestjs/common/utils/shared.utils';
import { isRouteExcluded } from '@nestjs/core/router/utils';
import { RequestMethod } from '@nestjs/common';
import { MCP_OPERATION_TIMEOUT_EXCLUSIONS } from './mcp-operation-timeout-exclusions';

/**
 * Regression guard for the /mcp operation-timeout preemption. NestJS binds the module's global
 * `{*path}` middleware to the global-prefix-excluded /mcp route, so without an explicit exclusion the
 * 30s operation-timeout middleware 408s a long query_data_mart run (and bills a SUCCESS the client
 * already saw fail). This asserts our exclusion entries actually match a real /mcp request, using
 * NestJS's own `isRouteExcluded` + `pathToRegexp` — the same matching the middleware uses at runtime.
 */
describe('MCP operation-timeout exclusions', () => {
  // Mirror NestJS's mapToExcludeRoute: each entry compiles to a pathRegex over its leading-slashed path.
  const compiled = MCP_OPERATION_TIMEOUT_EXCLUSIONS.map(route => ({
    path: route.path,
    requestMethod: route.method,
    pathRegex: pathToRegexp(addLeadingSlash(route.path)).regexp,
  }));

  const isExcluded = (url: string) => isRouteExcluded(compiled, url, RequestMethod.POST);

  it('excludes the /mcp transport route and its subpaths', () => {
    expect(isExcluded('/mcp')).toBe(true);
    expect(isExcluded('/mcp/')).toBe(true);
    expect(isExcluded('/mcp/sse')).toBe(true);
  });

  it('does not over-exclude unrelated routes', () => {
    expect(isExcluded('/api/data-marts/abc')).toBe(false);
    expect(isExcluded('/api/mcp-lookalike')).toBe(false);
  });
});
