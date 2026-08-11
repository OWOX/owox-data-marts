import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown } from './components/ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders **bold** as <strong>', () => {
    render(<ChatMarkdown text='Added **simple_price** node.' />);
    const strong = screen.getByText('simple_price');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders `code` as <code>', () => {
    render(<ChatMarkdown text='Call `/api/v3/simple/price` next.' />);
    const code = screen.getByText('/api/v3/simple/price');
    expect(code.tagName).toBe('CODE');
  });

  it('renders an ordered list', () => {
    const { container } = render(<ChatMarkdown text={'1. first\n2. second'} />);
    const items = container.querySelectorAll('ol > li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('first');
    expect(items[1].textContent).toBe('second');
  });

  it('renders an unordered list', () => {
    const { container } = render(<ChatMarkdown text={'- one\n- two'} />);
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
  });

  it('keeps soft line breaks inside a paragraph', () => {
    const { container } = render(<ChatMarkdown text={'line one\nline two'} />);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('does not inject HTML from model output', () => {
    const { container } = render(<ChatMarkdown text={'<script>alert(1)</script> **safe**'} />);
    expect(container.querySelector('script')).toBeNull();
    // the raw tag is rendered as visible text, not parsed as markup
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(screen.getByText('safe').tagName).toBe('STRONG');
  });

  it('keeps one ordered list when items carry description paragraphs (no repeated "1.")', () => {
    const text =
      '1. **simple_price** — `/api/v3/simple/price`\n\n   Quick current price.\n\n' +
      '1. **market_chart** — `/api/v3/coins/{id}/market_chart`\n\n   Historical data.';
    const { container } = render(<ChatMarkdown text={text} />);
    // one list of two items — NOT two single-item lists each numbered "1."
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    // each item keeps its description
    expect(container.textContent).toContain('Quick current price.');
    expect(container.textContent).toContain('Historical data.');
  });

  it('renders a GFM pipe table with inline-formatted cells', () => {
    const text =
      '| Node | Endpoint |\n|---|---|\n' +
      '| `simple_price` | /api/v3/simple/price |\n' +
      '| **market_chart** | /coins/{id}/market_chart |';
    const { container } = render(<ChatMarkdown text={text} />);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector('thead th')?.textContent).toBe('Node');
    // inline formatting still applies inside cells
    expect(screen.getByText('simple_price').tagName).toBe('CODE');
    expect(screen.getByText('market_chart').tagName).toBe('STRONG');
  });
});
