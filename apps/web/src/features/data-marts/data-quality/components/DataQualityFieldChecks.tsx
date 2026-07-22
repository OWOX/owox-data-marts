import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@owox/ui/lib/utils';
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
  fieldTypes?: Record<string, string>;
  disabled: boolean;
  onAddCheck: (ruleKey: string) => void;
  onChange: (key: string, next: DataQualityRuleConfig) => void;
}

export function DataQualityFieldChecks({
  rules,
  draft,
  displayedRuleKeys,
  selectableFields,
  fieldTypes = {},
  disabled,
  onAddCheck,
  onChange,
}: DataQualityFieldChecksProps) {
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
        <DataQualityFieldPicker
          fields={selectableFields}
          disabled={disabled || selectableFields.length === 0}
          onAdd={ruleKey => {
            onAddCheck(ruleKey);
          }}
        />
      </div>

      {displayedGroups.length === 0 ? (
        <p className='bg-background text-muted-foreground rounded-md border border-dashed p-4 text-sm'>
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
              <DataQualityFieldGroup
                key={group.fieldId}
                fieldId={group.fieldId}
                rules={group.rules}
                draft={draft}
                enabledCount={enabledCount}
                selectableField={selectableFields.find(field => field.id === group.fieldId)}
                fieldType={fieldTypes[group.fieldId]}
                disabled={disabled}
                onAddCheck={onAddCheck}
                onChange={onChange}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function DataQualityFieldGroup({
  fieldId,
  rules,
  draft,
  enabledCount,
  selectableField,
  fieldType,
  disabled,
  onAddCheck,
  onChange,
}: {
  fieldId: string;
  rules: EffectiveDataQualityRuleConfig[];
  draft: DataQualityConfig;
  enabledCount: number;
  selectableField?: DataQualitySelectableField;
  fieldType?: string;
  disabled: boolean;
  onAddCheck: (ruleKey: string) => void;
  onChange: (key: string, next: DataQualityRuleConfig) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section
      key={fieldId}
      aria-label={fieldId}
      className='bg-background overflow-hidden rounded-lg border'
    >
      <div className='flex min-h-12 items-center gap-2 px-4 py-2'>
        <button
          type='button'
          className='focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2'
          aria-expanded={isExpanded}
          onClick={() => {
            setIsExpanded(value => !value);
          }}
        >
          <ChevronDown
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              !isExpanded && '-rotate-90'
            )}
            aria-hidden='true'
          />
          <h4 className='truncate text-sm font-semibold'>{fieldId}</h4>
          {(fieldType ?? selectableField?.type) && (
            <span className='bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs'>
              {fieldType ?? selectableField?.type}
            </span>
          )}
          <span className='bg-muted rounded px-2 py-0.5 text-xs'>{enabledCount} enabled</span>
        </button>
        {selectableField && (
          <DataQualityFieldPicker
            fields={[selectableField]}
            initialFieldId={fieldId}
            triggerLabel={`Add a check to ${fieldId}`}
            disabled={disabled}
            onAdd={onAddCheck}
          />
        )}
      </div>
      {isExpanded && (
        <div className='divide-y border-t'>
          {rules.map(rule => {
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
      )}
    </section>
  );
}
