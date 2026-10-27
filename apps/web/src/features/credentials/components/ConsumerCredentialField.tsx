import { trackCredentialCreated, type CredentialConsumer } from '../track-credential-created';
import { useCredentialDefinitions } from '../useCredentials';
import { CredentialSelectField, type CredentialSelectFieldProps } from './CredentialSelectField';
import { CredentialStateMark } from './CredentialStateMark';

export interface ConsumerCredentialFieldProps extends Omit<
  CredentialSelectFieldProps,
  'allowedDefinitionIds' | 'renderStateMark'
> {
  consumer: CredentialConsumer;
  /** The Storage or Destination type; the field offers the definitions that accept it. */
  consumerType: string;
}

/** The Credential field of a Storage or Destination form. */
export function ConsumerCredentialField({
  consumer,
  consumerType,
  onCreated,
  ...props
}: ConsumerCredentialFieldProps) {
  const { definitions } = useCredentialDefinitions();
  const allowedDefinitionIds = definitions
    .filter(definition =>
      (consumer === 'storage' ? definition.storageTypes : definition.destinationTypes)?.includes(
        consumerType
      )
    )
    .map(definition => definition.id);

  return (
    <CredentialSelectField
      {...props}
      allowedDefinitionIds={allowedDefinitionIds}
      renderStateMark={summary => <CredentialStateMark summary={summary} />}
      onCreated={credential => {
        trackCredentialCreated(consumer, consumerType, credential);
        onCreated?.(credential);
      }}
    />
  );
}
