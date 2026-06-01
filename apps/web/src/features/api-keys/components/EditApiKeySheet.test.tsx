import type { ComponentProps, ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditApiKeySheet } from './EditApiKeySheet';
import type { ProjectMemberApiKey } from '../types';
import type { useFlags } from '../../../app/store/hooks/useFlags';
import { formatDateOnly } from '../../../utils';

type UseFlagsResult = ReturnType<typeof useFlags>;

const useFlagsMock = vi.hoisted(() =>
  vi.fn<() => UseFlagsResult>(() => ({
    flags: { PUBLIC_ORIGIN: 'https://public.example.test' },
    callState: 'loaded' as UseFlagsResult['callState'],
  }))
);

vi.mock('../../../app/store/hooks/useFlags', () => ({
  useFlags: useFlagsMock,
}));

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

const apiKey: ProjectMemberApiKey = {
  apiKeyId: 'pmk_1234567890123456789012',
  name: 'Automation',
  expiresAt: '2026-06-01T02:59:00.000Z',
  createdAt: '2026-05-30T18:00:00.000Z',
  lastAuthenticatedAt: null,
};

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function renderEditApiKeySheet(props?: Partial<ComponentProps<typeof EditApiKeySheet>>) {
  return render(
    <EditApiKeySheet
      apiKey={apiKey}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onRevoke={vi.fn()}
      {...props}
    />
  );
}

