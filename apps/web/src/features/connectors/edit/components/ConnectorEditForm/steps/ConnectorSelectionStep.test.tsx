import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ConnectorSelectionStep } from './ConnectorSelectionStep';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';

vi.mock('../../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate: vi.fn(), scope: (p: string) => p }),
}));

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

const BUILT_IN: ConnectorListItem = {
  name: 'GoogleAds',
  displayName: 'Google Ads',
  description: '',
  logoBase64: LOGO,
  docUrl: null,
};

const customConnector = (id: string, displayName: string, logoBase64: string | null) => ({
  name: displayName.replace(/\s/g, ''),
  displayName,
  description: '',
  logoBase64,
  docUrl: null,
  isCustom: true,
  id,
  version: 1,
});

function renderStep(customConnectors: ConnectorListItem[], { canCreate = true } = {}) {
  return render(
    <MemoryRouter>
      <ConnectorSelectionStep
        connectors={[BUILT_IN]}
        customConnectors={customConnectors}
        selectedConnector={null}
        loading={false}
        error={null}
        onConnectorSelect={vi.fn()}
        onCreateNew={canCreate ? vi.fn() : undefined}
      />
    </MemoryRouter>
  );
}

describe('ConnectorSelectionStep', () => {
  it('puts the invite-teammates row at the bottom, below the custom connectors', () => {
    renderStep([customConnector('c1', 'npm downloads', null)]);

    const createButton = screen.getByRole('button', { name: '+ Create custom connector' });
    const invite = screen.getByText('Invite teammates');
    expect(createButton.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('drops the empty custom section, not the invite row, for a user who cannot create one', () => {
    renderStep([], { canCreate: false });

    expect(screen.queryByText('Custom Connectors')).not.toBeInTheDocument();
    expect(screen.getByText('Invite teammates')).toBeInTheDocument();
  });

  it('marks every custom connector that has no logo of its own as custom', () => {
    renderStep([
      customConnector('c1', 'npm downloads', null),
      customConnector('c2', 'Weather API', null),
      customConnector('c3', 'Branded API', LOGO),
    ]);

    expect(screen.getAllByRole('img', { name: 'Custom connector' })).toHaveLength(2);
  });
});
