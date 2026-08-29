import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModelCanvasExportMenu } from './ModelCanvasExportMenu';

// Radix dropdowns need real pointer events — render everything inline instead
// (the established pattern for menu tests in this codebase).
vi.mock('@owox/ui/components/dropdown-menu', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children?: ReactNode;
      onSelect?: () => void;
      'data-testid'?: string;
    }) => (
      <button type='button' data-testid={props['data-testid']} onClick={onSelect}>
        {children}
      </button>
    ),
  };
});

describe('ModelCanvasExportMenu', () => {
  it('offers every canvas export format and reports the picked one', () => {
    const onExport = vi.fn();
    render(<ModelCanvasExportMenu onExport={onExport} />);

    expect(screen.getByTestId('export-canvas')).toBeInTheDocument();
    expect(screen.getByText('SVG image')).toBeInTheDocument();
    expect(screen.getByText('PNG image')).toBeInTheDocument();
    expect(screen.getByText('JSON file')).toBeInTheDocument();
    expect(screen.getByText('OKF Markdown files')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('export-canvas-svg'));
    fireEvent.click(screen.getByTestId('export-canvas-okf'));
    expect(onExport.mock.calls.map(call => call[0])).toEqual(['svg', 'okf']);
  });
});
