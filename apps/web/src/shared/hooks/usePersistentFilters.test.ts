import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../../utils/data-layer';
import type { FilterConfigItem } from '../components/TableFilters/types';
import { usePersistentFilters } from './usePersistentFilters';

vi.mock('../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const config: FilterConfigItem[] = [
  { id: 'title', label: 'Title', dataType: 'string', operators: ['contains', 'eq'] },
  { id: 'status', label: 'Status', dataType: 'enum', operators: ['eq', 'neq'] },
];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, children);
}

describe('usePersistentFilters', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('tracks each applied filter by field and condition, without its values', () => {
    const { result } = renderHook(
      () => usePersistentFilters({ projectId: 'p1', tableId: 'data-marts-table', config }),
      { wrapper }
    );

    act(() => {
      result.current.apply({
        version: 1,
        filters: [
          { fieldId: 'title', operator: 'contains', value: ['Sessions'] },
          { fieldId: 'status', operator: 'neq', value: ['DRAFT', 'PUBLISHED'] },
        ],
      });
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'table_filters_applied',
      category: 'TableFilters',
      action: 'Apply',
      label: 'data-marts-table',
      details: 'title:contains,status:neq',
    });
  });
});
