import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const getById = vi.fn();
const getVersion = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const updateMetadata = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    getById = getById;
    getVersion = getVersion;
    saveDraft = saveDraft;
    publish = publish;
    updateMetadata = updateMetadata;
    create = vi.fn();
    activateVersion = vi.fn();
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

/** Version history as the detail endpoint returns it — oldest first, as the builder assumes. */
function detail(versions: { version: number; status: 'draft' | 'published' }[]) {
  return {
    id: 'def-1',
    name: 'MyApi',
    title: 'My API',
    description: null,
    logo: null,
    docUrl: null,
    activeVersionId: 'v2-id',
    activeVersion: 2,
    versions: versions.map(v => ({ ...v, publishedAt: v.status === 'published' ? 'x' : null })),
  };
}

/** Open the builder on `def-1`, read version `version` into it, and dirty the editor —
 * the exact sequence that makes a save land somewhere other than where it was read from. */
async function openVersionAndEdit(version: number) {
  render(<ConnectorBuilderPage id='def-1' />);
  await waitFor(() => {
    expect(getById).toHaveBeenCalled();
  });

  fireEvent.click(screen.getByTestId('version-badge'));
  const panel = await screen.findByTestId('version-history');
  fireEvent.click(
    within(within(panel).getByTestId(`version-row-${version}`)).getByText(`v${version}`)
  );
  await waitFor(() => {
    expect(getVersion).toHaveBeenCalledWith('def-1', version);
  });

  fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'Edited' } });
}

describe('saving from an older version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue(
      detail([
        { version: 1, status: 'published' },
        { version: 2, status: 'published' },
        { version: 3, status: 'draft' },
      ])
    );
    getVersion.mockImplementation((_id: string, version: number) =>
      Promise.resolve({
        version,
        status: version === 3 ? 'draft' : 'published',
        manifest: MANIFEST,
      })
    );
    saveDraft.mockResolvedValue({ version: 3, status: 'draft', publishedAt: null });
    publish.mockResolvedValue({ version: 3, status: 'published', publishedAt: 'x' });
    // Saving a draft syncs the connector's display metadata onto its row, and that response
    // is what refreshes version state afterwards — it returns the same payload getById does.
    updateMetadata.mockResolvedValue(
      detail([
        { version: 1, status: 'published' },
        { version: 2, status: 'published' },
        { version: 3, status: 'draft' },
      ])
    );
  });

  it('confirms before a save that would replace a newer draft', async () => {
    await openVersionAndEdit(1);

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    // The backend writes the manifest into the newest DRAFT row in place and is never
    // told which version was opened, so this save destroys v3's content.
    expect(await screen.findByText(/version 3/i)).toBeInTheDocument();
    expect(saveDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /replace draft/i }));
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('confirms before a publish that would replace a newer draft', async () => {
    await openVersionAndEdit(1);

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(await screen.findByText(/version 3/i)).toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /replace & publish/i }));
    await waitFor(() => {
      expect(publish).toHaveBeenCalledTimes(1);
    });
  });

  it('saves straight away when the newest version is the one being edited', async () => {
    render(<ConnectorBuilderPage id='def-1' />);
    await waitFor(() => {
      expect(getById).toHaveBeenCalled();
    });
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'Edited' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('saves straight away when the newest version is published, since nothing is overwritten', async () => {
    // A published newest version is not written in place: the save opens a new version,
    // so an older one being on screen costs nothing. Warning here would be noise.
    getById.mockResolvedValue(
      detail([
        { version: 1, status: 'published' },
        { version: 2, status: 'published' },
      ])
    );
    await openVersionAndEdit(1);

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledTimes(1);
    });
  });
});
