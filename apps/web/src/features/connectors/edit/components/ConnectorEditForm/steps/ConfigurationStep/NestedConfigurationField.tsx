import type { ConnectorSpecificationItemResponseApiDto } from '../../../../../shared/api/types';
import { AppWizardStepLabel } from '@owox/ui/components/common/wizard';
import { Button } from '@owox/ui/components/button';
import { configurationFieldRender } from './ConfigurationFieldRender';
import { SECRET_MASK } from '../../../../../../../shared/constants/secrets';

interface NestedConfigurationFieldProps {
  itemName: string;
  itemSpec: ConnectorSpecificationItemResponseApiDto;
  /** Values of the selected `oneOf` option, keyed by item name. */
  nestedConfiguration: Record<string, unknown>;
  isEditingExisting: boolean;
  isSecretEditing: boolean;
  onSecretEditToggle: (itemName: string, enable: boolean) => void;
  onValueChange: (itemName: string, value: unknown) => void;
  connectorName: string;
}

/**
 * One field of a `oneOf` option, with its label and secret edit affordance.
 *
 * Shared by the OAuth manual-entry branch and the plain `oneOf` tabs so the two
 * paths cannot drift apart on how secrets are masked, revealed and restored.
 */
export function NestedConfigurationField({
  itemName,
  itemSpec,
  nestedConfiguration,
  isEditingExisting,
  isSecretEditing,
  onSecretEditToggle,
  onValueChange,
  connectorName,
}: NestedConfigurationFieldProps) {
  // Spec-derived only: keying this off the value made it flip on the first keystroke,
  // swapping the rendered field component and remounting the input, which dropped focus.
  const isSecret = itemSpec.attributes?.includes('SECRET') ?? false;
  // A secret is masked and readonly only once stored; the backend sends those back
  // as SECRET_MASK.
  const hasStoredSecret =
    isSecret && isEditingExisting && nestedConfiguration[itemName] === SECRET_MASK;

  return (
    <div className='mb-4'>
      <div className='flex items-center justify-between'>
        <AppWizardStepLabel
          htmlFor={itemName}
          required={itemSpec.required}
          tooltip={itemSpec.description}
          className='mb-2 justify-start'
        >
          {itemSpec.title ?? itemName}
        </AppWizardStepLabel>
        {/* Editing clears the mask, so `hasStoredSecret` alone would drop the button
            and leave no way to cancel. */}
        {(hasStoredSecret || isSecretEditing) && (
          <Button
            variant='ghost'
            size='sm'
            type='button'
            onClick={() => {
              onSecretEditToggle(itemName, !isSecretEditing);
            }}
          >
            {isSecretEditing ? 'Cancel' : 'Edit'}
          </Button>
        )}
      </div>
      {configurationFieldRender({
        specification: { ...itemSpec, name: itemName },
        configuration: nestedConfiguration,
        onValueChange,
        flags: {
          // Intentionally `hasStoredSecret`, not `isEditingExisting` as the top-level
          // ConfigurationItemRender passes. This flag only drives
          // `isReadonly = isEditingExisting && !isSecretEditing` in ConfigurationSecretField,
          // and ConfigurationStep's masking loop walks top-level specs only, so nested
          // secrets are never pre-filled with SECRET_MASK on mount. Passing the raw prop
          // here would render a never-set nested secret readonly and disabled behind a
          // fake mask, with no way to enter it.
          isEditingExisting: hasStoredSecret,
          isSecret,
          isSecretEditing,
        },
        connectorName,
      })}
    </div>
  );
}
