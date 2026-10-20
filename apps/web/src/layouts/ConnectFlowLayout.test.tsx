import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import { MemoryRouter, Route, Routes } from 'react-router';
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

  it('shows toasts raised by its pages', async () => {
    render(
      <MemoryRouter initialEntries={['/ui/project-1/connect/google-sheets']}>
        <Routes>
          <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
            <Route path='google-sheets' element={<div>Connect Google Sheets page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    act(() => {
      toast.error('Something went wrong on our side. Request id: r-1');
    });

    expect(
      await screen.findByText('Something went wrong on our side. Request id: r-1')
    ).toBeTruthy();
  });
});
