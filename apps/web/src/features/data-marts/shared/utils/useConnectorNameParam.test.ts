import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect } from 'vitest';
import { useConnectorNameParam } from './useConnectorNameParam';
import { useDataMartPreset } from './useDataMartPreset';

function wrapperWithSearch(search: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      MemoryRouter,
      { initialEntries: [`/data-marts/create${search}`] },
      children
    );
  };
}

describe('useConnectorNameParam', () => {
  it('resolves both the input type and connector selection for a new draft setup link', () => {
    const { result } = renderHook(
      () => ({
        preset: useDataMartPreset(),
        connectorName: useConnectorNameParam(),
      }),
      { wrapper: wrapperWithSearch('?preset=connector&connectorName=GoogleSheets') }
    );

    expect(result.current.preset?.definitionType).toBe('CONNECTOR');
    expect(result.current.connectorName).toBe('GoogleSheets');
  });

  it('returns the connectorName query param when present', () => {
    const { result } = renderHook(() => useConnectorNameParam(), {
      wrapper: wrapperWithSearch('?connectorName=FacebookMarketing'),
    });

    expect(result.current).toBe('FacebookMarketing');
  });

  it('returns null when the connectorName query param is absent', () => {
    const { result } = renderHook(() => useConnectorNameParam(), {
      wrapper: wrapperWithSearch(''),
    });

    expect(result.current).toBeNull();
  });

  it('returns null when the connectorName query param is blank', () => {
    const { result } = renderHook(() => useConnectorNameParam(), {
      wrapper: wrapperWithSearch('?connectorName=   '),
    });

    expect(result.current).toBeNull();
  });

  it('trims surrounding whitespace from the connectorName query param', () => {
    const { result } = renderHook(() => useConnectorNameParam(), {
      wrapper: wrapperWithSearch('?connectorName=%20TikTokAds%20'),
    });

    expect(result.current).toBe('TikTokAds');
  });
});
