import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutErrorBoundary } from './LayoutErrorBoundary';
import { logRouteError } from './logRouteError';
import { trackEvent } from '../../utils/data-layer';

vi.mock('./logRouteError', () => ({ logRouteError: vi.fn() }));
vi.mock('../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

function renderFailingRoute(message: string) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <div>never rendered</div>,
      errorElement: <LayoutErrorBoundary />,
      loader: () => {
        throw new Error(message);
      },
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe('LayoutErrorBoundary', () => {
  beforeEach(() => {
    vi.mocked(logRouteError).mockClear();
    vi.mocked(trackEvent).mockClear();
    // React Router reports loader errors on the console in tests; keep the output quiet.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows the error screen, logs the error, and counts it as other', async () => {
    renderFailingRoute('boom');

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(logRouteError).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'route_error',
        action: 'LayoutErrorBoundary',
        label: 'other',
      })
    );
  });

  it('counts a failed chunk import as dynamic_import without the chunk URL', async () => {
    renderFailingRoute(
      'Failed to fetch dynamically imported module: https://app.example/assets/ModelCanvas-abc123.js'
    );

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(logRouteError).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'route_error',
      category: 'App',
      action: 'LayoutErrorBoundary',
      label: 'dynamic_import',
      context: window.location.pathname,
    });
  });
});
