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
  it('saves the inherited title as an Output Alias only when the user enters it', () => {
    const onAliasChange = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ title }) =>
        useOutputAliasDraft({ ...source, alias: undefined, title }, title, onAliasChange),
      { initialProps: { title: 'Customers' } }
    );
    expect(result.current).toMatchObject({
      value: 'Customers',
      savedValue: 'Customers',
    });
    rerender({ title: 'Partners' });
    expect(result.current).toMatchObject({
      value: 'Partners',
      savedValue: 'Partners',
    });
    act(() => {
      result.current.onBlur();
    });
    expect(onAliasChange).not.toHaveBeenCalled();
    act(() => {
      result.current.onChange('Partners');
    });
    act(() => {
      result.current.onBlur();
    });
    unmount();
    expect(onAliasChange).toHaveBeenCalledOnce();
    expect(onAliasChange).toHaveBeenCalledWith(
      expect.objectContaining({ aliasPath: 'customers' }),
      'Partners'
    );
  });

  it.each([undefined, 'Customers'])('shows the target title after clearing the alias %p', alias => {
    const onAliasChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useOutputAliasDraft({ ...source, alias }, 'Customers', onAliasChange)
    );
    act(() => {
      result.current.onChange('');
    });
    act(() => {
      result.current.onBlur();
    });
    expect(result.current.value).toBe('Customers');
    unmount();
    expect(onAliasChange.mock.calls.map(([, value]) => value)).toEqual(alias ? [''] : []);
  });

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
