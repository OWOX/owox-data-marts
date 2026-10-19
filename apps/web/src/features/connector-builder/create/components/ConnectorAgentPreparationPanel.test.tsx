import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectorAgentPreparationPanel } from './ConnectorAgentPreparationPanel';
import { ConnectorBuilderApiService } from '../../shared/api/connector-builder-api.service';

const state = vi.hoisted(() => ({ id: 'connector', revision: 7, loadedVersion: 2, dirty: false }));
vi.mock('../../shared/model/hooks/useBuilder', () => ({
  useBuilder: () => ({
    state,
    manifest: {
      name: 'StableName',
      nodes: { items: { request: { headers: { Custom: 'private' } } } },
    },
  }),
}));

describe('ConnectorAgentPreparationPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    state.revision = 7;
  });
  it('requires deliberate classification and approval and binds both actions to the saved revision', async () => {
    const prepare = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'prepareForAgent')
      .mockResolvedValue({ preparationId: 'prepared', expiresAt: 'later' });
    const approve = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'approveAgentTest')
      .mockResolvedValue({ approvalId: 'approved', expiresAt: 'later' });
    const revoke = vi
      .spyOn(ConnectorBuilderApiService.prototype, 'revokeAgentPreparation')
      .mockResolvedValue();
    const view = render(<ConnectorAgentPreparationPanel />);
    fireEvent.click(screen.getByText('Allow AI assistance'));
    const editing = screen.getByRole('button', { name: 'Allow safe editing' });
    expect(editing).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/nodes \/ items \/ request \/ headers \/ Custom/));
    fireEvent.click(screen.getByLabelText(/I reviewed all remaining content/));
    fireEvent.click(editing);
    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith('connector', {
        expectedRevision: 7,
        version: 2,
        protectedPaths: [['nodes', 'items', 'request', 'headers', 'Custom']],
        reviewedNonSecretContent: true,
      });
    });
    const input = screen.getByLabelText('Test parameter values as JSON');
    fireEvent.change(input, { target: { value: '{"Token":"secret"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve test credentials' }));
    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith('connector', {
        expectedRevision: 7,
        version: 2,
        configuration: { Token: 'secret' },
      });
    });
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke these approvals' }));
    await waitFor(() => {
      expect(revoke).toHaveBeenCalledTimes(2);
    });
    state.revision = 8;
    view.rerender(<ConnectorAgentPreparationPanel />);
    expect(editing).toBeDisabled();
  });
});
