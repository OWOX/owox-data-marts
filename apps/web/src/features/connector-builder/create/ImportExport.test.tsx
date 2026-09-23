import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const getById = vi.fn();
const getVersion = vi.fn();
const downloadBlob = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    getById = getById;
    getVersion = getVersion;
    activateVersion = vi.fn();
    create = vi.fn();
    saveDraft = vi.fn();
    publish = vi.fn();
    list = vi.fn();
    softDelete = vi.fn();
    test = vi.fn();
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../data-marts/model-canvas/export/download', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));

const MANIFEST = {
  version: '1.0',
  name: 'MyApi',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {},
};

const manifestFile = (content: string, fileName = 'manifest.json') =>
  new File([content], fileName, { type: 'application/json' });

const importFile = (file: File) => {
  fireEvent.change(screen.getByTestId('builderImportInput'), { target: { files: [file] } });
};

const breadcrumbName = () => screen.getByTestId('builder-topbar').textContent;

async function renderExisting() {
  render(<ConnectorBuilderPage id='def-1' />);
  await waitFor(() => {
    expect(breadcrumbName()).toContain('MyApi');
  });
}

function openMoreActions() {
  fireEvent.pointerDown(screen.getByTestId('builder-more'), { button: 0, ctrlKey: false });
}

describe('Builder import and export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: 'v1-id',
      activeVersion: 1,
      versions: [{ version: 1, status: 'published', publishedAt: '2026-06-01T00:00:00Z' }],
    });
    getVersion.mockResolvedValue({ version: 1, status: 'published', manifest: MANIFEST });
  });

  it('exports the current manifest as <name>.json', async () => {
    await renderExisting();
    openMoreActions();
    fireEvent.click(await screen.findByTestId('builderExportJson'));

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(fileName).toBe('MyApi.json');
    expect(JSON.parse(await blob.text())).toMatchObject({
      name: 'MyApi',
      baseUrl: 'https://api.example.com',
    });
  });

  it('links the guide for AI assistants from the menu', async () => {
    await renderExisting();
    openMoreActions();
    const guide = await screen.findByTestId('builderAiGuide');

    expect(guide).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/connectors/manifest-reference.llms.txt'
    );
    expect(guide).toHaveAttribute('target', '_blank');
  });

  it('opens the file picker from the menu', async () => {
    await renderExisting();
    const click = vi.spyOn(screen.getByTestId('builderImportInput'), 'click');
    openMoreActions();
    fireEvent.click(await screen.findByTestId('builderImportJson'));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('imports a manifest into a new connector, name included', async () => {
    render(<ConnectorBuilderPage />);
    importFile(manifestFile(JSON.stringify({ ...MANIFEST, name: 'Imported' })));

    await waitFor(() => {
      expect(breadcrumbName()).toContain('Imported');
    });
    expect(toast.success).toHaveBeenCalledWith('Manifest imported');
  });

  it('keeps the name of an existing connector', async () => {
    await renderExisting();
    importFile(
      manifestFile(
        JSON.stringify({ ...MANIFEST, name: 'OtherName', baseUrl: 'https://other.example.com' })
      )
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Manifest imported. The connector name stays "MyApi".'
      );
    });
    expect(breadcrumbName()).toContain('MyApi');
    expect(breadcrumbName()).not.toContain('OtherName');
  });

  it('reports a file that does not parse and changes nothing', async () => {
    await renderExisting();
    importFile(manifestFile('{ not json', 'broken.json'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not import broken.json')
      );
    });
    expect(breadcrumbName()).toContain('MyApi');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('asks before replacing unsaved changes', async () => {
    render(<ConnectorBuilderPage />);
    importFile(manifestFile(JSON.stringify({ ...MANIFEST, name: 'First' })));
    await waitFor(() => {
      expect(breadcrumbName()).toContain('First');
    });

    importFile(manifestFile(JSON.stringify({ ...MANIFEST, name: 'Second' })));
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(breadcrumbName()).toContain('Second');
    });
  });
});
