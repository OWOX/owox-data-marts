import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutErrorBoundary } from './LayoutErrorBoundary';
import { logRouteError } from './logRouteError';

const state = vi.hoisted(() => ({ reloading: false }));

vi.mock('../../app/reload-on-stale-chunk', () => ({
  isReloadingForStaleChunk: () => state.reloading,
}));

vi.mock('./logRouteError', () => ({ logRouteError: vi.fn() }));

function renderFailingRoute() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <div>never rendered</div>,
      errorElement: <LayoutErrorBoundary />,
      loader: () => {
        throw new Error('Failed to fetch dynamically imported module');
      },
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe('LayoutErrorBoundary', () => {
  beforeEach(() => {
    state.reloading = false;
    vi.mocked(logRouteError).mockClear();
    // React Router reports loader errors on the console in tests; keep the output quiet.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows the error screen and logs the error for an ordinary route error', async () => {
    renderFailingRoute();

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(logRouteError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logRouteError).mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('stays blank and logs nothing while a stale-chunk reload is in flight', async () => {
    state.reloading = true;

    const { container } = renderFailingRoute();

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(logRouteError).not.toHaveBeenCalled();
  });
});
