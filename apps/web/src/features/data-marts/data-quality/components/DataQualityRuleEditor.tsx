import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { Switch } from '@owox/ui/components/switch';
import { DATA_QUALITY_CATEGORY_LABELS, dataQualityScopeLabel } from '../model/data-quality.model';
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
  scopeLabel?: string;
  scopeDetails?: string[];
  onChange: (next: DataQualityRuleConfig) => void;
}

const SEVERITIES: DataQualitySeverity[] = ['error', 'warning', 'notice'];

export function DataQualityRuleEditor({
  rule,
  value,
  disabled,
  showScopeLabel = true,
  scopeLabel,
  scopeDetails = [],
  onChange,
}: DataQualityRuleEditorProps) {
  const title = DATA_QUALITY_CATEGORY_LABELS[rule.category];
  const controlsDisabled = disabled || !rule.isApplicable;
  const switchDisabled = disabled || (!rule.isApplicable && !value.enabled);
  const thresholdPercent = value.parameters.thresholdPercent;
  const thresholdHours = value.parameters.thresholdHours;

  return (
    <div className='rounded-lg border p-4' data-testid={`quality-rule-${value.key}`}>
      <div className='flex flex-wrap items-start justify-between gap-4'>
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
              <p className='text-sm font-medium'>{title}</p>
              {showScopeLabel && (
                <div className='text-muted-foreground text-xs'>
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

        <div className='flex flex-wrap items-end gap-3'>
          <div className='space-y-1'>
            <Label htmlFor={`${value.key}-severity`}>Severity</Label>
            <select
              id={`${value.key}-severity`}
              aria-label={`Severity for ${title}`}
              value={value.severity}
              disabled={controlsDisabled}
              onChange={event => {
                onChange({ ...value, severity: event.target.value as DataQualitySeverity });
              }}
              className='border-input bg-background h-9 rounded-md border px-3 text-sm disabled:opacity-50'
            >
              {SEVERITIES.map(severity => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </div>

          {rule.category === 'null_rate' && (
            <div className='w-36 space-y-1'>
              <Label htmlFor={`${value.key}-threshold-percent`}>Threshold, %</Label>
              <Input
                id={`${value.key}-threshold-percent`}
                aria-label='Null rate threshold percent'
                type='number'
                min={0}
                max={100}
                step='any'
                value={thresholdPercent ?? 0}
                disabled={controlsDisabled}
                onChange={event => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange({
                    ...value,
                    parameters: { ...value.parameters, thresholdPercent: next },
                  });
                }}
              />
            </div>
          )}

          {rule.category === 'data_freshness' && (
            <div className='w-36 space-y-1'>
              <Label htmlFor={`${value.key}-threshold-hours`}>Threshold, hours</Label>
              <Input
                id={`${value.key}-threshold-hours`}
                aria-label={`Data freshness threshold hours for ${dataQualityScopeLabel(rule.scope)}`}
                type='number'
                min={0}
                step='any'
                value={thresholdHours ?? 24}
                disabled={controlsDisabled}
                onChange={event => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
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
