import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdownHtml } from './components/ChatMarkdownHtml';

describe('ChatMarkdownHtml', () => {
  it('renders a backend-rendered table fragment', () => {
    const html =
      '<table><thead><tr><th>Node</th><th>Endpoint</th></tr></thead>' +
      '<tbody><tr><td>price</td><td>/v3/price</td></tr></tbody></table>';
    const { container } = render(<ChatMarkdownHtml html={html} />);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(screen.getByText('Node')).toBeInTheDocument();
  });

  it('renders inline formatting from the fragment', () => {
    render(<ChatMarkdownHtml html='<p>Added <strong>simple_price</strong> node.</p>' />);
    expect(screen.getByText('simple_price').tagName).toBe('STRONG');
  });
});
