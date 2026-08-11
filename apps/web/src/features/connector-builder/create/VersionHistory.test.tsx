import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const getById = vi.fn();
const getVersion = vi.fn();
const activateVersion = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    getById = getById;
    getVersion = getVersion;
    activateVersion = activateVersion;
    create = vi.fn();
    saveDraft = vi.fn();
    publish = vi.fn();
    list = vi.fn();
    softDelete = vi.fn();
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MANIFEST = {
  version: '1.0',
  name: 'MyApi',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {},
};

/** The version numbers whose rows currently carry the "active" marker, read back from the
 * open popover. Asserting on this — rather than only on the api mock — is what makes the
 * roll-back tests notice a rollback that the server performed but the UI never reflected. */
function versionsMarkedActive(): number[] {
  const panel = screen.getByTestId('version-history');
  return [1, 2, 3].filter(
    v => within(within(panel).getByTestId(`version-row-${v}`)).queryByText('active') !== null
  );
}

describe('Version history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: 'v2-id',
      activeVersion: 2,
      versions: [
        { version: 1, status: 'published', publishedAt: '2026-06-01T00:00:00Z' },
        { version: 2, status: 'published', publishedAt: '2026-06-02T00:00:00Z' },
        { version: 3, status: 'draft', publishedAt: null },
      ],
    });
    getVersion.mockResolvedValue({ version: 3, status: 'draft', manifest: MANIFEST });
    activateVersion.mockResolvedValue({ activeVersionId: 'v1-id', activeVersion: 1 });
  });

  it('lists versions with active marker, opens an old version, and rolls back', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('version-badge'));
    const panel = await screen.findByTestId('version-history');
    expect(within(panel).getByTestId('version-row-1')).toBeInTheDocument();
    expect(within(panel).getByTestId('version-row-2')).toBeInTheDocument();
    expect(within(panel).getByTestId('version-row-3')).toBeInTheDocument();
    // v2 is active → its row shows the active marker; v3 (draft) has no "Make active"
    expect(
      within(within(panel).getByTestId('version-row-2')).getByText('active')
    ).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /make version 3 active/i })).toBeNull();

    // open v1 (read it into the editor)
    fireEvent.click(within(within(panel).getByTestId('version-row-1')).getByText('v1'));
    await waitFor(() => {
      expect(getVersion).toHaveBeenCalledWith('def-1', 1);
    });

    // roll back: make v1 active
    fireEvent.click(screen.getByTestId('version-badge'));
    const panel2 = await screen.findByTestId('version-history');
    expect(versionsMarkedActive()).toEqual([2]);
    fireEvent.click(within(panel2).getByRole('button', { name: /make version 1 active/i }));
    await waitFor(() => {
      expect(activateVersion).toHaveBeenCalledWith('def-1', 1);
    });

    // …and the roll-back is visible: the marker moved onto v1 and off v2, so the offer to
    // roll back follows it. Without this the UI could keep showing v2 as active forever.
    await waitFor(() => {
      expect(versionsMarkedActive()).toEqual([1]);
    });
    const rolledBack = screen.getByTestId('version-history');
    expect(within(rolledBack).queryByRole('button', { name: /make version 1 active/i })).toBeNull();
    expect(
      within(rolledBack).getByRole('button', { name: /make version 2 active/i })
    ).toBeInTheDocument();
  });

  it('surfaces a failed roll-back and leaves the active marker where it was', async () => {
    activateVersion.mockRejectedValue(new Error('Version 1 is not published'));
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('version-badge'));
    const panel = await screen.findByTestId('version-history');
    expect(versionsMarkedActive()).toEqual([2]);

    fireEvent.click(within(panel).getByRole('button', { name: /make version 1 active/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Version 1 is not published');
    });

    // nothing moved: v2 keeps the marker and v1 still offers the roll-back
    expect(versionsMarkedActive()).toEqual([2]);
    expect(
      within(screen.getByTestId('version-history')).getByRole('button', {
        name: /make version 1 active/i,
      })
    ).toBeInTheDocument();
  });

  it('confirms before opening a version when there are unsaved changes', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });

    // dirty the editor (type into the connector name on the General editor)
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'Edited' } });

    fireEvent.click(screen.getByTestId('version-badge'));
    const panel = await screen.findByTestId('version-history');
    fireEvent.click(within(within(panel).getByTestId('version-row-1')).getByText('v1'));

    // a destructive confirm appears; confirming discards edits and opens v1
    fireEvent.click(await screen.findByRole('button', { name: /discard & open/i }));
    await waitFor(() => {
      expect(getVersion).toHaveBeenCalledWith('def-1', 1);
    });
  });
});
