import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestSettingsPanel } from './components/TestSettingsPanel';
import type { ManifestParameter } from '../shared/model/manifest.types';

const field = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('../../credentials', () => ({
  ConsumerCredentialField: (props: Record<string, unknown>): ReactNode => {
    field.props = props;
    return (
      <button
        onClick={() => {
          (props.onChange as (id: string) => void)('c1');
        }}
      >
        Credential field
      </button>
    );
  },
}));

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
      secretNames={new Set(['Token'])}
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

  describe('with a Credential', () => {
    const requirement = {
      hosts: ['api.example.com'],
      fieldList: [{ key: 'Token', label: 'Token', secret: true, required: true }],
      keyParameters: ['Token'],
    };
    const control = (overrides = {}) => ({
      mode: 'values' as const,
      onModeChange: vi.fn(),
      state: { status: 'ready' as const, ids: ['c1', 'c2'], refusals: {}, requirement },
      onRetry: vi.fn(),
      value: null,
      onChange: vi.fn(),
      consumerType: 'MyApi',
      ...overrides,
    });

    it('switches between Enter values and Use a Credential', () => {
      const credential = control();
      setup({ credential });
      expect(screen.getByTestId('test-param-Token')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'Use a Credential' }));
      expect(credential.onModeChange).toHaveBeenCalledWith('credential');
    });

    it('hides the key parameters and keeps the others when a Credential is used', () => {
      setup({ credential: control({ mode: 'credential' }) });
      expect(screen.queryByTestId('test-param-Token')).not.toBeInTheDocument();
      expect(screen.getByTestId('test-param-Region')).toBeInTheDocument();
    });

    it('keeps the Parameters section and the focus while the fitting list is refetched', () => {
      const credential = control({ mode: 'credential' });
      const paramsWithMode: [string, ManifestParameter][] = [
        ['Mode', { requiredType: 'string', isRequired: false }],
        ...params,
      ];
      const props = {
        open: true,
        onOpenChange: vi.fn(),
        nodeNames: ['items'],
        node: 'items',
        onNodeChange: vi.fn(),
        paramEntries: paramsWithMode,
        secretNames: new Set(['Token']),
        values: {},
        onChangeValue: vi.fn(),
        maxRows: 25,
        onChangeMaxRows: vi.fn(),
        onRun: vi.fn(),
        running: false,
      };
      const { rerender } = render(<TestSettingsPanel {...props} credential={credential} />);
      screen.getByTestId('test-param-Mode').focus();
      rerender(
        <TestSettingsPanel
          {...props}
          credential={{ ...credential, state: { status: 'loading' as const } }}
        />
      );
      expect(screen.getByTestId('test-param-Mode')).toBe(document.activeElement);
      expect(screen.queryByTestId('test-param-Token')).not.toBeInTheDocument();
    });

    it('never asks for a GeneratedRefreshToken the author declared', () => {
      setup({
        paramEntries: [
          ...params,
          ['GeneratedRefreshToken', { requiredType: 'string', isRequired: true }],
        ],
        credential: control(),
      });
      expect(screen.queryByTestId('test-param-GeneratedRefreshToken')).not.toBeInTheDocument();
      expect(screen.getByTestId('test-param-Region')).toBeInTheDocument();
    });

    it('marks Credentials created here as coming from the builder', () => {
      setup({ credential: control({ mode: 'credential' }) });
      expect(field.props?.createdFrom).toBe('builder');
    });

    it('keeps a declared GeneratedRefreshToken out in Credential mode too', () => {
      setup({
        paramEntries: [
          ...params,
          ['GeneratedRefreshToken', { requiredType: 'string', isRequired: true }],
        ],
        credential: control({ mode: 'credential' }),
      });
      expect(screen.queryByTestId('test-param-GeneratedRefreshToken')).not.toBeInTheDocument();
      expect(screen.getByTestId('test-param-Region')).toBeInTheDocument();
    });

    it('lists only the fitting Credentials and prefills a new one from the manifest', () => {
      setup({ credential: control({ mode: 'credential' }) });
      expect(field.props).toMatchObject({
        allowedCredentialIds: ['c1', 'c2'],
        customConnectorPrefill: { hosts: ['api.example.com'], fieldList: requirement.fieldList },
      });
    });

    it('shows a failed lookup with a retry instead of a key list', () => {
      const credential = control({ mode: 'credential', state: { status: 'error' } });
      setup({ credential });
      expect(screen.queryByText('Credential field')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(credential.onRetry).toHaveBeenCalled();
    });

    it('does not run until a Credential is chosen', () => {
      setup({ credential: control({ mode: 'credential' }), runBlocked: true });
      expect(screen.getByTestId('run-test-settings')).toBeDisabled();
    });

    const misuse = 'Key parameter "Token" cannot be used in transformations.add of node "items"';
    const misusing = {
      status: 'ready' as const,
      ids: [],
      requirement: { ...requirement, misuse: [misuse] },
    };

    it('says why no Credential fits a manifest that misuses a key parameter', () => {
      setup({ credential: control({ mode: 'credential', state: misusing }), runBlocked: true });
      expect(screen.getByText(misuse)).toBeInTheDocument();
    });

    it('keeps the misuse out of Enter values, where typed keys are not restricted', () => {
      setup({ credential: control({ state: misusing }) });
      expect(screen.queryByText(misuse)).not.toBeInTheDocument();
    });
  });
});
