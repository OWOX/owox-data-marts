import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CustomConnectorIcon } from './CustomConnectorIcon';

describe('CustomConnectorIcon', () => {
  // Blocks marks every plugin in the sidebar, so a custom connector drawn with it read as a
  // plugin in the Data Mart's connector picker. The Connectors menu item is a plug.
  it('draws the plug of the Connectors menu, not the blocks that mark plugins', () => {
    render(<CustomConnectorIcon />);

    const icon = screen.getByRole('img', { name: 'Custom connector' });
    expect(icon).toHaveClass('lucide-plug');
    expect(icon).not.toHaveClass('lucide-blocks');
  });
});
