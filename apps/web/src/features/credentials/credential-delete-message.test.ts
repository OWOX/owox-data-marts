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

  it('falls back to consumers for an unknown consumer type', () => {
    expect(credentialDeleteBlockedMessage([use('report', 'r1')])).toBe(
      'It is still used by 1 consumer. Remove it from that consumer first.'
    );
  });
});
