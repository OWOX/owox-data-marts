import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credential, CredentialConsumerReference } from './types';
import { customConnectorOf, useCustomConnectorLogos } from './useCustomConnectorLogos';

const FIBERY_LOGO = 'data:image/png;base64,AAAA';

const mocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  loadCustomConnectors: vi.fn(),
}));

vi.mock('../connectors/shared/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('../connectors/shared/utils')>()),
  loadCustomConnectors: mocks.loadCustomConnectors,
}));

vi.mock('../data-marts/shared/services/data-mart.service', async importOriginal => ({
  ...(await importOriginal<typeof import('../data-marts/shared/services/data-mart.service')>()),
  dataMartService: { getDataMarts: mocks.getDataMarts },
}));

describe('customConnectorOf', () => {
  const connectorByDataMartId = new Map([
    ['dm-1', 'fibery_api'],
    ['dm-2', 'fibery_api'],
    ['dm-3', 'brex_api'],
  ]);

  it('gives the connector that all Data Marts of the Credential use', () => {
    const credential = buildCredential({ usedBy: [dataMart('dm-1'), dataMart('dm-2')] });
    expect(customConnectorOf(credential, connectorByDataMartId)).toBe('fibery_api');
  });

  it('gives no connector for Data Marts of two connectors', () => {
    const credential = buildCredential({ usedBy: [dataMart('dm-1'), dataMart('dm-3')] });
    expect(customConnectorOf(credential, connectorByDataMartId)).toBeNull();
  });

  it('gives no connector for a Credential that only a Storage uses', () => {
    const credential = buildCredential({
      usedBy: [{ ...dataMart('dm-1'), consumerType: 'storage' }],
    });
    expect(customConnectorOf(credential, connectorByDataMartId)).toBeNull();
  });

  it('skips a Data Mart that is not in the list', () => {
    const credential = buildCredential({ usedBy: [dataMart('dm-hidden'), dataMart('dm-1')] });
    expect(customConnectorOf(credential, connectorByDataMartId)).toBe('fibery_api');
  });
});

