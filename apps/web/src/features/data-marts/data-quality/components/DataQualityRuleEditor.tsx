import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { Switch } from '@owox/ui/components/switch';
import { Badge } from '@owox/ui/components/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DATA_QUALITY_CATEGORY_DESCRIPTIONS,
  DATA_QUALITY_CATEGORY_LABELS,
  dataQualityScopeLabel,
} from '../model/data-quality.model';
import type {
  DataQualityRuleConfig,
  DataQualitySeverity,
  EffectiveDataQualityRuleConfig,
} from '../model/types';

interface DataQualityRuleEditorProps {
  rule: EffectiveDataQualityRuleConfig;
  value: DataQualityRuleConfig;
  disabled: boolean;
  showScopeLabel?: boolean;
  titleSuffix?: string;
  scopeLabel?: string;
  scopeDetails?: string[];
  onChange: (next: DataQualityRuleConfig) => void;
}

const SEVERITIES: DataQualitySeverity[] = ['error', 'warning', 'notice'];
const MAX_THRESHOLD_HOURS = Math.floor(Number.MAX_SAFE_INTEGER / (60 * 60 * 1000));

export function DataQualityRuleEditor({
  rule,
  value,
  disabled,
  showScopeLabel,
  titleSuffix,
  scopeLabel,
  scopeDetails = [],
  onChange,
}: DataQualityRuleEditorProps) {
  const categoryTitle = DATA_QUALITY_CATEGORY_LABELS[rule.category];
  const title = titleSuffix ? `${categoryTitle} · ${titleSuffix}` : categoryTitle;
  const controlsDisabled = disabled || !rule.isApplicable;
  const switchDisabled = disabled || (!rule.isApplicable && !value.enabled);
  const shouldShowScopeLabel = showScopeLabel ?? rule.scope.type !== 'DATA_MART';
  const thresholdPercent = value.parameters.thresholdPercent;
  const thresholdHours = value.parameters.thresholdHours;
  const controlId = encodeURIComponent(value.key);

  return (
    <div className='group p-4' data-testid={`quality-rule-${value.key}`}>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-3'>
            <Switch
              aria-label={`Enable ${title}`}
              checked={value.enabled}
              disabled={switchDisabled}
              onCheckedChange={enabled => {
                onChange({ ...value, enabled });
              }}
            />
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>{title}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type='button'
                      aria-label={`About ${title}`}
                      className='focus-visible:ring-ring pointer-events-none rounded-sm opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none'
                    >
                      <Info className='text-muted-foreground size-3.5' aria-hidden='true' />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side='top'
                    align='start'
                    sideOffset={6}
                    className='max-w-xs'
                    role='tooltip'
                  >
                    {DATA_QUALITY_CATEGORY_DESCRIPTIONS[rule.category]}
                  </TooltipContent>
                </Tooltip>
                {!rule.isApplicable && <Badge variant='outline'>Not applicable</Badge>}
              </div>
              {shouldShowScopeLabel && (
                <div className='text-muted-foreground mt-1 text-xs'>
                  <p>{scopeLabel ?? dataQualityScopeLabel(rule.scope)}</p>
                  {scopeDetails.map(detail => (
                    <p key={detail}>{detail}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
          {!rule.isApplicable && (
            <p className='text-muted-foreground mt-2 text-xs'>
              {rule.notApplicableReason ?? 'This check is not applicable.'}
            </p>
          )}
        </div>

        <div
          className='ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-2'
          data-testid='quality-rule-controls'
        >
          <div className='flex shrink-0 items-center gap-2'>
            <Label className='whitespace-nowrap' htmlFor={`${controlId}-severity`}>
              Severity
            </Label>
            <select
              id={`${controlId}-severity`}
              aria-label={`Severity for ${title}`}
              value={value.severity}
              disabled={controlsDisabled}
              onChange={event => {
                onChange({ ...value, severity: event.target.value as DataQualitySeverity });
              }}
              className='border-input bg-background h-9 w-24 rounded-md border px-3 text-sm disabled:opacity-50'
            >
              {SEVERITIES.map(severity => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </div>

          {rule.category === 'null_rate' && (
            <div className='flex shrink-0 items-center gap-2'>
              <Label className='whitespace-nowrap' htmlFor={`${controlId}-threshold-percent`}>
                Threshold, %
              </Label>
              <NumericParameterInput
                id={`${controlId}-threshold-percent`}
                aria-label='Null rate threshold percent'
                min={0}
                max={100}
                className='w-36'
                value={thresholdPercent ?? 0}
                disabled={controlsDisabled}
                onValidValue={next => {
                  onChange({
                    ...value,
                    parameters: { ...value.parameters, thresholdPercent: next },
                  });
                }}
              />
            </div>
          )}

          {rule.category === 'data_freshness' && (
            <div className='flex shrink-0 items-center gap-2'>
              <Label className='whitespace-nowrap' htmlFor={`${controlId}-threshold-hours`}>
                Threshold, hours
              </Label>
              <NumericParameterInput
                id={`${controlId}-threshold-hours`}
                aria-label={`Data freshness threshold hours for ${dataQualityScopeLabel(rule.scope)}`}
                min={0}
                max={MAX_THRESHOLD_HOURS}
                className='w-36'
                value={thresholdHours ?? 24}
                disabled={controlsDisabled}
                onValidValue={next => {
                  onChange({
                    ...value,
                    parameters: { ...value.parameters, thresholdHours: next },
                  });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface NumericParameterInputProps {
  id: string;
  'aria-label': string;
  value: number;
  min: number;
  max: number;
  className?: string;
  disabled: boolean;
  onValidValue: (value: number) => void;
}

function NumericParameterInput({
  value,
  min,
  max,
  onValidValue,
  ...inputProps
}: NumericParameterInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const isFocused = useRef(false);
  const isValid = isValidNumericInput(inputValue, min, max);

  useEffect(() => {
    if (!isFocused.current) setInputValue(String(value));
  }, [value]);

  return (
    <Input
      {...inputProps}
      type='number'
      min={min}
      max={max}
      step='any'
      value={inputValue}
      aria-invalid={!isValid}
      onFocus={() => {
        isFocused.current = true;
      }}
      onChange={event => {
        const nextInput = event.target.value;
        setInputValue(nextInput);
        if (!isValidNumericInput(nextInput, min, max)) return;
        onValidValue(Number(nextInput));
      }}
      onBlur={() => {
        isFocused.current = false;
        if (!isValidNumericInput(inputValue, min, max)) {
          setInputValue(String(value));
        }
      }}
    />
  );
}

function isValidNumericInput(value: string, min: number, max: number): boolean {
  if (value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}
