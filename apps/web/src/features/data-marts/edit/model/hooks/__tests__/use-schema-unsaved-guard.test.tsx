// @vitest-environment happy-dom
import { render as rtlRender, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import {
  useSchemaUnsavedGuard,
  type SchemaGuardRegistration,
  type ResolvedSchema,
} from '../use-schema-unsaved-guard';

// useBlocker requires a data router; expose the hook result through a ref.
function makeWrapper() {
  // Mutate a property (not a reassignment) so react-hooks lint rules are satisfied.
  const captured: { current: ReturnType<typeof useSchemaUnsavedGuard> | null } = {
    current: null,
  };
  function Harness() {
    captured.current = useSchemaUnsavedGuard();
    return <Outlet />;
  }
  const router = createMemoryRouter(
    [{ path: '/', element: <Harness />, children: [{ index: true, element: <div /> }] }],
    { initialEntries: ['/'] }
  );
  return { get: () => captured.current!, router };
}

// Variant of makeWrapper that also exposes a /other child route for navigation tests.
function makeWrapperWithNav() {
  const captured: { current: ReturnType<typeof useSchemaUnsavedGuard> | null } = {
    current: null,
  };
  function Harness() {
    captured.current = useSchemaUnsavedGuard();
    return <Outlet />;
  }
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Harness />,
        children: [
          { index: true, element: <div id='home' /> },
          { path: 'other', element: <div id='other' /> },
        ],
      },
    ],
    { initialEntries: ['/'] }
  );
  return { get: () => captured.current!, router };
}

// Local render helper so the RouterProvider mounts the harness.
function render(h: ReturnType<typeof makeWrapper>) {
  rtlRender(<RouterProvider router={h.router} />);
}

const schemaA = { type: 'bigquery-data-mart-schema', fields: [] } as unknown as ResolvedSchema;
const schemaB = {
  type: 'bigquery-data-mart-schema',
  fields: [{ name: 'x' }],
} as unknown as ResolvedSchema;

function dirtyRegistration(
  overrides: Partial<SchemaGuardRegistration> = {}
): SchemaGuardRegistration {
  return {
    isDirty: () => true,
    getSchema: () => schemaB,
    save: vi.fn(async () => schemaB),
    discard: vi.fn(() => schemaA),
    ...overrides,
  };
}

