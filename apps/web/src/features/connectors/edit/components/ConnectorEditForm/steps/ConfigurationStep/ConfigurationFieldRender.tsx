import type { ConnectorSpecificationResponseApiDto } from '../../../../../shared/api/types';
import { RequiredType } from '../../../../../shared/api';
import {
  ConfigurationSecretField,
  ConfigurationComboboxField,
  ConfigurationBooleanField,
  ConfigurationNumberField,
  ConfigurationArrayField,
  ConfigurationObjectField,
  ConfigurationDateField,
  ConfigurationStringField,
} from './ConfigurationField';
import { OauthRenderFactory } from './Oauth/OauthRenderFactory';

interface ConfigurationStepFieldRenderProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  flags?: { isSecret?: boolean; isEditingExisting?: boolean; isSecretEditing?: boolean };
  connectorName: string;
}

export function configurationFieldRender({
  specification,
  configuration,
  onValueChange,
  flags,
  connectorName,
}: ConfigurationStepFieldRenderProps) {
  const { requiredType, options: specOptions } = specification;
  const { isSecret = false, isEditingExisting = false, isSecretEditing = false } = flags ?? {};
  const isOAuthFlow =
    specification.attributes &&
    Array.isArray(specification.attributes) &&
    specification.attributes.includes('OAUTH_FLOW');

  if (isOAuthFlow) {
    return (
      <OauthRenderFactory
        specification={specification}
        configuration={configuration}
        onValueChange={onValueChange}
        connectorName={connectorName}
      />
    );
  }

  if (isSecret) {
    return (
      <ConfigurationSecretField
        specification={specification}
        configuration={configuration}
        onValueChange={onValueChange}
        isEditingExisting={isEditingExisting}
        isSecretEditing={isSecretEditing}
      />
    );
  }

  if (specOptions && specOptions.length > 0) {
    return (
      <ConfigurationComboboxField
        specification={specification}
        configuration={configuration}
        onValueChange={onValueChange}
        specOptions={specOptions}
      />
    );
  }

  switch (requiredType) {
    case RequiredType.BOOLEAN:
      return (
        <ConfigurationBooleanField
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
        />
      );

    case RequiredType.NUMBER:
      return (
        <ConfigurationNumberField
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
        />
      );

    case RequiredType.ARRAY:
      return (
        <ConfigurationArrayField
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
        />
      );

    case RequiredType.OBJECT:
      return (
        <ConfigurationObjectField
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
        />
      );

    case RequiredType.DATE: {
      return (
        <ConfigurationDateField
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
        />
      );
    }

    case RequiredType.STRING:
    default:
      return (
        <ConfigurationStringField
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
        />
      );
  }
}
