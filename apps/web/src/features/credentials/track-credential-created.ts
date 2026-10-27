import { trackEvent } from '../../utils/data-layer';
import type { Credential } from './types';

export type CredentialConsumer = 'storage' | 'destination';

const CREATED_EVENT = {
  storage: { event: 'storage_credential_created', category: 'DataStorage' },
  destination: { event: 'destination_credential_created', category: 'DataDestination' },
} as const;

/** Reports a Credential created for a Storage or Destination of the given type. */
export function trackCredentialCreated(
  consumer: CredentialConsumer,
  consumerType: string,
  credential: Credential
) {
  trackEvent({
    ...CREATED_EVENT[consumer],
    action: credential.definition.id,
    label: consumerType,
    context: null,
    value: null,
  });
}
