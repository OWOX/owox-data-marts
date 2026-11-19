import { Info } from 'lucide-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CollapsibleCard } from './CollapsibleCard';
import { CollapsibleCardContent } from './CollapsibleCardContent';
import { CollapsibleCardHeader } from './CollapsibleCardHeader';
import { CollapsibleCardHeaderTitle } from './CollapsibleCardHeaderTitle';

describe('CollapsibleCard accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks collapsed content inert and names the header button by the card title', () => {
    localStorage.setItem('collapsed-card-x', 'true');
    const { container, getByRole } = render(
      <CollapsibleCard collapsible name='x'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Info}>Title</CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <p>Body</p>
        </CollapsibleCardContent>
      </CollapsibleCard>
    );
    expect(container.querySelector('[inert]')).toContainHTML('Body');

    const toggle = getByRole('button', { name: 'Title' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(container.querySelector('[inert]')).toBeNull();
    expect(toggle).toHaveAccessibleName('Title');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
