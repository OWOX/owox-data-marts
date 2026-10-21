import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { ContextBadges } from './ContextBadges';

describe('ContextBadges', () => {
  it('draws each context with its icon, or the default one when none is picked', () => {
    render(
      <TooltipProvider>
        <ContextBadges
          contexts={[
            { id: 'ctx-1', name: 'Marketing', icon: 'purchases' },
            { id: 'ctx-2', name: 'Finance', icon: null },
            { id: 'ctx-3', name: 'Sales' },
          ]}
        />
      </TooltipProvider>
    );

    const badgeOf = (name: string) => screen.getByText(name).parentElement;
    expect(badgeOf('Marketing')?.querySelector('svg')).toHaveClass('lucide-shopping-cart');
    expect(badgeOf('Finance')?.querySelector('svg')).toHaveClass('lucide-tags');
    expect(badgeOf('Sales')?.querySelector('svg')).toHaveClass('lucide-tags');
  });

  it('draws nothing without contexts', () => {
    const { container } = render(<ContextBadges contexts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
