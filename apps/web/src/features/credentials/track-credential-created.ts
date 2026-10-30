import { trackEvent } from '../../utils/data-layer';
import type { Credential } from './types';

export type CredentialConsumer = 'storage' | 'destination' | 'connector-config';

/** Where a Credential was created: the Credentials page, a Data Mart form or the builder. */
export type CredentialCreatedFrom = 'credentials-page' | 'data-mart' | 'builder';

const CREATED_EVENT = {
  storage: { event: 'storage_credential_created', category: 'DataStorage' },
  destination: { event: 'destination_credential_created', category: 'DataDestination' },
  'connector-config': { event: 'connector_credential_created', category: 'Connector' },
} as const;

/** Reports a Credential created for a Storage, Destination or connector of the given type. */
export function trackCredentialCreated(
  consumer: CredentialConsumer,
  consumerType: string,
  credential: Credential,
  from?: CredentialCreatedFrom
) {
  trackEvent({
    ...CREATED_EVENT[consumer],
    action: credential.definition.id,
    label: consumerType,
    context: from ?? null,
    value: null,
  });
}