describe('useSchemaUnsavedGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs the action immediately with the current schema when not dirty', async () => {
    const h = makeWrapper();
    render(h);
    const guard = h.get();
    const action = vi.fn();
    act(() => {
      guard.registerSchemaGuard({
        isDirty: () => false,
        getSchema: () => schemaA,
        save: vi.fn(async () => schemaA),
        discard: vi.fn(() => schemaA),
      });
    });
    act(() => {
      guard.runGuarded(action, { intent: 'refresh' });
    });
    await waitFor(() => {
      expect(action).toHaveBeenCalledWith(schemaA);
    });
    expect(h.get().dialog.open).toBe(false);
  });

  it('opens the dialog when dirty instead of running the action', () => {
    const h = makeWrapper();
    render(h);
    const action = vi.fn();
    act(() => {
      h.get().registerSchemaGuard(dirtyRegistration());
    });
    act(() => {
      h.get().runGuarded(action, { intent: 'ai' });
    });
    expect(action).not.toHaveBeenCalled();
    expect(h.get().dialog.open).toBe(true);
    expect(h.get().dialog.intent).toBe('ai');
  });

  it('Save & continue saves then runs the action with the saved schema', async () => {
    const h = makeWrapper();
    render(h);
    const save = vi.fn(async () => schemaB);
    const action = vi.fn();
    act(() => {
      h.get().registerSchemaGuard(dirtyRegistration({ save }));
    });
    act(() => {
      h.get().runGuarded(action, { intent: 'refresh' });
    });
    act(() => {
      h.get().dialog.onSaveAndContinue();
    });
    await waitFor(() => {
      expect(action).toHaveBeenCalledWith(schemaB);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.get().dialog.open).toBe(false);
  });

  it('Discard & continue discards then runs the action with the initial schema', async () => {
    const h = makeWrapper();
    render(h);
    const discard = vi.fn(() => schemaA);
    const action = vi.fn();
    act(() => {
      h.get().registerSchemaGuard(dirtyRegistration({ discard }));
    });
    act(() => {
      h.get().runGuarded(action, { intent: 'ai' });
    });
    act(() => {
      h.get().dialog.onDiscardAndContinue();
    });
    await waitFor(() => {
      expect(action).toHaveBeenCalledWith(schemaA);
    });
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('runs a guarded async action after discarding changes', async () => {
    const h = makeWrapperWithNav();
    rtlRender(<RouterProvider router={h.router} />);
    const discard = vi.fn(() => schemaA);
    const action = vi.fn(async () => {
      await h.router.navigate('/other');
    });
    act(() => {
      h.get().registerSchemaGuard(dirtyRegistration({ discard }));
    });
    act(() => {
      h.get().runGuarded(action, { intent: 'navigation' });
    });
    await act(async () => {
      h.get().dialog.onDiscardAndContinue();
    });
    await waitFor(() => {
      expect(discard).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledTimes(1);
      expect(h.router.state.location.pathname).toBe('/other');
    });
    expect(h.get().dialog.open).toBe(false);
  });

  it('Cancel runs nothing and closes the dialog', () => {
    const h = makeWrapper();
    render(h);
    const action = vi.fn();
    act(() => {
      h.get().registerSchemaGuard(dirtyRegistration());
    });
    act(() => {
      h.get().runGuarded(action, { intent: 'publish' });
    });
    act(() => {
      h.get().dialog.onCancel();
    });
    expect(action).not.toHaveBeenCalled();
    expect(h.get().dialog.open).toBe(false);
  });

  it('keeps the dialog open and does not run the action when save rejects', async () => {
    const h = makeWrapper();
    render(h);
    const save = vi.fn(async () => {
      throw new Error('boom');
    });
    const action = vi.fn();
    act(() => {
      h.get().registerSchemaGuard(dirtyRegistration({ save }));
    });
    act(() => {
      h.get().runGuarded(action, { intent: 'refresh' });
    });
    await act(async () => {
      h.get().dialog.onSaveAndContinue();
    });
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(action).not.toHaveBeenCalled();
    expect(h.get().dialog.open).toBe(true);
  });

  describe('navigation blocking (useBlocker)', () => {
    it('Test A — Discard & leave: dialog opens with navigation intent, proceed navigates', async () => {
      const h = makeWrapperWithNav();
      rtlRender(<RouterProvider router={h.router} />);
      // Register dirty guard so the blocker activates on navigation.
      act(() => {
        h.get().registerSchemaGuard(dirtyRegistration());
      });
      // Trigger navigation to /other; the blocker intercepts it.
      await act(async () => {
        await h.router.navigate('/other');
      });
      await waitFor(() => {
        expect(h.get().dialog.open).toBe(true);
        expect(h.get().dialog.intent).toBe('navigation');
      });
      // Discard & continue: calls discard then blocker.proceed().
      act(() => {
        h.get().dialog.onDiscardAndContinue();
      });
      await waitFor(() => {
        expect(h.router.state.location.pathname).toBe('/other');
      });
      expect(h.get().dialog.open).toBe(false);
    });

    it('Test B — Cancel: dialog closes and location stays on current path', async () => {
      const h = makeWrapperWithNav();
      rtlRender(<RouterProvider router={h.router} />);
      act(() => {
        h.get().registerSchemaGuard(dirtyRegistration());
      });
      await act(async () => {
        await h.router.navigate('/other');
      });
      await waitFor(() => {
        expect(h.get().dialog.open).toBe(true);
      });
      act(() => {
        h.get().dialog.onCancel();
      });
      await waitFor(() => {
        expect(h.get().dialog.open).toBe(false);
        expect(h.router.state.location.pathname).toBe('/');
      });
    });

    it('Test C — Save & leave: save is called and navigation completes', async () => {
      const h = makeWrapperWithNav();
      rtlRender(<RouterProvider router={h.router} />);
      const save = vi.fn(async () => schemaB);
      act(() => {
        h.get().registerSchemaGuard(dirtyRegistration({ save }));
      });
      await act(async () => {
        await h.router.navigate('/other');
      });
      await waitFor(() => {
        expect(h.get().dialog.open).toBe(true);
      });
      await act(async () => {
        h.get().dialog.onSaveAndContinue();
      });
      await waitFor(() => {
        expect(save).toHaveBeenCalledTimes(1);
        expect(h.router.state.location.pathname).toBe('/other');
      });
      expect(h.get().dialog.open).toBe(false);
    });
  });
});
