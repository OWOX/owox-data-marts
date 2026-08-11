import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NodesSelectionStep } from './NodesSelectionStep';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';

const connector: ConnectorListItem = {
  name: 'SampleApisSwitch',
  displayName: 'SampleAPIs — Switch',
  description: '',
  logoBase64: null,
  docUrl: null,
};

describe('NodesSelectionStep', () => {
  it('shows the node name as the label when overview is an empty string', () => {
    render(
      <MemoryRouter>
        <NodesSelectionStep
          connector={connector}
          connectorFields={[{ name: 'switch_games', overview: '', description: 'Games' }]}
          selectedField=''
          onFieldSelect={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('switch_games')).toBeInTheDocument();
  });
});
