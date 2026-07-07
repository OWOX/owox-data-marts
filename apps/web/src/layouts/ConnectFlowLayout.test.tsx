import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ConnectFlowLayout } from './ConnectFlowLayout';

vi.mock('./ProjectAuthGuards', () => ({
  ProjectAuthGuards: ({ children }: { children: ReactNode }) => (
    <div data-testid='project-auth-guards'>{children}</div>
  ),
}));

describe('ConnectFlowLayout', () => {
  it('renders the routed page through the guard chain, with no sidebar chrome', () => {
    render(
      <MemoryRouter initialEntries={['/ui/project-1/connect/google-sheets']}>
        <Routes>
          <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
            <Route path='google-sheets' element={<div>Connect Google Sheets page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const guards = screen.getByTestId('project-auth-guards');
    expect(guards).toContainElement(screen.getByText('Connect Google Sheets page'));
    expect(screen.queryByTestId('full-app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
