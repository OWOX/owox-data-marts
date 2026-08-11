import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParameterPicker } from './ParameterPicker';

let mockParameters: Record<string, unknown> = {};
vi.mock('../../shared/model/hooks/useBuilder', () => ({
  useBuilder: () => ({ manifest: { parameters: mockParameters } }),
}));

describe('ParameterPicker', () => {
  beforeEach(() => {
    mockParameters = {};
  });

  it('opens the popover and inserts the chosen parameter template', () => {
    mockParameters = { ApiKey: {}, Token: {} };
    const onInsert = vi.fn();
    render(<ParameterPicker onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert parameter' })); // open the { } picker
    fireEvent.click(screen.getByRole('button', { name: /insert parameter token/i }));
    expect(onInsert).toHaveBeenCalledWith('{{ parameters.Token }}');
  });

  it('renders nothing when there are no parameters', () => {
    mockParameters = {};
    const { container } = render(<ParameterPicker onInsert={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
