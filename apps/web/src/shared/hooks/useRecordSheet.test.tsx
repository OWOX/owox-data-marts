import { act, render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecordSheet } from './useRecordSheet';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

interface Item {
  id: string;
}

const items: Item[] = [{ id: 'c1' }, { id: 'c2' }];

type Hook = ReturnType<typeof useRecordSheet<Item>>;

function setup(
  path: string,
  records: Item[] | undefined,
  notFoundMessage?: (id: string) => string
) {
  const state: { hook?: Hook; search: string } = { search: '' };
  function Probe() {
    state.hook = useRecordSheet({
      param: 'credential',
      records,
      getId: item => item.id,
      notFoundMessage,
    });
    state.search = useLocation().search;
    return null;
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>
  );
  return state as { hook: Hook; search: string };
}

describe('useRecordSheet', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it('selects the record named by the parameter', () => {
    const s = setup('/ui/p1/credentials?credential=c2', items);
    expect(s.hook.record).toEqual({ id: 'c2' });
  });

  it('does nothing while records load', () => {
    const s = setup('/ui/p1/credentials?credential=zz', undefined, id => `No ${id}`);
    expect(s.hook.record).toBeNull();
    expect(s.search).toBe('?credential=zz');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts once and removes the parameter for an unknown id', () => {
    const s = setup('/ui/p1/credentials?credential=zz', items, id => `No ${id}`);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('No zz', { id: 'credential-not-found' });
    expect(s.search).toBe('');
  });

  it('shows the record with no toast once the records load', () => {
    const state: { hook?: Hook } = {};
    function Probe({ records }: { records: Item[] | undefined }) {
      state.hook = useRecordSheet({
        param: 'credential',
        records,
        getId: item => item.id,
        notFoundMessage: id => `No ${id}`,
      });
      return null;
    }
    const ui = (records: Item[] | undefined) => (
      <MemoryRouter initialEntries={['/ui/p1/credentials?credential=c2']}>
        <Probe records={records} />
      </MemoryRouter>
    );
    const { rerender } = render(ui(undefined));
    rerender(ui(items));
    expect(state.hook?.record).toEqual({ id: 'c2' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('removes the parameter with no toast when the open record leaves the list', () => {
    const state: { search: string } = { search: '' };
    function Probe({ records }: { records: Item[] | undefined }) {
      useRecordSheet({
        param: 'credential',
        records,
        getId: item => item.id,
        notFoundMessage: id => `No ${id}`,
      });
      state.search = useLocation().search;
      return null;
    }
    const ui = (records: Item[]) => (
      <MemoryRouter initialEntries={['/ui/p1/credentials?credential=c2']}>
        <Probe records={records} />
      </MemoryRouter>
    );
    const { rerender } = render(ui(items));
    rerender(ui([{ id: 'c1' }]));
    expect(toast.error).not.toHaveBeenCalled();
    expect(state.search).toBe('');
  });

  it('toasts for a fresh link to a record that resolved earlier and then left', () => {
    function Probe({ records }: { records: Item[] }) {
      const { open } = useRecordSheet({
        param: 'credential',
        records,
        getId: item => item.id,
        notFoundMessage: id => `No ${id}`,
      });
      openRef.current = open;
      return null;
    }
    const openRef: { current?: (id: string) => void } = {};
    const ui = (records: Item[]) => (
      <MemoryRouter initialEntries={['/ui/p1/credentials?credential=c2']}>
        <Probe records={records} />
      </MemoryRouter>
    );
    const { rerender } = render(ui(items));
    rerender(ui([{ id: 'c1' }]));
    expect(toast.error).not.toHaveBeenCalled();
    act(() => {
      openRef.current?.('c2');
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('No c2', { id: 'credential-not-found' });
  });

  it('keeps the same record across a refetch while open and takes the fresh one on reopen', () => {
    const state: { hook?: Hook } = {};
    function Probe({ records }: { records: Item[] }) {
      state.hook = useRecordSheet({ param: 'credential', records, getId: item => item.id });
      return null;
    }
    const ui = (records: Item[]) => (
      <MemoryRouter initialEntries={['/ui/p1/credentials?credential=c2']}>
        <Probe records={records} />
      </MemoryRouter>
    );
    const first = items[1];
    const { rerender } = render(ui(items));
    expect(state.hook?.record).toBe(first);

    const refetched = [{ id: 'c1' }, { id: 'c2' }];
    rerender(ui(refetched));
    expect(state.hook?.record).toBe(first);

    act(() => {
      state.hook?.close();
    });
    expect(state.hook?.record).toBeNull();
    act(() => {
      state.hook?.open('c2');
    });
    expect(state.hook?.record).toBe(refetched[1]);
  });

  it('removes the parameter without a toast when there is no message', () => {
    const s = setup('/ui/p1/credentials?credential=zz', items);
    expect(toast.error).not.toHaveBeenCalled();
    expect(s.search).toBe('');
  });

  it('open sets the parameter and keeps other parameters', () => {
    const s = setup('/ui/p1/credentials?filters=x', items);
    act(() => {
      s.hook.open('c1');
    });
    expect(new URLSearchParams(s.search).get('credential')).toBe('c1');
    expect(new URLSearchParams(s.search).get('filters')).toBe('x');
  });

  it('close removes only this parameter', () => {
    const s = setup('/ui/p1/credentials?filters=x&credential=c1', items);
    act(() => {
      s.hook.close();
    });
    expect(s.search).toBe('?filters=x');
  });

  it('builds a link with only this parameter, or null when no record is open', () => {
    const open = setup('/ui/p1/credentials?filters=x&credential=c1', items);
    expect(open.hook.link).toBe(`${window.location.origin}/ui/p1/credentials?credential=c1`);
    const closed = setup('/ui/p1/credentials?filters=x', items);
    expect(closed.hook.link).toBeNull();
  });
});
