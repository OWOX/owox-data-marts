// Imported by migration 1793000000000: keep it and its imports free of Nest and runtime services.
import {
  CREDENTIAL_CONSUMER_TYPE_CONNECTOR_CONFIG,
  type AcceptedCredentialRequirement,
} from '../credentials/credential.types';
import {
  CUSTOM_CONNECTOR_DEFINITION_ID,
  sourceCredentialDefinitions,
} from './source-credential-definitions';

/** A configuration binds as (`connector-config`, Data Mart id, configuration `_id`). */
export const SOURCE_BINDING_CONSUMER_TYPE = CREDENTIAL_CONSUMER_TYPE_CONNECTOR_CONFIG;

/** Any Source definition; which ones a connector takes is checked where a Credential is selected. */
export function sourceCredentialRequirement(): AcceptedCredentialRequirement {
  const bindings = Object.values(sourceCredentialDefinitions().bindings).flat();
  return {
    definitionIds: [
      ...new Set([CUSTOM_CONNECTOR_DEFINITION_ID, ...bindings.map(item => item.definitionId)]),
    ],
    // No Source definition is a Google sign-in.
    scopes: [],
  };
}
