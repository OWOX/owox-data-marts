import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorBuilderPage } from './ConnectorBuilderPage';

const create = vi.fn();
const getById = vi.fn();

vi.mock('../shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    saveDraft = vi.fn();
    publish = vi.fn();
    getVersion = vi.fn();
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function addNode() {
  render(<ConnectorBuilderPage />);
  fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
  fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'items' } });
  fireEvent.click(screen.getByRole('button', { name: /add node/i }));
}

describe('Async retriever builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: 'def-1', name: 'MyApi', title: 'My API' });
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 1, status: 'draft', publishedAt: null }],
    });
  });

  it('toggling to Async swaps in the Async job section and hides sync-only sections', () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Async' }));
    // Request/Async job is now a CollapsibleCard whose title is text, not an accordion button.
    expect(screen.getByText('Async job')).toBeInTheDocument();
    expect(screen.queryByText('Request')).toBeNull();
    // Sections are CollapsibleCards now — their titles are text, not accordion buttons.
    expect(screen.queryByText('Record selector')).toBeNull();
    expect(screen.queryByText('Pagination')).toBeNull();
    expect(screen.queryByText('Partition')).toBeNull();
    expect(screen.queryByText('Error handling')).toBeNull();
    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getByText('Incremental')).toBeInTheDocument();
  });

  it('authors an async retriever (submit/poll/download) and saves it', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Async' }));
    // Async job fields are inside a CollapsibleCard (content always mounted) — no expand needed.

    fireEvent.change(screen.getByPlaceholderText('/jobs'), { target: { value: '/jobs' } });
    fireEvent.change(screen.getByPlaceholderText('data.id'), { target: { value: 'data.id' } });
    fireEvent.change(screen.getByPlaceholderText('/jobs/{{ job.id }}'), {
      target: { value: '/jobs/{{ job.id }}' },
    });
    fireEvent.change(screen.getByPlaceholderText('data.status'), {
      target: { value: 'data.status' },
    });
    fireEvent.change(screen.getByPlaceholderText('COMPLETE'), { target: { value: 'COMPLETE' } });
    fireEvent.change(screen.getByPlaceholderText('data.result_url'), {
      target: { value: 'data.result_url' },
    });
    fireEvent.change(screen.getByPlaceholderText('rows'), { target: { value: 'rows' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.retriever).toMatchObject({
      type: 'async',
      submit: { method: 'GET', path: '/jobs', jobIdPath: ['data', 'id'] },
      poll: {
        method: 'GET',
        path: '/jobs/{{ job.id }}',
        statusPath: ['data', 'status'],
        readyValue: 'COMPLETE',
        resultUrlPath: ['data', 'result_url'],
        backoff: { maxAttempts: 180, initialMs: 3000, maxMs: 15000 },
      },
      download: { recordPath: ['rows'] },
    });
  });

  it('toggling back to Sync removes the retriever and restores Request', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Async' }));
    expect(screen.queryByText('Request')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(screen.getByText('Request')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.retriever).toBeUndefined();
  });

  it('clicking Async again keeps the async retriever the author already configured', async () => {
    addNode();
    fireEvent.click(screen.getByRole('button', { name: 'Async' }));
    fireEvent.change(screen.getByPlaceholderText('/jobs'), { target: { value: '/reports' } });
    fireEvent.change(screen.getByPlaceholderText('data.id'), { target: { value: 'report.id' } });

    // Re-selecting the mode that is already active is a no-op, not "start over".
    fireEvent.click(screen.getByRole('button', { name: 'Async' }));

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0][0].manifest.nodes.items.retriever.submit).toMatchObject({
      path: '/reports',
      jobIdPath: ['report', 'id'],
    });
  });

  it('toggling to Async clears a pre-existing partitionRouter so the engine does not reject the manifest', async () => {
    addNode();
    // Enable partitioning while in Sync mode (the Partition block is always mounted).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable partitioning' }));
    // Confirm partitionRouter is now present in the form (the "on" badge appears)
    expect(screen.getByText('on')).toBeInTheDocument();

    // Now toggle to Async
    fireEvent.click(screen.getByRole('button', { name: 'Async' }));

    // Save to capture the manifest
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });

    const node = create.mock.calls[0][0].manifest.nodes.items;
    expect(node.partitionRouter).toBeUndefined();
    expect(node.retriever?.type).toBe('async');
  });
});
