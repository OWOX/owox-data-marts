import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutErrorBoundary } from './LayoutErrorBoundary';
import { logRouteError } from './logRouteError';

const state = vi.hoisted(() => ({ stale: false }));

vi.mock('../../app/stale-chunk', () => ({
  hasStaleChunk: () => state.stale,
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
    state.stale = false;
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

  it('explains the new version, offers Reload Page first, and still logs once', async () => {
    state.stale = true;

    renderFailingRoute();

    expect(await screen.findByText('A new version is available')).toBeInTheDocument();
    const reloadButton = screen.getByRole('button', { name: 'Reload Page' });
    const homeLink = screen.getByRole('link', { name: 'Guide Me Home' });
    expect(
      reloadButton.compareDocumentPosition(homeLink) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(logRouteError).toHaveBeenCalledTimes(1);
  });
});
