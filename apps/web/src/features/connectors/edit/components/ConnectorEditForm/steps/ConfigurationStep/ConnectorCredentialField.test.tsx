import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FittingCredentialRefusal } from '../../../../../../connector-builder/shared/api/types';
import type { TestCredentials } from '../../../../../../connector-builder/shared/model/hooks/useTestCredentials';
import { ConnectorCredentialField } from './ConnectorCredentialField';

const fit = vi.hoisted(() => ({ state: { status: 'loading' } as TestCredentials }));
const select = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

vi.mock('../../../../../../connector-builder/shared/model/hooks/useTestCredentials', () => ({
  useTestCredentials: () => ({ state: fit.state, retry: vi.fn() }),
}));

vi.mock('../../../../../../credentials', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../../credentials')>()),
  useCredentials: () => ({ credentials: [] }),
  useCredentialDefinitions: () => ({ definitions: [] }),
  ConsumerCredentialField: (props: Record<string, unknown>) => {
    select.props = props;
    return null;
  },
}));

const DELETED = "This Data Mart's Credential was deleted. Select another Credential.";
const NO_LONGER_FITS =
  "This Data Mart's Credential no longer fits its connector. Select a fitting Credential.";
const SECRET = 'This Credential keeps API key as a public field; this connector needs it secret.';
const MISUSE = 'Key parameter "ApiKey" cannot be used in transformations.add of node "items"';

function ready(refusals: Record<string, FittingCredentialRefusal>): TestCredentials {
  return {
    status: 'ready',
    ids: ['fits'],
    refusals,
    requirement: { hosts: [], fieldList: [], keyParameters: [] },
  };
}

function renderField(props: Partial<ComponentProps<typeof ConnectorCredentialField>> = {}) {
  render(
    <ConnectorCredentialField
      connectorName='AcmeApi'
      variants={[]}
      fitting={{ connectorName: 'AcmeApi' }}
      isNew={false}
      value='kept'
      summary={null}
      onOldKey={false}
      keptCredentialId='kept'
      onChange={vi.fn()}
      {...props}
    />
  );
}

describe('ConnectorCredentialField', () => {
  beforeEach(() => {
    fit.state = ready({});
    select.props = {};
  });

  it('says the Credential was deleted until another one is picked, without a restricted summary', () => {
    renderField({
      value: null,
      keptCredentialId: null,
      summary: { access: 'restricted', state: 'deleted' },
    });

    expect(screen.getByText(DELETED)).toHaveClass('text-destructive');
    expect(select.props.summary).toBeNull();
    expect(select.props['aria-describedby']).toBe('connectorCredential-reason');
  });

  it('says nothing about a deleted Credential once another is picked', () => {
    renderField({
      value: 'fits',
      keptCredentialId: null,
      summary: { access: 'restricted', state: 'deleted' },
    });

    expect(screen.queryByText(DELETED)).not.toBeInTheDocument();
  });

  it.each([
    [
      'unfit',
      { reason: 'unfit', message: 'This Credential cannot be used with this connector.' },
      NO_LONGER_FITS,
    ],
    ['secret', { reason: 'secret', message: SECRET }, SECRET],
    ['misuse', { reason: 'misuse', message: MISUSE }, MISUSE],
  ] as const)('says why the kept Credential is refused as %s', (_reason, refusal, line) => {
    fit.state = ready({ kept: refusal });

    renderField();

    expect(screen.getByText(line)).toHaveClass('text-destructive');
  });

  it('shows no line for a fitting pick', () => {
    fit.state = ready({ kept: { reason: 'secret', message: SECRET } });

    renderField({ value: 'fits' });

    expect(document.getElementById('connectorCredential-reason')).toBeNull();
    expect(select.props['aria-describedby']).toBeUndefined();
  });
});
