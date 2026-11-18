import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { useUnsavedChangesGuard, type UnsavedChangesGuard } from './useUnsavedChangesGuard';

function setup(leaves?: (nextPathname: string) => boolean) {
  const state: { dirty: boolean; guard?: UnsavedChangesGuard } = { dirty: true };
  function Probe() {
    state.guard = useUnsavedChangesGuard(() => state.dirty, leaves);
    return <Outlet />;
  }
  let finishLoading: () => void = () => undefined;
  const loading = new Promise(resolve => {
    finishLoading = () => {
      resolve(null);
    };
  });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Probe />,
        children: [
          { index: true, element: null },
          { path: 'other', element: null },
          { path: 'slow', element: null, loader: () => loading },
        ],
      },
    ],
    { initialEntries: ['/'] }
  );
  render(<RouterProvider router={router} />);
  return {
    state: state as { dirty: boolean; guard: UnsavedChangesGuard },
    router,
    finishLoading,
  };
}

describe('useUnsavedChangesGuard', () => {
  it('blocks a navigation to another path while dirty', async () => {
    const { state, router } = setup();

    await act(() => router.navigate('/other'));

    expect(state.guard.blocked).toBe(true);
    expect(router.state.location.pathname).toBe('/');
  });

  it('lets a navigation through while clean', async () => {
    const { state, router } = setup();
    state.dirty = false;

    await act(() => router.navigate('/other'));

    expect(state.guard.blocked).toBe(false);
    expect(router.state.location.pathname).toBe('/other');
  });

  it('lets `leaves` decide instead of the path rule', async () => {
    const { state, router } = setup(nextPathname => nextPathname === '/');

    await act(() => router.navigate('/?tab=2'));
    expect(state.guard.blocked).toBe(true);
    act(() => {
      state.guard.cancelLeave();
    });

    await act(() => router.navigate('/other'));
    expect(state.guard.blocked).toBe(false);
    expect(router.state.location.pathname).toBe('/other');
  });

  it('reports a pending leave from the block until the navigation completes', async () => {
    const { state, router, finishLoading } = setup();
    expect(state.guard.isLeavePending()).toBe(false);

    act(() => {
      void router.navigate('/slow');
      expect(state.guard.isLeavePending()).toBe(true);
    });
    expect(state.guard.blocked).toBe(true);
    expect(state.guard.isLeavePending()).toBe(true);

    act(() => {
      state.guard.confirmLeave();
    });
    expect(router.state.navigation.state).toBe('loading');
    expect(state.guard.isLeavePending()).toBe(true);

    await act(async () => {
      finishLoading();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/slow');
    });
    expect(state.guard.isLeavePending()).toBe(false);
  });

  it('clears a pending leave when the member stays', async () => {
    const { state, router } = setup();
    await act(() => router.navigate('/other'));

    act(() => {
      state.guard.cancelLeave();
    });

    expect(state.guard.isLeavePending()).toBe(false);
    expect(state.guard.blocked).toBe(false);
    expect(router.state.location.pathname).toBe('/');
  });

  it('cancels beforeunload only while dirty', () => {
    const { state } = setup();

    const whileDirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(whileDirty);
    state.dirty = false;
    const whileClean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(whileClean);

    expect(whileDirty.defaultPrevented).toBe(true);
    expect(whileClean.defaultPrevented).toBe(false);
  });
});
