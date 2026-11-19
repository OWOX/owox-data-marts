// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mcpServerUrl: undefined as string | undefined,
  canEdit: true,
  trackEvent: vi.fn(),
}));

vi.mock('../../../../../idp', () => ({
  useAuth: () => ({ user: { mcpServerUrl: mocks.mcpServerUrl } }),
  useRole: () => ({ canEdit: mocks.canEdit }),
}));
vi.mock('../../../../../../utils/data-layer', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => path, projectId: 'project-1' }),
}));

import { EmptyDataMartsState } from './EmptyDataMartsState';

const headings = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

const renderState = () =>
  render(
    <MemoryRouter>
      <EmptyDataMartsState />
    </MemoryRouter>
  );

const leftHeadings = ['Connect a data source', 'Use existing SQL, Table or start from scratch'];

describe('EmptyDataMartsState', () => {
  beforeEach(() => {
    mocks.mcpServerUrl = undefined;
    mocks.canEdit = true;
    mocks.trackEvent.mockClear();
  });

  it('shows a separate Set it up with AI block after the left column when MCP is available', () => {
    mocks.mcpServerUrl = 'https://mcp.owox.com/mcp';
    renderState();

    expect(headings()).toEqual([...leftHeadings, 'Set it up with AI']);
    const block = screen.getByRole('heading', { name: 'Set it up with AI' }).closest('section');
    expect(block).not.toBeNull();
    const inBlock = within(block!);
    expect(inBlock.queryByText('Connect a data source')).toBeNull();
    expect(
      inBlock.getByText('Your AI assistant creates the Data Mart with you, step by step.')
    ).toBeInTheDocument();
    expect(inBlock.getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
    const href = decodeURIComponent(
      inBlock.getByRole('link', { name: 'Open in Claude' }).getAttribute('href') ?? ''
    );
    expect(href).toContain('set up my first Data Mart in project project-1');
    expect(inBlock.getByRole('link', { name: 'Open in ChatGPT' })).toBeInTheDocument();
    expect(screen.queryByText('Opens Claude or ChatGPT with a ready prompt')).toBeNull();
  });

  it('reports the empty project placement once and tracks the open links', () => {
    mocks.mcpServerUrl = 'https://mcp.owox.com/mcp';
    renderState();

    const shown = mocks.trackEvent.mock.calls.filter(([p]) => p.event === 'mcp_promo_shown');
    expect(shown).toHaveLength(1);
    expect(shown[0][0]).toMatchObject({ label: 'empty_project', context: 'setup' });
    fireEvent.click(screen.getByRole('link', { name: 'Open in Claude' }));
    fireEvent.click(screen.getByRole('link', { name: 'Open in ChatGPT' }));
    const clicked = mocks.trackEvent.mock.calls.filter(([p]) => p.event === 'mcp_promo_clicked');
    expect(clicked.map(([p]) => [p.label, p.value])).toEqual([
      ['empty_project', 'claude'],
      ['empty_project', 'chatgpt'],
    ]);
  });

  it('shows no block and sends no event to a viewer', () => {
    mocks.mcpServerUrl = 'https://mcp.owox.com/mcp';
    mocks.canEdit = false;
    renderState();

    expect(headings()).toEqual(leftHeadings);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('looks as before without an MCP server url', () => {
    renderState();

    expect(headings()).toEqual(leftHeadings);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });
});
