import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ConnectorSelectionStep } from './ConnectorSelectionStep';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';

// ConnectorSelectionStep renders InviteTeammatesCard which calls useProjectRoute.
// Stub it to avoid wiring the auth/project-id provider.
vi.mock('../../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate: vi.fn(), scope: (p: string) => p }),
}));

// trackEvent is a no-op in unit tests — window.dataLayer is undefined.
// No mock needed; the real function just returns early.

const PUBLISHED: ConnectorListItem = {
  name: 'PubCustom',
  displayName: 'Pub Custom',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
  id: 'c1',
  version: 2,
};

const DRAFT: ConnectorListItem = {
  name: 'DraftCustom',
  displayName: 'Draft Custom',
  description: '',
  logoBase64: null,
  docUrl: null,
  isCustom: true,
  id: 'c2',
  version: undefined,
};

function renderStep(
  onConnectorSelect: (connector: ConnectorListItem) => void = vi.fn(),
  onEditConnector?: (c: ConnectorListItem) => void
) {
  return render(
    <MemoryRouter>
      <ConnectorSelectionStep
        connectors={[]}
        customConnectors={[PUBLISHED, DRAFT]}
        selectedConnector={null}
        loading={false}
        error={null}
        onConnectorSelect={onConnectorSelect}
        onCreateNew={vi.fn()}
        onEditConnector={onEditConnector}
      />
    </MemoryRouter>
  );
}

describe('ConnectorSelectionStep — draft-only custom connectors', () => {
  it('shows "Publish to use" badge on the draft-only card', () => {
    renderStep(vi.fn());
    expect(screen.getByText('Publish to use')).toBeInTheDocument();
  });

  it('does NOT call onConnectorSelect when clicking the draft-only card', () => {
    const onConnectorSelect = vi.fn();
    renderStep(onConnectorSelect);

    // Click the draft card title (the click target inside the grid item).
    fireEvent.click(screen.getByText('Draft Custom'));

    expect(onConnectorSelect).not.toHaveBeenCalled();
  });

  it('does NOT call onConnectorSelect when double-clicking the draft-only card', () => {
    const onConnectorSelect = vi.fn();
    renderStep(onConnectorSelect);

    fireEvent.doubleClick(screen.getByText('Draft Custom'));

    expect(onConnectorSelect).not.toHaveBeenCalled();
  });

  it('explains why the draft-only card cannot be used', () => {
    renderStep(vi.fn());
    expect(screen.getByText('Publish to use')).toHaveAttribute(
      'title',
      'Not published yet — publish it in the builder first.'
    );
  });

  it('does not show "Coming soon" tooltip text for the draft-only card', () => {
    renderStep(vi.fn());
    // The "Coming soon" tooltip is only rendered when disabled=true is passed to
    // AppWizardGridItem. With disabled removed, the tooltip node is never in the DOM.
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('calls onConnectorSelect with the published custom item when clicked', () => {
    const onConnectorSelect = vi.fn();
    renderStep(onConnectorSelect);

    fireEvent.click(screen.getByText('Pub Custom'));

    expect(onConnectorSelect).toHaveBeenCalledTimes(1);
    expect(onConnectorSelect).toHaveBeenCalledWith(PUBLISHED);
  });

  it('renders an Edit action per custom connector that reports the connector', () => {
    const onEditConnector = vi.fn();
    renderStep(vi.fn(), onEditConnector);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Draft Custom' }));
    expect(onEditConnector).toHaveBeenCalledWith(DRAFT);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Pub Custom' }));
    expect(onEditConnector).toHaveBeenCalledWith(PUBLISHED);
  });

  it('the draft Edit action works even though the card is not selectable for a run', () => {
    const onConnectorSelect = vi.fn();
    const onEditConnector = vi.fn();
    renderStep(onConnectorSelect, onEditConnector);
    fireEvent.click(screen.getByText('Draft Custom'));
    expect(onConnectorSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Draft Custom' }));
    expect(onEditConnector).toHaveBeenCalledWith(DRAFT);
  });
});
