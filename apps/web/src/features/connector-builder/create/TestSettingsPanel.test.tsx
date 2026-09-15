import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestSettingsPanel } from './components/TestSettingsPanel';
import type { ManifestParameter } from '../shared/model/manifest.types';

const params: [string, ManifestParameter][] = [
  ['Token', { requiredType: 'string', isRequired: true, attributes: ['SECRET'] }],
  ['Region', { requiredType: 'string', isRequired: false, default: 'us', label: 'Region label' }],
];

function setup(overrides: Partial<Parameters<typeof TestSettingsPanel>[0]> = {}) {
  const onChangeValue = vi.fn();
  const onRun = vi.fn();
  render(
    <TestSettingsPanel
      open
      onOpenChange={vi.fn()}
      nodeNames={['items']}
      node='items'
      onNodeChange={vi.fn()}
      paramEntries={params}
      values={{}}
      onChangeValue={onChangeValue}
      maxRows={25}
      onChangeMaxRows={vi.fn()}
      onRun={onRun}
      running={false}
      {...overrides}
    />
  );
  return { onChangeValue, onRun };
}

describe('TestSettingsPanel', () => {
  it('marks a required parameter and shows a Required hint when it is empty with no default', () => {
    setup();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('renders SECRET parameters as password inputs with a secret badge', () => {
    setup();
    expect(screen.getByTestId('test-param-Token')).toHaveAttribute('type', 'password');
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('uses the parameter label and surfaces the default as the placeholder', () => {
    setup();
    expect(screen.getByText('Region label')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Default: us')).toBeInTheDocument();
  });

  it('calls onChangeValue when a parameter input changes', () => {
    const { onChangeValue } = setup();
    fireEvent.change(screen.getByTestId('test-param-Token'), { target: { value: 'abc' } });
    expect(onChangeValue).toHaveBeenCalledWith('Token', 'abc');
  });

  it('runs the test from the panel footer', () => {
    const { onRun } = setup();
    fireEvent.click(screen.getByTestId('run-test-settings'));
    expect(onRun).toHaveBeenCalled();
  });
});
