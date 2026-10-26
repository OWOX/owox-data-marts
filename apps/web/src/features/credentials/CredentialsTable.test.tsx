import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsTable } from './CredentialsTable';
import type { Credential, CredentialDefinition } from './types';

vi.mock('../../shared/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../shared/hooks')>()),
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

const storage = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => {
    storage.clear();
  },
  getItem: key => storage.get(key) ?? null,
  key: index => Array.from(storage.keys())[index] ?? null,
  removeItem: key => storage.delete(key),
  setItem: (key, value) => storage.set(key, value),
};

describe('CredentialsTable', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.clear();
  });

  it('paginates the complete Credentials list', () => {
    renderCredentials(
      Array.from({ length: 16 }, (_, index) =>
        buildCredential({
          id: `credential-${index + 1}`,
          title: `Credential ${String(index + 1).padStart(2, '0')}`,
        })
      )
    );

    expect(screen.getByText('1–15 of 16 rows')).toBeInTheDocument();
    expect(screen.queryByText('Credential 01')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(screen.getByText('Credential 01')).toBeInTheDocument();
    expect(screen.getByText('16–16 of 16 rows')).toBeInTheDocument();
  });

  it('searches by Credential name and provider', () => {
    renderCredentials([
      buildCredential({ title: 'GitHub production' }),
      buildCredential({
        id: 'credential-2',
        title: 'Primary AI',
        definition: buildDefinition({ id: 'anthropic', displayName: 'Anthropic' }),
      }),
    ]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Credentials' }), {
      target: { value: 'Anthropic' },
    });

    expect(screen.getByText('Primary AI')).toBeInTheDocument();
    expect(screen.queryByText('GitHub production')).not.toBeInTheDocument();
  });

  it('shows the icon of each provider', () => {
    renderCredentials([
      buildCredential({
        definition: buildDefinition({
          id: 'snowflake-password',
          displayName: 'Snowflake password',
          icon: 'snowflake',
        }),
      }),
      buildCredential({ id: 'credential-2', title: 'Repo token' }),
    ]);

    const snowflake = screen.getByText('Snowflake password').querySelector('svg');
    expect(snowflake).toHaveAttribute('width', '16');
    expect(snowflake?.getAttribute('class') ?? '').not.toContain('lucide-key-round');
    expect(screen.getByText('GitHub').querySelector('svg')).toHaveClass('lucide-key-round');
  });

  it('lists the consumers in a hover card instead of a raw title', async () => {
    renderCredentials([
      buildCredential({
        usedBy: [
          {
            consumerType: 'storage',
            consumerId: 'storage-1',
            title: 'Warehouse',
            requirementKey: 'storage',
            lastUsedAt: null,
          },
          {
            consumerType: 'storage',
            consumerId: 'storage-2',
            title: 'Lake',
            requirementKey: 'storage',
            lastUsedAt: null,
          },
        ],
      }),
    ]);
    const count = screen.getByText('2 consumers');
    expect(count).not.toHaveAttribute('title');

    fireEvent.pointerEnter(count);
    fireEvent.mouseEnter(count);
    const card = within(
      (await screen.findByRole('link', { name: 'Warehouse' })).closest<HTMLElement>(
        "[data-slot='hover-card-content']"
      )!
    );

    expect(card.getByText('Used by')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Lake' })).toHaveAttribute(
      'href',
      '/ui/project-1/data-storages?id=storage-2'
    );
  });

  it('opens the consumers hover card on keyboard focus', async () => {
    renderCredentials([
      buildCredential({
        usedBy: [
          {
            consumerType: 'storage',
            consumerId: 'storage-1',
            title: 'Warehouse',
            requirementKey: 'storage',
            lastUsedAt: null,
          },
        ],
      }),
    ]);

    act(() => {
      screen.getByRole('button', { name: '1 consumer' }).focus();
    });

    expect(await screen.findByRole('link', { name: 'Warehouse' })).toBeInTheDocument();
  });

  it('keeps the consumers button from opening the editor while the row still opens it', () => {
    const onEdit = vi.fn();
    const credential = buildCredential({
      usedBy: [
        {
          consumerType: 'storage',
          consumerId: 'storage-1',
          title: 'Warehouse',
          requirementKey: 'storage',
          lastUsedAt: null,
        },
      ],
    });
    renderCredentials([credential], '/ui/project-1/credentials', { onEdit });

    fireEvent.click(screen.getByRole('button', { name: '1 consumer' }));
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('GitHub key'));
    expect(onEdit).toHaveBeenCalledWith(credential);
  });

  it('shows a dash and no hover card for a Credential nothing uses', () => {
    renderCredentials([buildCredential({ usedBy: [] })]);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /consumer/ })).toBeNull();
  });

  it('applies persistent Provider filters from the URL', async () => {
    const filter = encodeURIComponent(
      JSON.stringify([{ f: 'provider', o: 'eq', v: ['anthropic'] }])
    );
    renderCredentials(
      [
        buildCredential({ title: 'GitHub production' }),
        buildCredential({
          id: 'credential-2',
          title: 'Primary AI',
          definition: buildDefinition({ id: 'anthropic', displayName: 'Anthropic' }),
        }),
      ],
      `/ui/project-1/credentials?filters=${filter}`
    );

    expect(await screen.findByText('Primary AI')).toBeInTheDocument();
    expect(screen.queryByText('GitHub production')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
  });

  it('places row operations in an actions menu', async () => {
    const onEdit = vi.fn();
    renderCredentials([buildCredential()], '/ui/project-1/credentials', { onEdit });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open actions for GitHub key' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByRole('menuitem', { name: 'Validate' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Replace secret' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'credential-1' }));
  });

  it('hides mutating actions and row editing from a use-only member', () => {
    const onEdit = vi.fn();
    renderCredentials([buildCredential()], '/ui/project-1/credentials', {
      canMaintainCredential: () => false,
      onEdit,
    });

    expect(screen.queryByRole('button', { name: 'Open actions for GitHub key' })).toBeNull();
    fireEvent.click(screen.getByText('GitHub key'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it.each([
    [true, false, 'Shared for use'],
    [false, true, 'Shared for maintenance'],
    [true, true, 'Shared for use and maintenance'],
  ])(
    'shows the use=%s maintenance=%s sharing state',
    (availableForUse, availableForMaintenance, label) => {
      renderCredentials([buildCredential({ availableForUse, availableForMaintenance })]);

      expect(screen.getByText(label)).toBeInTheDocument();
    }
  );
});

function renderCredentials(
  credentials: Credential[],
  path = '/ui/project-1/credentials',
  overrides: Partial<React.ComponentProps<typeof CredentialsTable>> = {}
) {
  const props: React.ComponentProps<typeof CredentialsTable> = {
    credentials,
    canAddCredential: true,
    canMaintainCredential: () => true,
    isValidating: false,
    onAddCredential: vi.fn(),
    onValidate: vi.fn(),
    onReplaceSecret: vi.fn(),
    onEdit: vi.fn(),
    onToggleEnabled: vi.fn(),
    onAcceptDefinition: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path='/ui/:projectId/credentials' element={<CredentialsTable {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

function buildCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'credential-1',
    projectId: 'project-1',
    title: 'GitHub key',
    definition: buildDefinition(),
    secretConfigured: true,
    definitionConsentRequired: false,
    enabled: true,
    availableForUse: true,
    availableForMaintenance: false,
    validationState: 'verified',
    validationMessage: null,
    validatedAt: '2026-08-31T06:00:00.000Z',
    lastUsedAt: null,
    aiModelMappings: null,
    aiModelMappingModes: null,
    ownerUsers: [
      {
        userId: 'user-1',
        fullName: 'Andrii Marchenko',
        email: 'andrii@example.com',
        avatar: null,
      },
    ],
    contexts: [{ id: 'context-1', name: 'Default' }],
    usedBy: [],
    createdAt: '2026-08-31T06:00:00.000Z',
    modifiedAt: '2026-08-31T06:00:00.000Z',
    ...overrides,
  };
}

function buildDefinition(overrides: Partial<CredentialDefinition> = {}): CredentialDefinition {
  return {
    id: 'github',
    source: 'builtin',
    displayName: 'GitHub',
    description: 'GitHub token',
    documentationUrl: null,
    secretLabel: 'Personal access token',
    origins: ['https://api.github.com'],
    supportsAi: false,
    ai: null,
    compatibilityLine: null,
    ...overrides,
  };
}
