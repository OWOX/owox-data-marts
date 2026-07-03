// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataMartRunType } from '../../../shared';
import { TypeIcon } from './TypeIcon';

describe('TypeIcon', () => {
  it('renders a Plug icon for MCP_QUERY runs', () => {
    const { container } = render(<TypeIcon type={DataMartRunType.MCP_QUERY} base64Icon={null} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('text-brand-blue-500');
  });
});
