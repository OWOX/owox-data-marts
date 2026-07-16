import { useState } from 'react';
import { Button } from '../../../../shared/components/Button';
import { Combobox } from '../../../../shared/components/Combobox/combobox';
import type { DataQualitySelectableField } from '../model/data-quality.model';

export interface DataQualityFieldPickerProps {
  fields: DataQualitySelectableField[];
  disabled: boolean;
  onAdd: (ruleKey: string) => void;
}

export function DataQualityFieldPicker({ fields, disabled, onAdd }: DataQualityFieldPickerProps) {
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [selectedRuleKey, setSelectedRuleKey] = useState('');
  const selectedField = fields.find(field => field.id === selectedFieldId);
  const selectedCheck = selectedField?.checks.find(check => check.key === selectedRuleKey);

  return (
    <div className='flex flex-wrap items-end gap-2'>
      <label className='block w-72 max-w-full'>
        <span className='sr-only'>Select field</span>
        <Combobox
          options={fields.map(field => ({ value: field.id, label: field.label }))}
          value={selectedFieldId}
          onValueChange={fieldId => {
            setSelectedFieldId(fieldId);
            setSelectedRuleKey('');
          }}
          placeholder='Select field'
          emptyMessage='No fields found.'
          disabled={disabled}
        />
      </label>

      <label className='block w-72 max-w-full'>
        <span className='sr-only'>Select check</span>
        <Combobox
          options={(selectedField?.checks ?? []).map(check => ({
            value: check.key,
            label: check.label,
          }))}
          value={selectedRuleKey}
          onValueChange={setSelectedRuleKey}
          placeholder='Select check'
          emptyMessage='No checks found.'
          disabled={disabled || !selectedField}
        />
      </label>

      <Button
        type='button'
        disabled={disabled || !selectedCheck}
        onClick={() => {
          if (!selectedCheck) return;
          onAdd(selectedCheck.key);
          setSelectedFieldId('');
          setSelectedRuleKey('');
        }}
      >
        Add
      </Button>
    </div>
  );
}
