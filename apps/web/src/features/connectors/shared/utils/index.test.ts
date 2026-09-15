import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getAvailableConnectors, list } = vi.hoisted(() => ({
  getAvailableConnectors: vi.fn(),
  list: vi.fn(),
}));

vi.mock('../api/connector-api.service.ts', () => ({
  ConnectorApiService: class {
    getAvailableConnectors = getAvailableConnectors;
  },
}));
vi.mock('../../../connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = list;
  },
}));

import { getConnectorInfoByName } from './index';

const BUNDLED = [
  { name: 'GoogleAds', title: 'Google Ads', description: null, logo: null, docUrl: null },
  { name: 'Dup', title: 'Bundled Dup', description: null, logo: null, docUrl: null },
];

const customItem = (over: Record<string, unknown> = {}) => ({
  id: 'c2',
  name: 'SampleApisSwitch',
  title: 'SampleAPIs — Switch',
  description: null,
  logo: null,
  docUrl: null,
  activeVersionId: 'v1',
  activeVersion: 3,
  ...over,
});

describe('getConnectorInfoByName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAvailableConnectors.mockResolvedValue(BUNDLED);
  });

  it('resolves a custom connector by name with isCustom/id/version', async () => {
    list.mockResolvedValue([customItem()]);
    const info = await getConnectorInfoByName('SampleApisSwitch');
    expect(info).toMatchObject({ name: 'SampleApisSwitch', isCustom: true, id: 'c2', version: 3 });
  });

  it('resolves a bundled connector by name (not custom)', async () => {
    list.mockResolvedValue([]);
    const info = await getConnectorInfoByName('GoogleAds');
    expect(info?.name).toBe('GoogleAds');
    expect(info?.isCustom).toBeFalsy();
    expect(list).not.toHaveBeenCalled();
  });

  it('returns null for an unknown name', async () => {
    list.mockResolvedValue([]);
    expect(await getConnectorInfoByName('Nope')).toBeNull();
  });

  it('prefers a bundled connector over a custom one on a name collision', async () => {
    list.mockResolvedValue([
      customItem({ id: 'cdup', name: 'Dup', title: 'Custom Dup', activeVersion: 1 }),
    ]);
    const info = await getConnectorInfoByName('Dup');
    expect(info?.isCustom).toBeFalsy();
    expect(info?.displayName).toBe('Bundled Dup');
  });

  it('returns null (no throw) when the custom list fetch fails', async () => {
    list.mockRejectedValue(new Error('network'));
    expect(await getConnectorInfoByName('OnlyCustom')).toBeNull();
    expect((await getConnectorInfoByName('GoogleAds'))?.name).toBe('GoogleAds');
  });
});
