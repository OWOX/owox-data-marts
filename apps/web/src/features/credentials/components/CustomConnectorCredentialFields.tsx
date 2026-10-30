import { Button } from '@owox/ui/components/button';
import { FormItem } from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { Textarea } from '@owox/ui/components/textarea';
import { Plus, Trash2 } from 'lucide-react';
import type { CustomConnectorFieldSpec } from '../types';
import { HelpLabel } from './CredentialHelp';

const MAX_FIELDS = 20;

interface CustomConnectorCredentialFieldsProps {
  /** One host per line. */
  hosts: string;
  fieldList: readonly CustomConnectorFieldSpec[];
  /** A new Credential with nothing prefilled: the hosts and field names are entered here. */
  editable: boolean;
  onHostsChange: (hosts: string) => void;
  onFieldListChange: (fieldList: CustomConnectorFieldSpec[]) => void;
}

/** The hosts and field list of a custom connector Credential; its values are the form's fields. */
export function CustomConnectorCredentialFields({
  hosts,
  fieldList,
  editable,
  onHostsChange,
  onFieldListChange,
}: CustomConnectorCredentialFieldsProps) {
  const update = (index: number, patch: Partial<CustomConnectorFieldSpec>) => {
    onFieldListChange(fieldList.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  return (
    <>
      <FormItem>
        <HelpLabel htmlFor='customConnectorHosts'>Hosts</HelpLabel>
        <Textarea
          id='customConnectorHosts'
          data-testid='customConnectorHosts'
          value={hosts}
          readOnly={!editable}
          rows={3}
          spellCheck={false}
          className='font-mono'
          placeholder='api.example.com'
          onChange={event => {
            onHostsChange(event.target.value);
          }}
        />
        <p className='text-muted-foreground text-sm'>
          {editable && 'One host per line. '}Hosts are fixed once the Credential is created.
        </p>
      </FormItem>
      {editable && (
        <FormItem>
          <HelpLabel tooltip='Name each field as the manifest parameter it fills.'>
            Fields
          </HelpLabel>
          <div className='flex flex-col gap-2' data-testid='customConnectorFieldList'>
            {fieldList.map((field, index) => {
              const name = `Field ${String(index + 1)}`;
              return (
                <div key={index} className='flex items-center gap-2'>
                  <Input
                    aria-label={`${name} key`}
                    placeholder='apiKey'
                    value={field.key}
                    maxLength={64}
                    autoComplete='off'
                    onChange={event => {
                      update(index, { key: event.target.value.trim() });
                    }}
                  />
                  <Input
                    aria-label={`${name} label`}
                    placeholder='API key'
                    value={field.label}
                    maxLength={255}
                    autoComplete='off'
                    onChange={event => {
                      update(index, { label: event.target.value });
                    }}
                  />
                  <div className='flex shrink-0 items-center gap-2 text-sm'>
                    <Switch
                      aria-label={`${name} secret`}
                      checked={field.secret}
                      onCheckedChange={secret => {
                        update(index, { secret });
                      }}
                    />
                    <span aria-hidden='true'>Secret</span>
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={`Remove ${name.toLowerCase()}`}
                    disabled={fieldList.length === 1}
                    onClick={() => {
                      onFieldListChange(fieldList.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
          {fieldList.length < MAX_FIELDS && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-fit'
              data-testid='customConnectorAddField'
              onClick={() => {
                onFieldListChange([...fieldList, { key: '', label: '', secret: true }]);
              }}
            >
              <Plus />
              Add field
            </Button>
          )}
        </FormItem>
      )}
    </>
  );
}
