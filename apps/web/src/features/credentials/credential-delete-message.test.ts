import { describe, expect, it } from 'vitest';
import { credentialDeleteBlockedMessage } from './credential-delete-message';
import type { CredentialConsumerReference } from './types';

const use = (consumerType: string, consumerId: string, requirementKey = 'key') =>
  ({ consumerType, consumerId, requirementKey, lastUsedAt: null }) as CredentialConsumerReference;

describe('credentialDeleteBlockedMessage', () => {
  it('asks to switch one Storage to another Credential', () => {
    expect(credentialDeleteBlockedMessage([use('storage', 's1')])).toBe(
      'It is still used by 1 Storage. Switch it to another Credential first.'
    );
  });

  it('asks to switch several Storages to another Credential', () => {
    expect(credentialDeleteBlockedMessage([use('storage', 's1'), use('storage', 's2')])).toBe(
      'It is still used by 2 Storages. Switch them to another Credential first.'
    );
  });

  it('counts a plugin installation once across its requirements', () => {
    expect(
      credentialDeleteBlockedMessage([
        use('plugin-installation', 'p1', 'docs'),
        use('plugin-installation', 'p1', 'sheets'),
      ])
    ).toBe('It is still used by 1 plugin. Uninstall it first.');
  });

  it('names both steps when Storages and plugins use it', () => {
    expect(
      credentialDeleteBlockedMessage([
        use('storage', 's1'),
        use('plugin-installation', 'p1'),
        use('plugin-installation', 'p2'),
      ])
    ).toBe(
      'It is still used by 1 Storage and 2 plugins. Switch the Storage to another Credential and uninstall the plugins first.'
    );
  });

  it('counts Storages and Destinations separately', () => {
    expect(
      credentialDeleteBlockedMessage([
        use('storage', 's1'),
        use('storage', 's2'),
        use('destination', 'd1'),
      ])
    ).toBe(
      'It is still used by 2 Storages and 1 Destination. Switch them to another Credential first.'
    );
  });

  it('names both steps when a Destination and a plugin use it', () => {
    expect(
      credentialDeleteBlockedMessage([use('destination', 'd1'), use('plugin-installation', 'p1')])
    ).toBe(
      'It is still used by 1 Destination and 1 plugin. Switch the Destination to another Credential and uninstall the plugin first.'
    );
  });

  it('lists Storages, Destinations and plugins as a series', () => {
    expect(
      credentialDeleteBlockedMessage([
        use('storage', 's1'),
        use('destination', 'd1'),
        use('destination', 'd2'),
        use('plugin-installation', 'p1'),
      ])
    ).toBe(
      'It is still used by 1 Storage, 2 Destinations and 1 plugin. Switch the Storage and Destinations to another Credential and uninstall the plugin first.'
    );
  });

  it('falls back to consumers for an unknown consumer type', () => {
    expect(credentialDeleteBlockedMessage([use('report', 'r1')])).toBe(
      'It is still used by 1 consumer. Remove it from that consumer first.'
    );
  });
});
