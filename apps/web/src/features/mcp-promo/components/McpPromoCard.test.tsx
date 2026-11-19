import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/data-layer', () => ({ trackEvent }));

const authMock = vi.hoisted(() => ({
  value: { user: { mcpServerUrl: 'https://mcp.example.com' } as { mcpServerUrl?: string } | null },
}));
const roleMock = vi.hoisted(() => ({ canEdit: true }));
vi.mock('../../idp', () => ({ useAuth: () => authMock.value, useRole: () => roleMock }));

import { useRef } from 'react';
import { chatGptNewChatUrl, claudeNewChatUrl } from '../prompts';
import { CollapsibleCardContext } from '../../../shared/components/CollapsibleCard/CollapsibleCardContext';
import { McpPromoCard } from './McpPromoCard';

const events = (event: string) =>
  trackEvent.mock.calls.filter(([payload]) => payload.event === event).map(([payload]) => payload);

const card = (
  <McpPromoCard
    placement='data_setup_card'
    mcpPart='setup'
    prompt='Do the thing.'
    title='Finish with AI'
  />
);

const row = () => screen.getByRole('button', { name: /Finish with AI/ });

describe('McpPromoCard', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    authMock.value = { user: { mcpServerUrl: 'https://mcp.example.com' } };
    roleMock.canEdit = true;
  });

  it('renders one row with the title and the subtitle, and tracks shown once', () => {
    render(card);
    expect(row()).toHaveTextContent('Finish with AI');
    expect(row()).toHaveTextContent('Opens Claude or ChatGPT with a ready prompt');
    expect(screen.queryByText('Do the thing.')).toBeNull();
    expect(events('mcp_promo_shown')).toHaveLength(1);
  });

  it('opens the dialog with the prompt from the row and tracks details', () => {
    render(card);
    fireEvent.click(row());
    const dialog = screen.getByRole('dialog', { name: 'Finish with AI' });
    expect(dialog).toHaveAccessibleDescription(
      'Paste the prompt into a new chat, or open the chat with it.'
    );
    expect(within(dialog).getByText('Do the thing.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open in Claude' })).toHaveAttribute(
      'href',
      claudeNewChatUrl('Do the thing.')
    );
    expect(events('mcp_promo_clicked').map(payload => payload.value)).toEqual(['details']);
    expect(events('mcp_promo_shown')).toHaveLength(1);
  });

  it('renders nothing without an MCP server url', () => {
    authMock.value = { user: {} };
    const { container } = render(card);
    expect(container.innerHTML).toBe('');
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('renders no setup row for a viewer', () => {
    roleMock.canEdit = false;
    const { container } = render(card);
    expect(container.innerHTML).toBe('');
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('renders a consumption row for a viewer', () => {
    roleMock.canEdit = false;
    render(
      <McpPromoCard
        placement='overview_card'
        mcpPart='consumption'
        prompt='Ask it.'
        title='Ask with AI'
      />
    );
    expect(screen.getByRole('button', { name: /Ask with AI/ })).toBeInTheDocument();
  });

  it('sends shown once across remounts with a shownRef from the parent', () => {
    function Parent({ mounted }: { mounted: boolean }) {
      const shownRef = useRef(false);
      return mounted ? (
        <McpPromoCard
          placement='connector_builder'
          mcpPart='setup'
          prompt='Do the thing.'
          title='Build with AI'
          shownRef={shownRef}
        />
      ) : null;
    }
    const { rerender } = render(<Parent mounted />);
    rerender(<Parent mounted={false} />);
    rerender(<Parent mounted />);
    expect(events('mcp_promo_shown')).toHaveLength(1);
  });

  it('renders the section variant as one line with links to the chats, not a dialog', () => {
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    render(
      <form
        onSubmit={e => {
          onSubmit(e.nativeEvent);
        }}
      >
        <McpPromoCard
          variant='section'
          placement='storage_sheet'
          mcpPart='setup'
          prompt='Do the thing.'
          title='Set it up with your AI assistant'
        />
      </form>
    );
    expect(screen.getByText('Or finish this in')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Copy prompt')).toBeNull();
    const claude = screen.getByRole('link', { name: /^Claude/ });
    const chatGpt = screen.getByRole('link', { name: /^ChatGPT/ });
    expect(claude).toHaveAttribute('href', claudeNewChatUrl('Do the thing.'));
    expect(claude).toHaveAttribute('target', '_blank');
    expect(chatGpt).toHaveAttribute('href', chatGptNewChatUrl('Do the thing.'));
    expect(chatGpt).toHaveAttribute('target', '_blank');

    fireEvent.click(claude);
    fireEvent.click(chatGpt);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(events('mcp_promo_clicked').map(payload => [payload.label, payload.value])).toEqual([
      ['storage_sheet', 'claude'],
      ['storage_sheet', 'chatgpt'],
    ]);
    expect(events('mcp_promo_shown')).toHaveLength(1);
  });

  it('words the section variant of a maintain placement as a change', () => {
    render(
      <McpPromoCard
        variant='section'
        placement='storage_sheet_maintain'
        mcpPart='setup'
        prompt='Keep it.'
        title='Maintain it with your AI assistant'
      />
    );
    expect(screen.getByText('Or change this in')).toBeInTheDocument();
    expect(screen.queryByText('Or finish this in')).toBeNull();
  });

  it('renders the hint variant as a sentence whose links do not reach the parent card', () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <McpPromoCard
          variant='hint'
          placement='data_setup_storage_hint'
          mcpPart='setup'
          prompt='Help me.'
          title='Set it up with your AI assistant'
        />
      </div>
    );
    expect(screen.getByText(/Not sure what goes where\? Let/)).toBeInTheDocument();
    expect(screen.getByText(/walk you through it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Claude (opens in a new tab)' })).toHaveAttribute(
      'href',
      claudeNewChatUrl('Help me.')
    );

    fireEvent.click(screen.getByRole('link', { name: 'ChatGPT (opens in a new tab)' }));

    expect(onCardClick).not.toHaveBeenCalled();
    expect(events('mcp_promo_clicked').map(payload => payload.value)).toEqual(['chatgpt']);
    expect(events('mcp_promo_shown')[0]).toMatchObject({
      label: 'data_setup_storage_hint',
      context: 'setup',
    });
  });

  it('sends shown for a hint in a collapsed card only when the card opens', () => {
    const hint = (isCollapsed: boolean) => (
      <CollapsibleCardContext.Provider
        value={{ isCollapsed, collapsible: true, handleCollapse: vi.fn() }}
      >
        <McpPromoCard
          variant='hint'
          placement='data_setup_storage_hint'
          mcpPart='setup'
          prompt='Help me.'
          title='Set it up with your AI assistant'
        />
      </CollapsibleCardContext.Provider>
    );
    const { rerender } = render(hint(true));
    expect(events('mcp_promo_shown')).toHaveLength(0);

    rerender(hint(false));
    expect(events('mcp_promo_shown')).toHaveLength(1);
  });
});
