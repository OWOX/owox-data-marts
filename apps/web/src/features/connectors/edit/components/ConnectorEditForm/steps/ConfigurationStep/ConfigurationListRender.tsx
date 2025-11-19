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
  collapsibleTitle?: string;
  connectorName: string;
}

function renderItems(
  items: ConnectorSpecificationResponseApiDto[],
  configuration: Record<string, unknown>,
  onValueChange: (name: string, value: unknown) => void,
  onSecretEditToggle: (name: string, enable: boolean) => void,
  secretEditing: Record<string, boolean>,
  isEditingExisting: boolean,
  connectorName: string
) {
  return items.map(specification => {
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
          isSecretEditing={isSecretEditing}
          onSecretEditToggle={onSecretEditToggle}
          connectorName={connectorName}
        />
      );
    }

    return (
      <ConfigurationItemRender
        key={specification.name}
        specification={specification}
        configuration={configuration}
        isEditingExisting={isEditingExisting}
        isSecret={isSecret}
        isSecretEditing={isSecretEditing}
        onValueChange={onValueChange}
        onSecretEditToggle={onSecretEditToggle}
        connectorName={connectorName}
      />
    );
  });
}

export function ConfigurationListRender({
  collapsibleTitle,
  items,
  configuration,
  onValueChange,
  onSecretEditToggle,
  secretEditing,
  isEditingExisting,
  connectorName,
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
        connectorName
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
      connectorName
    )
  );
}
