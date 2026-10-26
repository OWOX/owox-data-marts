import { Button } from '@owox/ui/components/button';
import { FormItem } from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import type { CredentialFieldValues } from '../credential-fields';
import type { CredentialDefinitionField } from '../types';
import { credentialFieldHelp, HelpLabel } from './CredentialHelp';

const SAVED_SECRET_PLACEHOLDER = 'Saved. Enter a new value to replace it.';

interface CredentialFieldsInputsProps {
  /** Picks the tooltip, placeholder and how-to of each field. */
  definitionId?: string;
  fields: readonly CredentialDefinitionField[];
  values: CredentialFieldValues;
  errors?: Record<string, string>;
  isEditing: boolean;
  /** Saved optional secrets marked for removal. */
  clearedKeys?: readonly string[];
  /** Secret fields that hold a stored value. */
  setSecretKeys?: readonly string[];
  onToggleRemove?: (key: string) => void;
  onChange: (key: string, value: string) => void;
}

export function CredentialFieldsInputs({
  definitionId,
  fields,
  values,
  errors = {},
  isEditing,
  clearedKeys = [],
  setSecretKeys = [],
  onToggleRemove,
  onChange,
}: CredentialFieldsInputsProps) {
  return (
    <div className='flex flex-col gap-4' data-testid='credentialFields'>
      {fields.map(field => {
        const id = `credentialField${field.key.charAt(0).toUpperCase()}${field.key.slice(1)}`;
        const isSet = isEditing && field.secret && setSecretKeys.includes(field.key);
        const removable = isSet && !field.required && Boolean(onToggleRemove);
        const errorId = `${id}Error`;
        const removed = clearedKeys.includes(field.key);
        const help = credentialFieldHelp(definitionId, field.key);
        const common = {
          id,
          'data-testid': id,
          value: values[field.key] ?? '',
          placeholder: removed
            ? 'Will be removed when you save.'
            : isSet
              ? SAVED_SECRET_PLACEHOLDER
              : help?.placeholder,
          autoComplete: field.secret ? 'new-password' : 'off',
          'aria-invalid': Boolean(errors[field.key]),
          'aria-describedby': errors[field.key] ? errorId : undefined,
          maxLength: 32_768,
        };
        return (
          <FormItem key={field.key}>
            <HelpLabel htmlFor={id} tooltip={help?.tooltip}>
              {field.label}
            </HelpLabel>
            {field.input === 'multiline' ? (
              <Textarea
                {...common}
                rows={6}
                spellCheck={false}
                className='font-mono'
                onChange={event => {
                  onChange(field.key, event.target.value);
                }}
              />
            ) : (
              <Input
                {...common}
                type={field.input === 'password' ? 'password' : 'text'}
                onChange={event => {
                  onChange(field.key, event.target.value);
                }}
              />
            )}
            {removable && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='w-fit'
                aria-label={`${removed ? 'Keep saved value of' : 'Remove'} ${field.label}`}
                onClick={() => {
                  onToggleRemove?.(field.key);
                }}
              >
                {removed ? 'Keep saved value' : 'Remove'}
              </Button>
            )}
            {help?.Description && (
              <div className='text-muted-foreground text-sm'>
                <help.Description />
              </div>
            )}
            {errors[field.key] && (
              <p id={errorId} className='text-destructive text-sm'>
                {errors[field.key]}
              </p>
            )}
          </FormItem>
        );
      })}
    </div>
  );
}
