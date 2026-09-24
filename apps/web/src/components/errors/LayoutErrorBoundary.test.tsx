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

  it('shows the error screen and logs an ordinary route error without tracking it', async () => {
    renderFailingRoute('boom');

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(logRouteError).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('logs a failed chunk import and sends it to analytics', async () => {
    const message =
      'Failed to fetch dynamically imported module: https://app.example/assets/ModelCanvas-abc123.js';

    renderFailingRoute(message);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(logRouteError).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'chunk_load_error',
      category: 'App',
      action: 'LayoutErrorBoundary',
      label: message,
    });
  });
});
