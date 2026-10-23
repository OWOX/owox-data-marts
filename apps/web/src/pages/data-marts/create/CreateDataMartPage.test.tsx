import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import CreateDataMartPage from './CreateDataMartPage';

vi.mock('../../../features/data-marts/edit', () => ({
  DataMartProvider: ({ children }: { children: React.ReactNode }) => children,
  DataMartCreateForm: ({ onSuccess }: { onSuccess: (response: { id: string }) => void }) => (
    <form
      onSubmit={event => {
        event.preventDefault();
      }}
      aria-label='Create Data Mart'
    >
      <button
        type='button'
        onClick={() => {
          onSuccess({ id: 'created-mart' });
        }}
      >
        Create Data Mart
      </button>
    </form>
  ),
}));
vi.mock('../../../features/data-storage/shared/model/context', () => ({
  DataStorageProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../features/idp', () => ({
  useAuth: () => ({
    user: { projectId: 'project-1', mcpServerUrl: 'https://project-1.mcp.owox.com/mcp' },
  }),
}));

function Destination() {
  const location = useLocation();
  return <output>{JSON.stringify(location)}</output>;
}

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/ui/project-1/data-marts/create${search}`]}>
      <Routes>
        <Route path='/ui/:projectId/data-marts/create' element={<CreateDataMartPage />} />
        <Route path='/ui/:projectId/data-marts/:id/data-setup' element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CreateDataMartPage assistant entry points', () => {
  it('offers both agents below the form with project context and no draft ID', async () => {
    renderPage();

    const form = screen.getByRole('form', { name: 'Create Data Mart' });
    for (const name of ['ChatGPT', 'Claude']) {
      const button = screen.getByRole('button', { name });
      expect(form.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.keyDown(button, { key: 'Enter' });
      const link = await screen.findByRole('menuitem', { name: 'Open in browser' });
      const prompt = new URL(link.getAttribute('href')!).searchParams.get('q');
      expect(prompt).toContain('Project ID: project-1');
      expect(prompt).toContain('https://project-1.mcp.owox.com/mcp');
      expect(prompt).not.toContain('Data Mart ID:');
      fireEvent.keyDown(link, { key: 'Escape' });
    }
  });

  it.each([
    ['', ''],
    ['?preset=sql', '?preset=sql'],
    ['?connectorName=GoogleSheets', '?preset=connector&connectorName=GoogleSheets'],
    ['?preset=sql&connectorName=GoogleSheets', '?preset=connector&connectorName=GoogleSheets'],
  ])('marks UI creation and preserves the setup flow for %s', (search, expectedSearch) => {
    renderPage(search);
    fireEvent.click(screen.getByRole('button', { name: 'Create Data Mart' }));

    const destination = JSON.parse(screen.getByRole('status').textContent) as {
      pathname: string;
      search: string;
      state: unknown;
    };
    expect(destination.pathname).toBe('/ui/project-1/data-marts/created-mart/data-setup');
    expect(destination.search).toBe(expectedSearch);
    expect(destination.state).toEqual({ createdDataMartId: 'created-mart' });
  });
});
