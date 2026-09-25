import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRouteErrorResponse } from 'react-router';
import { trackEvent } from '../../utils/data-layer';
import { classifyRouteError, trackRouteError } from './trackRouteError';

vi.mock('../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

/** The shape React Router hands a boundary for a thrown response (its ErrorResponse). */
function routeResponse(status: number) {
  const response = { status, statusText: '', internal: false, data: null };
  if (!isRouteErrorResponse(response)) throw new Error('fixture no longer matches React Router');
  return response;
}

describe('classifyRouteError', () => {
  it.each([
    ['Failed to fetch dynamically imported module: https://app.example/assets/a-1.js'],
    ['error loading dynamically imported module: https://app.example/assets/a-1.js'],
    ['Importing a module script failed.'],
  ])('classifies "%s" as dynamic_import', message => {
    expect(classifyRouteError(new Error(message))).toBe('dynamic_import');
  });

  it('classifies a failed CSS preload separately from the chunk itself', () => {
    expect(
      classifyRouteError(new Error('Unable to preload CSS for /assets/ModelCanvas-a1.css'))
    ).toBe('css_preload');
  });

  it('classifies thrown responses by status range', () => {
    expect(classifyRouteError(routeResponse(403))).toBe('http_4xx');
    expect(classifyRouteError(routeResponse(502))).toBe('http_5xx');
    expect(classifyRouteError(new Response(null, { status: 500 }))).toBe('http_5xx');
  });

  it('classifies everything else as other', () => {
    expect(classifyRouteError(new Error('Cannot read properties of undefined'))).toBe('other');
    expect(classifyRouteError('boom')).toBe('other');
    expect(classifyRouteError(undefined)).toBe('other');
  });
});

describe('trackRouteError', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

  it('sends one route_error event with the boundary, the class, and the page path', () => {
    trackRouteError(new Error('Importing a module script failed.'), 'LayoutErrorBoundary');

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'route_error',
      category: 'App',
      action: 'LayoutErrorBoundary',
      label: 'dynamic_import',
      context: window.location.pathname,
    });
  });

  it('skips a missing route, which renders no screen', () => {
    trackRouteError(routeResponse(404), 'RootErrorBoundary');

    expect(trackEvent).not.toHaveBeenCalled();
  });
});
