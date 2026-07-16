import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../shared/components/Button';
import {
  groupDataQualityFieldRules,
  type DataQualitySelectableField,
} from '../model/data-quality.model';
import type {
  DataQualityConfig,
  DataQualityRuleConfig,
  EffectiveDataQualityRuleConfig,
} from '../model/types';
import { DataQualityFieldPicker } from './DataQualityFieldPicker';
import { DataQualityRuleEditor } from './DataQualityRuleEditor';

interface DataQualityFieldChecksProps {
  rules: EffectiveDataQualityRuleConfig[];
  draft: DataQualityConfig;
  displayedRuleKeys: string[];
  selectableFields: DataQualitySelectableField[];
  disabled: boolean;
  onAddCheck: (ruleKey: string) => void;
  onChange: (key: string, next: DataQualityRuleConfig) => void;
}

export function DataQualityFieldChecks({
  rules,
  draft,
  displayedRuleKeys,
  selectableFields,
  disabled,
  onAddCheck,
  onChange,
}: DataQualityFieldChecksProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const displayedRuleKeySet = new Set(displayedRuleKeys);
  const displayedGroups = groupDataQualityFieldRules(rules)
    .map(group => ({
      ...group,
      rules: group.rules.filter(rule => displayedRuleKeySet.has(rule.key)),
    }))
    .filter(group => group.rules.length > 0);

  return (
    <section className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>Field checks</h3>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled || selectableFields.length === 0}
          onClick={() => {
            setIsPickerVisible(current => !current);
          }}
        >
          <Plus className='size-4' aria-hidden='true' />
          Add checks
        </Button>
      </div>

      {isPickerVisible && (
        <DataQualityFieldPicker
          fields={selectableFields}
          disabled={disabled}
          onAdd={ruleKey => {
            onAddCheck(ruleKey);
            setIsPickerVisible(false);
          }}
        />
      )}

      {displayedGroups.length === 0 ? (
        <p className='text-muted-foreground rounded-md border border-dashed p-4 text-sm'>
          No field checks are configured.
        </p>
      ) : (
        <div className='space-y-3'>
          {displayedGroups.map(group => {
            const values = group.rules
              .map(rule => draft.rules.find(item => item.key === rule.key))
              .filter((value): value is DataQualityRuleConfig => value !== undefined);
            const enabledCount = values.filter(value => value.enabled).length;

            return (
              <section
                key={group.fieldId}
                aria-label={group.fieldId}
                className='space-y-3 rounded-lg border p-4'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <h4 className='text-sm font-semibold'>{group.fieldId}</h4>
                  <span className='bg-muted rounded px-2 py-0.5 text-xs'>
                    {enabledCount} enabled
                  </span>
                </div>
                <div className='space-y-3'>
                  {group.rules.map(rule => {
                    const value = draft.rules.find(item => item.key === rule.key);
                    if (!value) return null;
                    return (
                      <DataQualityRuleEditor
                        key={rule.key}
                        rule={rule}
                        value={value}
                        disabled={disabled}
                        showScopeLabel={false}
                        onChange={next => {
                          onChange(rule.key, next);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
