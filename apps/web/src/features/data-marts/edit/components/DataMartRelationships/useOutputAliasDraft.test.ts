import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SourceEntry } from './source-entries';
import { useOutputAliasDraft } from './useOutputAliasDraft';

const source: SourceEntry = {
  aliasPath: 'customers',
  title: 'Customers',
  alias: 'customers',
  depth: 0,
  fieldCount: 2,
  overrideCount: 0,
  isIncluded: true,
  fields: [],
  dataMartId: 'customers-dm',
};

describe('useOutputAliasDraft', () => {
  it('saves a rename still waiting for its typing pause when it unmounts', () => {
    const onAliasChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useOutputAliasDraft(source, 'Customers', onAliasChange)
    );

    act(() => {
      result.current.onChange('buyers');
    });
    expect(onAliasChange).not.toHaveBeenCalled();

    // The panel closes, with Escape, before the pause is over.
    unmount();

    expect(onAliasChange).toHaveBeenCalledOnce();
    expect(onAliasChange).toHaveBeenCalledWith(source, 'buyers');
  });

  it('sends nothing on unmount when the alias was not edited or is saved already', () => {
    const onAliasChange = vi.fn();
    const untouched = renderHook(() => useOutputAliasDraft(source, 'Customers', onAliasChange));
    untouched.unmount();

    const saved = renderHook(() => useOutputAliasDraft(source, 'Customers', onAliasChange));
    act(() => {
      saved.result.current.onChange('buyers');
    });
    act(() => {
      saved.result.current.onBlur();
    });
    saved.unmount();

    expect(onAliasChange).toHaveBeenCalledOnce();
  });
});
