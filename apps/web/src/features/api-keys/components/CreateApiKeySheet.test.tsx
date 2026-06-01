import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreateApiKeySheet } from './CreateApiKeySheet';

vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <aside role='dialog'>{children}</aside>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role='tooltip'>{children}</div>,
}));

function renderCreateApiKeySheet() {
  return render(<CreateApiKeySheet isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
}

describe('CreateApiKeySheet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the General section for key creation fields', () => {
    renderCreateApiKeySheet();

    expect(screen.getByRole('heading', { name: 'Create API Key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /General/i })).toBeInTheDocument();
    expect(screen.queryByText('Key settings')).not.toBeInTheDocument();
  });

  it('uses the project default label help style', () => {
    renderCreateApiKeySheet();

    const nameLabel = screen.getByText('Name').closest('[data-slot="form-label"]');
    const expiresLabel = screen.getByText('Expires (optional)').closest('[data-slot="form-label"]');

    expect(nameLabel).toHaveClass('justify-between', 'gap-2');
    expect(expiresLabel).toHaveClass('justify-between', 'gap-2');
    expect(nameLabel).not.toHaveClass('justify-start', '[&_button]:opacity-100');
    expect(expiresLabel).not.toHaveClass('justify-start', '[&_button]:opacity-100');
    screen.getAllByRole('button', { name: 'Help information' }).forEach(button => {
      expect(button).toHaveClass('pointer-events-none', 'opacity-0', 'group-hover:opacity-100');
    });
  });

  it('includes a collapsed documentation section with API integration links', () => {
    renderCreateApiKeySheet();

    expect(screen.getByRole('button', { name: /Documentation/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'API Keys' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Documentation/i }));

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'API Keys',
      'owox-ctlCLI tool',
      '@owox/api-clientTypeScript/JavaScript API Client',
      'OpenAPI and Swagger UI',
    ]);
  });
});
