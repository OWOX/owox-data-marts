import { Fragment, type ReactNode } from 'react';
import { AppWizardCollapsible } from '@owox/ui/components/common/wizard';
import {
  RequiredType,
  type ConnectorSpecificationResponseApiDto,
} from '../../../../../shared/api/types';
import { ConfigurationItemRender } from './ConfigurationItemRender';
import { ConfigurationOneOfRender } from './ConfigurationOneOfRender';

interface ConfigurationListRenderProps {
  items: ConnectorSpecificationResponseApiDto[];
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  onSecretEditToggle: (name: string, enable: boolean) => void;
  secretEditing: Record<string, boolean>;
  isEditingExisting: boolean;
  /** Secrets the saved configuration has a value for; a new one is an ordinary empty input. */
  storedSecrets?: ReadonlySet<string>;
  collapsibleTitle?: string;
  connectorName: string;
  onManagedOAuthModeChange?: (specificationName: string, isManaged: boolean) => void;
  keyFields?: KeyFields;
}

/** The auth fields a Credential fills: its field stands in place of the first one. */
export interface KeyFields {
  names: ReadonlySet<string>;
  first: string | undefined;
  field: ReactNode;
  /** A configuration on its old key still shows it, read-only. */
  showOldKey: boolean;
}

function renderItems(
  items: ConnectorSpecificationResponseApiDto[],
  configuration: Record<string, unknown>,
  onValueChange: (name: string, value: unknown) => void,
  onSecretEditToggle: (name: string, enable: boolean) => void,
  secretEditing: Record<string, boolean>,
  isEditingExisting: boolean,
  storedSecrets: ReadonlySet<string> | undefined,
  connectorName: string,
  onManagedOAuthModeChange?: (specificationName: string, isManaged: boolean) => void,
  keyFields?: KeyFields
) {
  return items.map(specification => {
    const item = renderItem(specification);
    if (!keyFields?.names.has(specification.name)) return item;
    return (
      <Fragment key={specification.name}>
        {specification.name === keyFields.first && keyFields.field}
        {keyFields.showOldKey && (
          <fieldset disabled className='min-w-0'>
            {item}
          </fieldset>
        )}
      </Fragment>
    );
  });

  function renderItem(specification: ConnectorSpecificationResponseApiDto) {
    const isSecret = Array.isArray(specification.attributes)
      ? specification.attributes.includes('SECRET')
      : false;

    const isSecretEditing = secretEditing[specification.name];

    if (specification.oneOf && specification.requiredType === RequiredType.OBJECT) {
      return (
        <ConfigurationOneOfRender
          key={specification.name}
          specification={specification}
          configuration={configuration}
          onValueChange={onValueChange}
          isEditingExisting={isEditingExisting}
          connectorName={connectorName}
          onManagedOAuthModeChange={onManagedOAuthModeChange}
        />
      );
    }

    return (
      <ConfigurationItemRender
        key={specification.name}
        specification={specification}
        configuration={configuration}
        isEditingExisting={
          isEditingExisting &&
          (!isSecret || !storedSecrets || storedSecrets.has(specification.name))
        }
        isSecret={isSecret}
        isSecretEditing={isSecretEditing}
        onValueChange={onValueChange}
        onSecretEditToggle={onSecretEditToggle}
        connectorName={connectorName}
      />
    );
  }
}

export function ConfigurationListRender({
  collapsibleTitle,
  items,
  configuration,
  onValueChange,
  onSecretEditToggle,
  secretEditing,
  isEditingExisting,
  storedSecrets,
  connectorName,
  onManagedOAuthModeChange,
  keyFields,
}: ConfigurationListRenderProps) {
  return collapsibleTitle ? (
    <AppWizardCollapsible title={collapsibleTitle}>
      {renderItems(
        items,
        configuration,
        onValueChange,
        onSecretEditToggle,
        secretEditing,
        isEditingExisting,
        storedSecrets,
        connectorName,
        onManagedOAuthModeChange,
        keyFields
      )}
    </AppWizardCollapsible>
  ) : (
    renderItems(
      items,
      configuration,
      onValueChange,
      onSecretEditToggle,
      secretEditing,
      isEditingExisting,
      storedSecrets,
      connectorName,
      onManagedOAuthModeChange,
      keyFields
    )
  );
}
