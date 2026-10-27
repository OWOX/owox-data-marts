import { render, screen } from '@testing-library/react';
import type { CellContext } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { credentialStateLabel } from '../../../../../credentials/credential-state-copy';
import type { CredentialState, CredentialSummary } from '../../../../../credentials';
import { getDataDestinationColumns, type DataDestinationTableItem } from './columns';

function renderTitleCell(reusableCredential: CredentialSummary | null | undefined) {
  const cell = getDataDestinationColumns()[0].cell as (
    context: CellContext<DataDestinationTableItem, unknown>
  ) => React.ReactNode;
  const row = { getValue: () => 'Weekly Sheets', original: { reusableCredential } };
  return render(<>{cell({ row } as unknown as CellContext<DataDestinationTableItem, unknown>)}</>);
}

// The title cell holds only the title unless a mark is added.
const titleCellChildren = (container: HTMLElement) => container.firstElementChild?.children.length;

describe('Destination title column', () => {
  const credential = {
    access: 'visible',
    id: 'sa-1',
    title: 'Sheets key',
    definitionId: 'google-service-account',
    providerName: 'Google Service Account',
    identity: 'sa@project.iam.gserviceaccount.com',
  } as const;

  it.each([
    ['a ready Credential', { ...credential, state: 'ready' }],
    ['a ready Credential the member cannot see', { access: 'restricted', state: 'ready' }],
    ['a Destination on its own key', { access: 'pending', state: 'ready' }],
    ['a Destination without a Credential (Email, Slack, Teams, Looker)', null],
    ['a Destination embedded without a summary', undefined],
  ] as const)('shows no mark for %s', (_, summary) => {
    const { container } = renderTitleCell(summary);

    expect(screen.getByText('Weekly Sheets')).toBeInTheDocument();
    expect(titleCellChildren(container)).toBe(1);
    expect(screen.queryByText('sa@project.iam.gserviceaccount.com')).not.toBeInTheDocument();
  });

  it.each(['disabled', 'not-configured', 'reconnect-required', 'reauthorize-required'] as const)(
    'marks the title when the Credential is %s',
    (state: Exclude<CredentialState, 'ready'>) => {
      const { container } = renderTitleCell({ ...credential, state });

      expect(screen.getByText(credentialStateLabel('visible', state))).toBeInTheDocument();
      expect(titleCellChildren(container)).toBe(2);
      expect(screen.queryByText('sa@project.iam.gserviceaccount.com')).not.toBeInTheDocument();
    }
  );

  it('asks a member who cannot see the Credential to reach its owner', () => {
    renderTitleCell({ access: 'restricted', state: 'reauthorize-required' });

    expect(screen.getByText("Ask the Credential's owner to reconnect it")).toBeInTheDocument();
  });
});
