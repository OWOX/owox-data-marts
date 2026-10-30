import {
  trackCredentialCreated,
  type CredentialConsumer,
  type CredentialCreatedFrom,
} from '../track-credential-created';
import type { CredentialDefinition } from '../types';
import { useCredentialDefinitions } from '../useCredentials';
import { CredentialSelectField, type CredentialSelectFieldProps } from './CredentialSelectField';
import { CredentialStateMark } from './CredentialStateMark';

export interface ConsumerCredentialFieldProps extends Omit<
  CredentialSelectFieldProps,
  'allowedDefinitionIds' | 'renderStateMark'
> {
  consumer: CredentialConsumer;
  /** Storage or Destination type, or connector name; picks the definitions the field offers. */
  consumerType: string;
  /** Where a Credential created here is reported from; storages and destinations leave it out. */
  createdFrom?: CredentialCreatedFrom;
}

function accepts(
  definition: CredentialDefinition,
  consumer: CredentialConsumer,
  consumerType: string,
  customFit: boolean
): boolean {
  if (consumer === 'storage') return definition.storageTypes?.includes(consumerType) ?? false;
  if (consumer === 'destination') {
    return definition.destinationTypes?.includes(consumerType) ?? false;
  }
  // A custom connector names its fitting Credentials, all of the custom connector definition.
  return customFit
    ? definition.auth?.type === 'custom-connector'
    : (definition.connectors?.includes(consumerType) ?? false);
}

/** The Credential field of a Storage, a Destination or a Data Mart's connector configuration. */
export function ConsumerCredentialField({
  consumer,
  consumerType,
  createdFrom,
  onCreated,
  ...props
}: ConsumerCredentialFieldProps) {
  const { definitions } = useCredentialDefinitions();
  const allowedDefinitionIds = definitions
    .filter(definition =>
      accepts(definition, consumer, consumerType, props.allowedCredentialIds !== undefined)
    )
    .map(definition => definition.id);

  return (
    <CredentialSelectField
      {...props}
      allowedDefinitionIds={allowedDefinitionIds}
      renderStateMark={summary => <CredentialStateMark summary={summary} />}
      onCreated={credential => {
        trackCredentialCreated(consumer, consumerType, credential, createdFrom);
        onCreated?.(credential);
      }}
    />
  );
}