describe('useCustomConnectorLogos', () => {
  beforeEach(() => {
    mocks.getDataMarts.mockReset();
    mocks.loadCustomConnectors.mockReset();
    mocks.getDataMarts.mockResolvedValue([{ id: 'dm-1', connectorSourceName: 'fibery_api' }]);
    mocks.loadCustomConnectors.mockResolvedValue([
      {
        name: 'fibery_api',
        displayName: 'Fibery',
        description: '',
        logoBase64: FIBERY_LOGO,
        docUrl: null,
        isCustom: true,
      },
    ]);
  });

  it('maps a Custom connector Credential to its connector logo', async () => {
    const credentials = [buildCredential({ usedBy: [dataMart('dm-1')] })];
    const { result } = renderHook(() => useCustomConnectorLogos(credentials));

    await waitFor(() => {
      expect(result.current.get('cc-1')).toBe(FIBERY_LOGO);
    });
    expect(mocks.getDataMarts).toHaveBeenCalledWith(
      expect.objectContaining({ skipErrorToast: true, skipLoadingIndicator: true })
    );
    expect(mocks.loadCustomConnectors).toHaveBeenCalledWith(
      expect.objectContaining({ skipErrorToast: true, skipLoadingIndicator: true })
    );
  });

  it('loads nothing without a Custom connector Credential on a Data Mart', async () => {
    const credentials = [
      buildCredential({
        id: 'builtin-1',
        definition: { ...buildCredential().definition, id: 'github', auth: { type: 'header' } },
        usedBy: [dataMart('dm-1')],
      }),
      buildCredential({ usedBy: [] }),
    ];
    const { result } = renderHook(() => useCustomConnectorLogos(credentials));
    await act(async () => {});

    expect(mocks.getDataMarts).not.toHaveBeenCalled();
    expect(mocks.loadCustomConnectors).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('loads again when a Credential gets a Data Mart', async () => {
    const { result, rerender } = renderHook(
      ({ credentials }: { credentials: Credential[] }) => useCustomConnectorLogos(credentials),
      { initialProps: { credentials: [buildCredential({ usedBy: [] })] } }
    );
    await act(async () => {});
    expect(mocks.getDataMarts).not.toHaveBeenCalled();

    rerender({ credentials: [buildCredential({ usedBy: [dataMart('dm-1')] })] });

    await waitFor(() => {
      expect(result.current.get('cc-1')).toBe(FIBERY_LOGO);
    });
  });

  it('keeps the same map for a new array of the same Credentials', async () => {
    const { result, rerender } = renderHook(
      ({ credentials }: { credentials: Credential[] }) => useCustomConnectorLogos(credentials),
      { initialProps: { credentials: [buildCredential({ usedBy: [dataMart('dm-1')] })] } }
    );
    await waitFor(() => {
      expect(result.current.get('cc-1')).toBe(FIBERY_LOGO);
    });
    const logos = result.current;

    rerender({
      credentials: [buildCredential({ title: 'Fibery key 2', usedBy: [dataMart('dm-1')] })],
    });

    expect(result.current).toBe(logos);
  });

  it('drops the logo when a later load fails', async () => {
    const { result, rerender } = renderHook(
      ({ credentials }: { credentials: Credential[] }) => useCustomConnectorLogos(credentials),
      { initialProps: { credentials: [buildCredential({ usedBy: [dataMart('dm-1')] })] } }
    );
    await waitFor(() => {
      expect(result.current.get('cc-1')).toBe(FIBERY_LOGO);
    });
    mocks.getDataMarts.mockRejectedValueOnce(new Error('Request failed'));

    rerender({
      credentials: [buildCredential({ usedBy: [dataMart('dm-1'), dataMart('dm-2')] })],
    });

    await waitFor(() => {
      expect(result.current.get('cc-1') ?? null).toBeNull();
    });
    expect(mocks.getDataMarts).toHaveBeenCalledTimes(2);
  });

  it('does not load again when the Data Marts of a Credential come in another order', async () => {
    const { result, rerender } = renderHook(
      ({ credentials }: { credentials: Credential[] }) => useCustomConnectorLogos(credentials),
      {
        initialProps: {
          credentials: [buildCredential({ usedBy: [dataMart('dm-1'), dataMart('dm-2')] })],
        },
      }
    );
    await waitFor(() => {
      expect(result.current.get('cc-1')).toBe(FIBERY_LOGO);
    });

    rerender({
      credentials: [buildCredential({ usedBy: [dataMart('dm-2'), dataMart('dm-1')] })],
    });
    await act(async () => {});

    expect(mocks.getDataMarts).toHaveBeenCalledTimes(1);
    expect(mocks.loadCustomConnectors).toHaveBeenCalledTimes(1);
  });
});

function dataMart(consumerId: string): CredentialConsumerReference {
  return {
    consumerType: 'connector-config',
    consumerId,
    title: consumerId,
    requirementKey: 'credentials',
    lastUsedAt: null,
  };
}

function buildCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'cc-1',
    projectId: 'project-1',
    title: 'Fibery key',
    definition: {
      id: 'custom-connector',
      source: 'builtin',
      displayName: 'Custom connector',
      description: '',
      secretLabel: '',
      category: 'custom-connectors',
      origins: [],
      supportsAi: false,
      ai: null,
      compatibilityLine: null,
      auth: { type: 'custom-connector' },
    },
    secretConfigured: true,
    definitionConsentRequired: false,
    enabled: true,
    availableForUse: true,
    availableForMaintenance: true,
    validationState: 'unknown',
    validationMessage: null,
    validatedAt: null,
    lastUsedAt: null,
    aiModelMappings: null,
    aiModelMappingModes: null,
    ownerUsers: [],
    contexts: [],
    usedBy: [],
    createdAt: '2026-11-17T00:00:00.000Z',
    modifiedAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  };
}
