// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DataQualityConfig, EffectiveDataQualityRuleConfig } from '../model/types';
import { DataQualityFieldChecks } from './DataQualityFieldChecks';

describe('DataQualityFieldChecks', () => {
  it('shows only displayed rules and adds one explicitly selected hidden check', async () => {
    const rules: EffectiveDataQualityRuleConfig[] = [
      fieldRule('null_rate'),
      fieldRule('constant_column'),
    ];
    const draft: DataQualityConfig = {
      timezone: 'UTC',
      rules: rules.map(rule => ({
        key: rule.key,
        category: rule.category,
        scope: rule.scope,
        severity: rule.severity,
        enabled: false,
        parameters: rule.parameters,
      })),
    };
    const onAddCheck = vi.fn();

    render(
      <DataQualityFieldChecks
        rules={rules}
        draft={draft}
        displayedRuleKeys={['null_rate:field:email']}
        selectableFields={[
          {
            id: 'email',
            label: 'email',
            checks: [
              {
                key: 'constant_column:field:email',
                label: 'Constant column',
              },
            ],
          },
        ]}
        disabled={false}
        onAddCheck={onAddCheck}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Null rate')).toBeInTheDocument();
    expect(screen.queryByText('Constant column')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add checks' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Select field' }));
    fireEvent.click(screen.getByRole('option', { name: 'email' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Select check' }));
    fireEvent.click(screen.getByRole('option', { name: 'Constant column' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

    expect(onAddCheck).toHaveBeenCalledOnce();
    expect(onAddCheck).toHaveBeenCalledWith('constant_column:field:email');
  });
});

function fieldRule(category: 'null_rate' | 'constant_column'): EffectiveDataQualityRuleConfig {
  return {
    key: `${category}:field:email`,
    category,
    scope: { type: 'FIELD', fieldId: 'email' },
    severity: category === 'constant_column' ? 'notice' : 'warning',
    enabled: false,
    parameters: category === 'null_rate' ? { thresholdPercent: 0 } : {},
    isApplicable: true,
  };
}
