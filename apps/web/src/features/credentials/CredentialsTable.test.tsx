import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsTable } from './CredentialsTable';
import type { Credential, CredentialDefinition } from './types';

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
