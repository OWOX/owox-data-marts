import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';

// Keep the real route configuration and redirect behavior; isolate page rendering.
vi.mock('../layouts/MainLayout', () => ({ default: () => <Outlet /> }));
vi.mock('../features/my-account/MyAccountPage', () => ({
  MyAccountPage: ({ section = 'profile' }: { section?: string }) => <h1>Account {section}</h1>,
}));

import routes from './index';

describe('personal account routes', () => {
  it.each(['/ui/me/api-keys', '/ui/me/unknown/nested', '/UI/ME/Unknown'])(
    'redirects %s to the profile inside the account namespace',
    async path => {
      const router = createMemoryRouter(routes, { initialEntries: [path] });
      render(<RouterProvider router={router} />);

      expect(await screen.findByRole('heading', { name: 'Account profile' })).toBeVisible();
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/ui/me/profile');
      });
      expect(router.state.historyAction).toBe('REPLACE');
      expect(router.state.matches.some(match => match.params.projectId === 'me')).toBe(false);
    }
  );
});
