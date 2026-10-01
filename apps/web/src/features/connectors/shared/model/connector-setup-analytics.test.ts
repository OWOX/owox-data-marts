import { describe, expect, it } from 'vitest';
import { connectorSetupProperties } from './connector-setup-analytics';
import type { ConnectorListItem } from './types/connector';

const custom = {
  name: 'Acme',
  displayName: 'Acme',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
  id: 'c1',
  version: 5,
} as ConnectorListItem;

describe('connectorSetupProperties', () => {
  // The connector's own `version` is its active version; the Data Mart may be pinned elsewhere.
  it('names the version the Data Mart is saved with', () => {
    expect(connectorSetupProperties(custom, 3)).toEqual({
      isCustom: true,
      connectorId: 'c1',
      connectorVersion: 3,
      versionPinned: true,
      details: JSON.stringify({
        isCustom: true,
        connectorId: 'c1',
        connectorVersion: 3,
        versionPinned: true,
      }),
    });
  });

  it('names the active version for a Data Mart that follows it', () => {
    expect(connectorSetupProperties(custom, undefined)).toMatchObject({
      isCustom: true,
      connectorId: 'c1',
      connectorVersion: 5,
      versionPinned: false,
    });
  });

  // GTM keeps the last value pushed for a key a push leaves out.
  it('sends explicit nulls for a bundled connector', () => {
    expect(connectorSetupProperties({ ...custom, isCustom: false }, undefined)).toMatchObject({
      isCustom: false,
      connectorId: null,
      connectorVersion: null,
      versionPinned: null,
    });
  });
});
