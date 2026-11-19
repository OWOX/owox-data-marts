import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/data-layer', () => ({ trackEvent }));

const authMock = vi.hoisted(() => ({
  value: { user: { mcpServerUrl: 'https://mcp.example.com' } as { mcpServerUrl?: string } | null },
}));
vi.mock('../../idp', () => ({ useAuth: () => authMock.value }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import {
  CHATGPT_PLUGIN_URL,
  CLAUDE_DIRECTORY_URL,
  chatGptNewChatUrl,
  claudeNewChatUrl,
  setupGuideUrl,
} from '..';
import { AiAssistantHandoff } from './AiAssistantHandoff';

const prompt = 'Use the OWOX Data Marts connector to help me.';
const writeText = vi.fn();

function labels(container: HTMLElement) {
  return Array.from(container.querySelectorAll('a, button')).map(el => el.textContent.trim());
}

describe('AiAssistantHandoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    trackEvent.mockClear();
    toastError.mockClear();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    authMock.value = { user: { mcpServerUrl: 'https://mcp.example.com' } };
  });

  it('renders the prompt mode cells in grid order with the prompt', () => {
    const { container } = render(
      <AiAssistantHandoff
        mode='prompt'
        prompt={prompt}
        placement='overview_card'
        mcpPart='consumption'
      />
    );
    expect(labels(container)).toEqual([
      'Open in Claude',
      'MCP setup guide',
      'Open in ChatGPT',
      'Copy prompt',
    ]);
    expect(screen.getByText(prompt)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in Claude' }).getAttribute('href')).toBe(
      claudeNewChatUrl(prompt)
    );
    expect(screen.getByRole('link', { name: 'Open in Claude' }).getAttribute('rel')).toBe(
      'noopener noreferrer'
    );
  });

  it('renders the connector mode links and the shared server url', () => {
    const { container } = render(
      <AiAssistantHandoff mode='connector' placement='reports_promo' mcpPart='consumption' />
    );
    expect(labels(container)).toEqual([
      'Add to Claude',
      'MCP setup guide',
      'Add to ChatGPT',
      'Copy MCP URL',
    ]);
    expect(screen.getByRole('link', { name: 'Add to Claude' }).getAttribute('href')).toBe(
      CLAUDE_DIRECTORY_URL
    );
    expect(screen.getByRole('link', { name: 'Add to ChatGPT' }).getAttribute('href')).toBe(
      CHATGPT_PLUGIN_URL
    );
    expect(screen.getByText('https://mcp.owox.com/mcp')).toBeTruthy();
  });

  it('tracks every action', async () => {
    render(
      <AiAssistantHandoff
        mode='prompt'
        prompt={prompt}
        placement='overview_card'
        mcpPart='consumption'
      />
    );
    for (const name of ['Open in Claude', 'MCP setup guide', 'Open in ChatGPT', 'Copy prompt']) {
      fireEvent.click(screen.getByRole(name === 'Copy prompt' ? 'button' : 'link', { name }));
    }
    await waitFor(() => screen.getByText('Copied'));
    const actions = trackEvent.mock.calls
      .filter(([payload]) => payload.event === 'mcp_promo_clicked')
      .map(([payload]) => payload.value);
    expect(actions).toEqual(['claude', 'docs', 'chatgpt', 'copy']);
    expect(writeText).toHaveBeenCalledWith(prompt);
  });

  it('shows Copied after a successful copy', async () => {
    render(<AiAssistantHandoff mode='connector' placement='reports_promo' mcpPart='consumption' />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy MCP URL' }));
    await waitFor(() => screen.getByText('Copied'));
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
    expect(writeText).toHaveBeenCalledWith('https://mcp.owox.com/mcp');
  });

  it('shows an error toast and no Copied when the clipboard refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    writeText.mockRejectedValue(new Error('denied'));
    render(
      <AiAssistantHandoff
        mode='prompt'
        prompt={prompt}
        placement='overview_card'
        mcpPart='consumption'
      />
    );
    expect(screen.getByText(prompt)).toHaveClass('line-clamp-3');
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Could not copy. Select the text and copy it.');
    });
    expect(screen.queryByText('Copied')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not copy. Select the text and copy it.'
    );
    expect(screen.getByText(prompt)).not.toHaveClass('line-clamp-3');
  });

  describe("layout='dialog'", () => {
    const props = {
      mode: 'prompt',
      prompt,
      placement: 'storage_sheet',
      mcpPart: 'setup',
      layout: 'dialog',
    } as const;
    const clicked = () =>
      trackEvent.mock.calls
        .filter(([payload]) => payload.event === 'mcp_promo_clicked')
        .map(([payload]) => payload.value);

    it('shows the Claude tab first with its link, the copy button, the full prompt and the guide', () => {
      render(<AiAssistantHandoff {...props} />);
      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Claude', 'ChatGPT']);
      expect(screen.getByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('link', { name: 'Open in Claude' })).toHaveAttribute(
        'href',
        claudeNewChatUrl(prompt)
      );
      expect(screen.getByRole('link', { name: 'Open in Claude' })).toHaveAttribute(
        'target',
        '_blank'
      );
      expect(screen.queryByRole('link', { name: 'Open in ChatGPT' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
      expect(screen.getByText(prompt)).not.toHaveClass('line-clamp-3');
      expect(screen.getByRole('link', { name: 'MCP setup guide' })).toHaveAttribute(
        'href',
        setupGuideUrl('storage_sheet')
      );
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('shows the ChatGPT link on the ChatGPT tab', () => {
      render(<AiAssistantHandoff {...props} />);
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'ChatGPT' }));
      expect(screen.getByRole('link', { name: 'Open in ChatGPT' })).toHaveAttribute(
        'href',
        chatGptNewChatUrl(prompt)
      );
      expect(screen.queryByRole('link', { name: 'Open in Claude' })).toBeNull();
    });

    it('tracks every action', async () => {
      render(<AiAssistantHandoff {...props} />);
      fireEvent.click(screen.getByRole('link', { name: 'Open in Claude' }));
      fireEvent.click(screen.getByRole('link', { name: 'MCP setup guide' }));
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'ChatGPT' }));
      fireEvent.click(screen.getByRole('link', { name: 'Open in ChatGPT' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
      await waitFor(() => screen.getByText('Copied'));
      expect(clicked()).toEqual(['claude', 'docs', 'chatgpt', 'copy']);
      expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
      expect(writeText).toHaveBeenCalledWith(prompt);
    });

    it('shows an error toast and no Copied when the clipboard refuses', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      writeText.mockRejectedValue(new Error('denied'));
      render(<AiAssistantHandoff {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
      await waitFor(() => {
        expect(toastError).toHaveBeenCalledWith('Could not copy. Select the text and copy it.');
      });
      expect(screen.queryByText('Copied')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Could not copy. Select the text and copy it.'
      );
    });
  });

  describe('block layout', () => {
    const props = {
      mode: 'prompt',
      prompt,
      placement: 'empty_project',
      mcpPart: 'setup',
      layout: 'block',
    } as const;

    it('shows both open links and Copy prompt, tracks them, and hides the prompt', async () => {
      const { container } = render(<AiAssistantHandoff {...props} />);
      expect(labels(container)).toEqual(['Open in Claude', 'Open in ChatGPT', 'Copy prompt']);
      expect(screen.getByRole('link', { name: 'Open in ChatGPT' })).toHaveAttribute(
        'href',
        chatGptNewChatUrl(prompt)
      );
      expect(screen.queryByText(prompt)).toBeNull();
      expect(trackEvent.mock.calls[0][0]).toMatchObject({
        event: 'mcp_promo_shown',
        label: 'empty_project',
      });

      fireEvent.click(screen.getByRole('link', { name: 'Open in Claude' }));
      fireEvent.click(screen.getByRole('link', { name: 'Open in ChatGPT' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
      await waitFor(() => screen.getByText('Copied'));

      expect(
        trackEvent.mock.calls
          .filter(([payload]) => payload.event === 'mcp_promo_clicked')
          .map(([payload]) => payload.value)
      ).toEqual(['claude', 'chatgpt', 'copy']);
      expect(writeText).toHaveBeenCalledWith(prompt);
    });

    it('shows the prompt to select after a failed copy', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      writeText.mockRejectedValue(new Error('denied'));
      render(<AiAssistantHandoff {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
      await waitFor(() => {
        expect(screen.getByText(prompt)).toBeInTheDocument();
      });
      expect(toastError).toHaveBeenCalledWith('Could not copy. Select the text and copy it.');
    });
  });

  it('renders nothing without an MCP server url', () => {
    authMock.value = { user: {} };
    const { container } = render(
      <AiAssistantHandoff mode='prompt' prompt={prompt} placement='empty_project' mcpPart='setup' />
    );
    expect(container.innerHTML).toBe('');
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