describe('EditApiKeySheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useFlagsMock.mockReturnValue({
      flags: { PUBLIC_ORIGIN: 'https://public.example.test' },
      callState: 'loaded' as UseFlagsResult['callState'],
    });
  });

  it('opens as an API key details sheet with the same copyable values as the creation dialog', () => {
    renderEditApiKeySheet();

    expect(screen.getByRole('heading', { name: 'API Key Details' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://public.example.test')).toBeInTheDocument();
    expect(screen.getByText('pmk_1234567890123456789012')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Documentation/i }));
    expect(screen.getByRole('link', { name: 'API Keys' })).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/api/api-keys/'
    );
  });

  it('shows lifecycle metadata for the API key', () => {
    renderEditApiKeySheet();

    const generalSection = screen
      .getByRole('button', { name: /General/i })
      .closest('[data-slot="form-section"]');

    expect(generalSection).not.toBeNull();
    expect(generalSection?.textContent).toContain('Created');
    expect(generalSection?.textContent).toContain('Expires');
    expect(generalSection?.textContent).toContain('Last authenticated');
    expect(
      screen.getByText(formatDateOnly(apiKey.expiresAt, { timeZone: 'UTC' }))
    ).toBeInTheDocument();
    expect(screen.queryByText(/02:59/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Never')).toHaveLength(1);
  });

  it('explains expiration dates that expire soon', () => {
    const expiresAt = futureIso(2);

    renderEditApiKeySheet({ apiKey: { ...apiKey, expiresAt } });

    const expirationDate = screen.getByText(formatDateOnly(expiresAt, { timeZone: 'UTC' }));

    expect(expirationDate).toHaveClass('font-medium', 'text-amber-600');
    expect(screen.getByText('This API key expires within 30 days.')).toBeInTheDocument();
  });

  it('does not expose the API Key Secret after the creation dialog is closed', () => {
    renderEditApiKeySheet();

    expect(screen.getByText(/The API key secret is only shown once/i)).toBeInTheDocument();
    expect(screen.queryByText('Secret unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show API Key Secret' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy API Key Secret' })).not.toBeInTheDocument();
  });

  it('shows help controls for each editable and details caption', () => {
    renderEditApiKeySheet();

    expect(screen.getAllByRole('button', { name: 'Help information' })).toHaveLength(7);
    expect(screen.getByText('Friendly label used to identify this API key.')).toBeInTheDocument();
    expect(screen.getByText('When this API key was created.')).toBeInTheDocument();
    expect(screen.getByText(/UTC date when this API key stops working/i)).toBeInTheDocument();
    expect(
      screen.getByText('Most recent successful authentication with this API key.')
    ).toBeInTheDocument();
  });

  it('uses the project default label help style', () => {
    renderEditApiKeySheet();

    const labels = screen
      .getAllByText(
        /^(Name|Expires|Created|Last authenticated|API Origin|API Key ID|API Key Secret)$/
      )
      .map(label => label.closest('[data-slot="form-label"]'))
      .filter(Boolean);

    expect(labels).toHaveLength(7);
    labels.forEach(label => {
      expect(label).toHaveClass('justify-between', 'gap-2');
      expect(label).not.toHaveClass('justify-start', '[&_button]:opacity-100');
    });

    screen.getAllByRole('button', { name: 'Help information' }).forEach(button => {
      expect(button).toHaveClass('pointer-events-none', 'opacity-0', 'group-hover:opacity-100');
    });
  });

  it('uses the same field shell for general metadata and credentials', () => {
    renderEditApiKeySheet();

    const nameField = screen.getByDisplayValue('Automation').closest('[data-slot="form-item"]');
    const apiOriginField = screen
      .getByDisplayValue('https://public.example.test')
      .closest('[data-slot="form-item"]');
    const apiKeyIdField = screen.getByText('API Key ID').closest('[data-slot="form-item"]');
    const secretField = screen.getByText('API Key Secret').closest('[data-slot="form-item"]');

    expect(nameField).not.toBeNull();
    expect(apiOriginField).toHaveClass('group', 'border-border', 'flex', 'flex-col', 'gap-2');
    expect(apiOriginField?.className).toBe(nameField?.className);
    expect(apiKeyIdField?.className).toBe(nameField?.className);
    expect(secretField?.className).toBe(nameField?.className);
  });

  it('orders the general fields like the table after the editable name', () => {
    renderEditApiKeySheet();

    const generalSection = screen
      .getByRole('button', { name: /General/i })
      .closest('[data-slot="form-section"]');
    const labels = Array.from(
      generalSection?.querySelectorAll('[data-slot="form-label"]') ?? []
    ).map(label => label.firstElementChild?.textContent);

    expect(labels).toEqual(['Name', 'Expires', 'Created', 'Last authenticated']);
  });

  it('uses collapsible sidebar sections for details and secondary actions', () => {
    renderEditApiKeySheet();

    expect(screen.getByRole('button', { name: /General/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Credentials/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Documentation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Danger zone/i })).toBeInTheDocument();
    expect(screen.queryByText('Key name')).not.toBeInTheDocument();
    expect(screen.queryByText('Key details')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Details' })).not.toBeInTheDocument();
  });

  it('keeps revoke inside a collapsed danger zone', () => {
    const onRevoke = vi.fn();
    renderEditApiKeySheet({ onRevoke });

    expect(screen.queryByRole('button', { name: 'Revoke API Key' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Danger zone/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke API Key' }));

    expect(onRevoke).toHaveBeenCalledWith(apiKey);
  });

  it('shows related API integration links', () => {
    renderEditApiKeySheet();

    fireEvent.click(screen.getByRole('button', { name: /Documentation/i }));

    const links = screen.getAllByRole('link');

    expect(links.map(link => link.textContent)).toEqual([
      'API Keys',
      'owox-ctlCLI tool',
      '@owox/api-clientTypeScript/JavaScript API Client',
      'OpenAPI and Swagger UI',
    ]);

    expect(screen.getByRole('link', { name: 'owox-ctl CLI tool' })).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/api/owox-ctl/'
    );
    expect(
      screen.getByRole('link', {
        name: '@owox/api-client TypeScript/JavaScript API Client',
      })
    ).toHaveAttribute('href', 'https://docs.owox.com/docs/api/api-client/');
    expect(screen.getByRole('link', { name: 'OpenAPI and Swagger UI' })).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/api/openapi/'
    );

    expect(screen.getByText('owox-ctl')).toHaveClass('font-mono');
    expect(screen.getByText('@owox/api-client')).toHaveClass('font-mono');
    expect(screen.getByText('CLI tool')).not.toHaveClass('text-muted-foreground', 'text-xs');
    expect(screen.getByText('TypeScript/JavaScript API Client')).not.toHaveClass(
      'text-muted-foreground',
      'text-xs'
    );

    links.forEach(link => {
      const icon = link.querySelector('svg');
      const title = link.querySelector('span > span, span > code');

      expect(link).toHaveClass('border', 'bg-white/60');
      expect(link).not.toHaveClass('bg-transparent');
      expect(title).not.toHaveClass('text-primary', 'underline');
      expect(icon).not.toBeNull();
      expect(icon).toHaveClass('opacity-0', 'group-hover:opacity-100');
    });
  });
});
